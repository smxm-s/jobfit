package com.jobfit.match;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jobfit.agent.entity.AgentConfig;
import com.jobfit.agent.mapper.AgentConfigMapper;
import com.jobfit.common.BizException;
import com.jobfit.common.ErrorCode;
import com.jobfit.common.PageResult;
import com.jobfit.config.AlgoClient;
import com.jobfit.config.AppProperties;
import com.jobfit.job.JobService;
import com.jobfit.job.entity.Job;
import com.jobfit.job.entity.JobRequirement;
import com.jobfit.job.mapper.JobMapper;
import com.jobfit.job.mapper.JobRequirementMapper;
import com.jobfit.match.dto.BatchMatchItem;
import com.jobfit.match.dto.EvidenceVO;
import com.jobfit.match.dto.MatchBatchRequest;
import com.jobfit.match.dto.ReportDetailVO;
import com.jobfit.match.dto.ReportListItem;
import com.jobfit.match.entity.MatchEvidence;
import com.jobfit.match.entity.MatchReport;
import com.jobfit.match.mapper.MatchEvidenceMapper;
import com.jobfit.match.mapper.MatchReportMapper;
import com.jobfit.resume.ResumeService;
import com.jobfit.resume.dto.BlockVO;
import com.jobfit.resume.entity.ResumeVersion;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class MatchService {

    private static final Pattern SALARY_RANGE = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*[-~]\\s*(\\d+(?:\\.\\d+)?)\\s*[kK]");
    private static final Pattern SALARY_SINGLE = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*[kK]");

    private final MatchReportMapper reportMapper;
    private final MatchEvidenceMapper evidenceMapper;
    private final JobRequirementMapper requirementMapper;
    private final JobMapper jobMapper;
    private final AgentConfigMapper configMapper;
    private final ResumeService resumeService;
    private final JobService jobService;
    private final AlgoClient algoClient;
    private final ObjectMapper objectMapper;
    private final AppProperties properties;

    /**
     * 单岗位精算：算法服务不可用时返回 4001，不落报告。
     */
    public Long match(Long userId, Long jobId, Long versionId) {
        Job job = jobService.requireOwned(userId, jobId);
        ResumeVersion version = resumeService.requireVersionOwned(userId, versionId);
        JsonNode schema = readSchema(version);
        List<BlockVO> blocks = resumeService.blocksOf(version.getId());
        List<JobRequirement> requirements = requirementMapper.selectList(
                new LambdaQueryWrapper<JobRequirement>()
                        .eq(JobRequirement::getJobId, jobId)
                        .orderByAsc(JobRequirement::getId));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("resumeSchema", schema);
        body.put("blocks", blocks);
        body.put("jobParsed", jobCard(job));
        body.put("jobRequirements", requirements.stream().map(this::requirementMap).toList());
        body.put("options", Map.of("weights", properties.getMatch().getWeights()));

        JsonNode response = algoClient.post("/internal/match", body);
        if (!response.path("total").isNumber()) {
            throw new BizException(ErrorCode.ALGO_UNAVAILABLE, "算法服务返回结果异常");
        }

        MatchReport report = new MatchReport();
        report.setResumeVersionId(version.getId());
        report.setJobId(job.getId());
        report.setTotalScore(response.get("total").decimalValue());
        report.setSSkill(numberOrNull(response, "sSkill"));
        report.setSSem(numberOrNull(response, "sSem"));
        report.setSExp(numberOrNull(response, "sExp"));
        report.setSEdu(numberOrNull(response, "sEdu"));
        report.setWeightsJson(writeJson(properties.getMatch().getWeights()));
        report.setAlgoVersion(text(response, "algoVersion", "1.0.0"));
        report.setInputSnapshot(writeJson(snapshot(version, job)));
        report.setCreatedAt(LocalDateTime.now());
        reportMapper.insert(report);

        saveEvidences(report.getId(), response.path("evidences"));
        return report.getId();
    }

    /**
     * 批量打分：服务端粗筛后调算法 /internal/match/batch；不可用时本地兜底保证有分数。
     */
    public List<BatchMatchItem> batch(Long userId, MatchBatchRequest request) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        if (request.getJobIds() != null) {
            for (Long id : request.getJobIds()) {
                if (id != null) {
                    ids.add(id);
                }
            }
        }
        if (ids.isEmpty()) {
            throw new BizException(ErrorCode.PARAM, "jobIds 不能为空");
        }
        if (ids.size() > 200) {
            throw new BizException(ErrorCode.PARAM, "单次最多 200 条岗位");
        }

        ResumeVersion version = resumeService.requireVersionOwned(userId, request.getVersionId());
        JsonNode schema = readSchema(version);
        List<BlockVO> blocks = resumeService.blocksOf(version.getId());

        List<Job> jobs = jobMapper.selectList(new LambdaQueryWrapper<Job>()
                .in(Job::getId, ids)
                .eq(Job::getUserId, userId));
        Map<Long, Job> jobMap = new HashMap<>();
        jobs.forEach(job -> jobMap.put(job.getId(), job));

        AgentConfig config = configMapper.selectOne(new LambdaQueryWrapper<AgentConfig>()
                .eq(AgentConfig::getUserId, userId)
                .last("LIMIT 1"));

        Map<Long, BatchMatchItem> resultMap = new HashMap<>();
        List<Job> candidates = new ArrayList<>();
        for (Long id : ids) {
            Job job = jobMap.get(id);
            if (job == null) {
                resultMap.put(id, rejected(id, "NOT_FOUND"));
                continue;
            }
            String reason = coarseReject(job, config);
            if (reason != null) {
                resultMap.put(id, rejected(id, reason));
                continue;
            }
            candidates.add(job);
        }

        if (!candidates.isEmpty()) {
            Map<Long, BatchMatchItem> algoResult = callBatchAlgo(schema, blocks, candidates);
            for (Job job : candidates) {
                BatchMatchItem item = algoResult.get(job.getId());
                if (item == null) {
                    item = LocalMatcher.score(schema, job);
                } else {
                    item.setFallback(false);
                }
                resultMap.put(job.getId(), item);
            }
        }

        List<BatchMatchItem> result = new ArrayList<>(ids.size());
        for (Long id : ids) {
            result.add(resultMap.get(id));
        }
        return result;
    }

    public ReportDetailVO reportDetail(Long userId, Long reportId) {
        MatchReport report = reportMapper.selectById(reportId);
        if (report == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "报告不存在");
        }
        Job job = jobMapper.selectById(report.getJobId());
        if (job == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "报告对应岗位不存在");
        }
        if (!userId.equals(job.getUserId())) {
            throw new BizException(ErrorCode.NOT_OWNED, "无权查看该报告");
        }

        List<MatchEvidence> evidences = evidenceMapper.selectList(new LambdaQueryWrapper<MatchEvidence>()
                .eq(MatchEvidence::getReportId, reportId)
                .orderByAsc(MatchEvidence::getId));

        Map<Long, String> reqTexts = new HashMap<>();
        List<Long> reqIds = evidences.stream()
                .map(MatchEvidence::getReqId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (!reqIds.isEmpty()) {
            for (JobRequirement requirement : requirementMapper.selectBatchIds(reqIds)) {
                reqTexts.put(requirement.getId(), requirement.getRawText());
            }
        }

        List<EvidenceVO> evidenceVOs = new ArrayList<>();
        int hardMissed = 0;
        for (MatchEvidence evidence : evidences) {
            EvidenceVO vo = new EvidenceVO();
            vo.setId(evidence.getId());
            vo.setDimension(evidence.getDimension());
            vo.setReqId(evidence.getReqId());
            vo.setReqText(evidence.getReqId() == null ? null : reqTexts.get(evidence.getReqId()));
            vo.setResumeBlockId(evidence.getResumeBlockId());
            vo.setHit(evidence.getHit() != null && evidence.getHit() == 1);
            vo.setScore(evidence.getScore());
            vo.setNote(evidence.getNote());
            evidenceVOs.add(vo);
            if (!vo.isHit() && "SKILL".equals(evidence.getDimension())
                    && evidence.getNote() != null && evidence.getNote().contains("HARD")) {
                hardMissed++;
            }
        }

        List<String> risks = new ArrayList<>();
        if (hardMissed > 0) {
            risks.add("硬性技能缺失 " + hardMissed + " 项");
        }

        ReportDetailVO vo = new ReportDetailVO();
        vo.setId(report.getId());
        vo.setJobId(job.getId());
        vo.setJobTitle(job.getTitle());
        vo.setCompany(job.getCompany());
        vo.setTotalScore(report.getTotalScore());
        vo.setSubScores(subScores(report));
        vo.setWeights(weights(report.getWeightsJson()));
        vo.setAlgoVersion(report.getAlgoVersion());
        vo.setInputSnapshot(readJson(report.getInputSnapshot()));
        vo.setEvidences(evidenceVOs);
        vo.setRisks(risks);
        vo.setCreatedAt(report.getCreatedAt());
        return vo;
    }

    public PageResult<ReportListItem> listReports(Long userId, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        List<ReportListItem> list = reportMapper.selectPage(userId, (safePage - 1) * safeSize, safeSize);
        long total = reportMapper.countPage(userId);
        return new PageResult<>(list, total, safePage, safeSize);
    }

    private Map<Long, BatchMatchItem> callBatchAlgo(JsonNode schema, List<BlockVO> blocks, List<Job> candidates) {
        List<Map<String, Object>> cards = new ArrayList<>();
        for (Job job : candidates) {
            Map<String, Object> card = new LinkedHashMap<>();
            card.put("jobId", job.getId());
            card.put("card", jobCard(job));
            card.put("jdSummary", job.getJdSummary());
            cards.add(card);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("resumeSchema", schema);
        body.put("blocks", blocks);
        body.put("jobs", cards);
        body.put("weights", properties.getMatch().getWeights());
        body.put("topN", Math.min(10, candidates.size()));

        JsonNode response;
        try {
            response = algoClient.post("/internal/match/batch", body);
        } catch (BizException e) {
            log.warn("批量打分算法不可用，使用本地兜底: {}", e.getMessage());
            return new LinkedHashMap<>();
        }

        Map<Long, BatchMatchItem> result = new LinkedHashMap<>();
        if (!response.isArray()) {
            return result;
        }
        for (JsonNode node : response) {
            Long jobId = longOrNull(node, "jobId");
            if (jobId == null) {
                continue;
            }
            BatchMatchItem item = new BatchMatchItem();
            item.setJobId(jobId);
            item.setScore(numberOrNull(node, "score"));
            item.setStage(text(node, "stage", "COARSE"));
            item.setHitSkills(stringList(node, "hitSkills"));
            item.setMissSkills(stringList(node, "missSkills"));
            item.setRejectReason(text(node, "rejectReason", null));
            item.setFallback(false);
            result.put(jobId, item);
        }
        return result;
    }

    private String coarseReject(Job job, AgentConfig config) {
        if (config == null) {
            return null;
        }
        List<String> excludes = splitWords(config.getExcludeWords());
        if (!excludes.isEmpty()) {
            String haystack = ((job.getTitle() == null ? "" : job.getTitle()) + " "
                    + (job.getCompany() == null ? "" : job.getCompany()) + " "
                    + (job.getJdSummary() == null ? "" : job.getJdSummary())).toLowerCase();
            for (String word : excludes) {
                if (haystack.contains(word.toLowerCase())) {
                    return "EXCLUDED";
                }
            }
        }

        List<String> cities = splitWords(config.getCities());
        if (!cities.isEmpty() && job.getCity() != null) {
            boolean matched = cities.stream()
                    .anyMatch(city -> job.getCity().contains(city) || city.contains(job.getCity()));
            if (!matched) {
                return "MISMATCH";
            }
        }

        if (config.getSalaryMin() != null) {
            Integer lower = salaryLower(job.getSalaryRange());
            if (lower != null && lower < config.getSalaryMin()) {
                return "MISMATCH";
            }
        }
        return null;
    }

    private Integer salaryLower(String range) {
        if (range == null || range.isBlank()) {
            return null;
        }
        Matcher matcher = SALARY_RANGE.matcher(range);
        if (matcher.find()) {
            return (int) Math.round(Double.parseDouble(matcher.group(1)));
        }
        Matcher single = SALARY_SINGLE.matcher(range);
        if (single.find()) {
            return (int) Math.round(Double.parseDouble(single.group(1)));
        }
        return null;
    }

    private BatchMatchItem rejected(Long jobId, String reason) {
        BatchMatchItem item = new BatchMatchItem();
        item.setJobId(jobId);
        item.setScore(BigDecimal.ZERO);
        item.setStage("COARSE");
        item.setHitSkills(List.of());
        item.setMissSkills(List.of());
        item.setRejectReason(reason);
        item.setFallback(false);
        return item;
    }

    private Map<String, Object> jobCard(Job job) {
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("title", job.getTitle());
        card.put("company", job.getCompany());
        card.put("city", job.getCity());
        card.put("salary", job.getSalaryRange());
        card.put("exp", job.getExpReq());
        card.put("degree", job.getDegreeReq());
        card.put("tags", job.getTags());
        card.put("jdSummary", job.getJdSummary());
        return card;
    }

    private Map<String, Object> requirementMap(JobRequirement requirement) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", requirement.getId());
        map.put("reqType", requirement.getReqType());
        map.put("category", requirement.getCategory());
        map.put("rawText", requirement.getRawText());
        map.put("skillId", requirement.getSkillId());
        map.put("weight", requirement.getWeight());
        return map;
    }

    private void saveEvidences(Long reportId, JsonNode nodes) {
        if (nodes == null || !nodes.isArray()) {
            return;
        }
        for (JsonNode node : nodes) {
            MatchEvidence evidence = new MatchEvidence();
            evidence.setReportId(reportId);
            evidence.setDimension(text(node, "dimension", "OTHER"));
            evidence.setReqId(longOrNull(node, "reqId"));
            evidence.setResumeBlockId(longOrNull(node, "resumeBlockId"));
            JsonNode hit = node.get("hit");
            boolean hitFlag = hit != null && (hit.isBoolean() ? hit.asBoolean() : hit.asInt() == 1);
            evidence.setHit(hitFlag ? 1 : 0);
            evidence.setScore(numberOrNull(node, "score"));
            evidence.setNote(cut(text(node, "note", null), 500));
            evidenceMapper.insert(evidence);
        }
    }

    private Map<String, Object> snapshot(ResumeVersion version, Job job) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("resumeVersionId", version.getId());
        map.put("resumeVersionNo", version.getVersionNo());
        map.put("jobId", job.getId());
        map.put("jdHash", job.getJdHash());
        map.put("dictVersion", "1.0.0");
        map.put("model", "bge-small-zh-v1.5");
        return map;
    }

    private Map<String, BigDecimal> subScores(MatchReport report) {
        Map<String, BigDecimal> map = new LinkedHashMap<>();
        map.put("skill", report.getSSkill());
        map.put("sem", report.getSSem());
        map.put("exp", report.getSExp());
        map.put("edu", report.getSEdu());
        return map;
    }

    private Map<String, BigDecimal> weights(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, BigDecimal>>() {
            });
        } catch (Exception e) {
            return Map.of();
        }
    }

    private JsonNode readSchema(ResumeVersion version) {
        try {
            return objectMapper.readTree(version.getSchemaJson());
        } catch (Exception e) {
            throw new BizException(ErrorCode.INTERNAL, "简历结构数据异常");
        }
    }

    private JsonNode readJson(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new BizException(ErrorCode.INTERNAL, "报告快照序列化失败");
        }
    }

    private BigDecimal numberOrNull(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isNumber() ? value.decimalValue() : null;
    }

    private Long longOrNull(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isNumber() ? value.asLong() : null;
    }

    private String text(JsonNode node, String field, String defaultValue) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? defaultValue : value.asText();
    }

    private List<String> stringList(JsonNode node, String field) {
        JsonNode value = node.get(field);
        List<String> result = new ArrayList<>();
        if (value != null && value.isArray()) {
            for (JsonNode item : value) {
                result.add(item.asText());
            }
        }
        return result;
    }

    private List<String> splitWords(String text) {
        List<String> words = new ArrayList<>();
        if (text == null || text.isBlank()) {
            return words;
        }
        for (String part : text.split("[,，]")) {
            String word = part.trim();
            if (!word.isEmpty()) {
                words.add(word);
            }
        }
        return words;
    }

    private String cut(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
