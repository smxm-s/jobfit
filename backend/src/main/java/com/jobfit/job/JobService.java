package com.jobfit.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.jobfit.agent.entity.AgentConfig;
import com.jobfit.agent.mapper.AgentConfigMapper;
import com.jobfit.common.BizException;
import com.jobfit.common.ErrorCode;
import com.jobfit.common.HashUtil;
import com.jobfit.common.PageResult;
import com.jobfit.job.dto.IngestRequest;
import com.jobfit.job.dto.IngestResponse;
import com.jobfit.job.dto.JobDetailVO;
import com.jobfit.job.dto.JobListItem;
import com.jobfit.job.entity.Job;
import com.jobfit.job.entity.JobRequirement;
import com.jobfit.job.mapper.JobMapper;
import com.jobfit.job.mapper.JobRequirementMapper;
import com.jobfit.match.entity.MatchReport;
import com.jobfit.match.mapper.MatchReportMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class JobService {

    private final JobMapper jobMapper;
    private final JobRequirementMapper requirementMapper;
    private final AgentConfigMapper configMapper;
    private final MatchReportMapper reportMapper;

    /**
     * 批量上报：jd_hash 去重 + 排除词过滤（标题/公司/摘要）。
     */
    public IngestResponse ingest(Long userId, IngestRequest request) {
        if (request == null || request.getJobs() == null || request.getJobs().isEmpty()) {
            throw new BizException(ErrorCode.PARAM, "jobs 不能为空");
        }
        AgentConfig config = configMapper.selectOne(new LambdaQueryWrapper<AgentConfig>()
                .eq(AgentConfig::getUserId, userId)
                .last("LIMIT 1"));
        List<String> excludeWords = splitWords(config == null ? null : config.getExcludeWords());

        List<IngestResponse.Accepted> accepted = new ArrayList<>();
        List<IngestResponse.Rejected> rejected = new ArrayList<>();
        Map<String, Long> batchHashes = new HashMap<>();

        for (IngestRequest.JobItem item : request.getJobs()) {
            if (item == null) {
                continue;
            }
            String title = trim(item.getTitle());
            String jobUrl = trim(item.getJobUrl());
            String rawHash = trim(item.getJdHash());
            String jdHash = rawHash != null && rawHash.length() == 64
                    ? rawHash
                    : HashUtil.sha256Hex((title == null ? "" : title)
                    + (item.getCompany() == null ? "" : item.getCompany().trim())
                    + (jobUrl == null ? "" : jobUrl));
            if (title == null || jobUrl == null) {
                rejected.add(new IngestResponse.Rejected(jdHash, "INVALID", null));
                continue;
            }

            String word = matchExclude(excludeWords, title, item.getCompany(), item.getJdSummary());
            if (word != null) {
                rejected.add(new IngestResponse.Rejected(jdHash, "EXCLUDED", word));
                continue;
            }

            Long batchJobId = batchHashes.get(jdHash);
            if (batchJobId != null) {
                accepted.add(new IngestResponse.Accepted(jdHash, batchJobId, true));
                continue;
            }

            Job existing = jobMapper.selectOne(new LambdaQueryWrapper<Job>()
                    .eq(Job::getUserId, userId)
                    .eq(Job::getJdHash, jdHash)
                    .last("LIMIT 1"));
            if (existing != null) {
                jobMapper.update(null, new UpdateWrapper<Job>()
                        .eq("id", existing.getId())
                        .set("collected_at", LocalDateTime.now())
                        .set("status", "ACTIVE"));
                batchHashes.put(jdHash, existing.getId());
                accepted.add(new IngestResponse.Accepted(jdHash, existing.getId(), true));
                continue;
            }

            Job job = new Job();
            job.setUserId(userId);
            job.setTitle(cut(title, 100));
            job.setCompany(cut(item.getCompany(), 100));
            job.setCity(cut(item.getCity(), 50));
            job.setSalaryRange(cut(item.getSalary(), 50));
            job.setExpReq(cut(item.getExp(), 50));
            job.setDegreeReq(cut(item.getDegree(), 50));
            job.setTags(cut(item.getTags() == null ? null : String.join(",", item.getTags()), 500));
            job.setJdSummary(item.getJdSummary());
            job.setJobUrl(cut(jobUrl, 500));
            job.setSource("EXTENSION");
            job.setJdHash(jdHash);
            job.setStatus("ACTIVE");
            job.setCollectedAt(LocalDateTime.now());
            jobMapper.insert(job);

            batchHashes.put(jdHash, job.getId());
            accepted.add(new IngestResponse.Accepted(jdHash, job.getId(), false));
        }
        return new IngestResponse(accepted, rejected);
    }

    public PageResult<JobListItem> list(Long userId, int page, int size, String keyword, String city,
                                        BigDecimal minScore, Boolean applied) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        String kw = blankToNull(keyword);
        String ct = blankToNull(city);
        Integer appliedFlag = applied == null ? null : (applied ? 1 : 0);
        List<JobListItem> list = jobMapper.selectListPage(userId, kw, ct, minScore, appliedFlag,
                (safePage - 1) * safeSize, safeSize);
        long total = jobMapper.countListPage(userId, kw, ct, minScore, appliedFlag);
        return new PageResult<>(list, total, safePage, safeSize);
    }

    public JobDetailVO detail(Long userId, Long jobId) {
        Job job = requireOwned(userId, jobId);
        List<JobRequirement> requirements = requirementMapper.selectList(
                new LambdaQueryWrapper<JobRequirement>()
                        .eq(JobRequirement::getJobId, jobId)
                        .orderByAsc(JobRequirement::getId));

        JobDetailVO vo = new JobDetailVO();
        vo.setId(job.getId());
        vo.setTitle(job.getTitle());
        vo.setCompany(job.getCompany());
        vo.setCity(job.getCity());
        vo.setSalaryRange(job.getSalaryRange());
        vo.setExpReq(job.getExpReq());
        vo.setDegreeReq(job.getDegreeReq());
        vo.setTags(job.getTags());
        vo.setJdSummary(job.getJdSummary());
        vo.setJobUrl(job.getJobUrl());
        vo.setSource(job.getSource());
        vo.setJdHash(job.getJdHash());
        vo.setStatus(job.getStatus());
        vo.setCollectedAt(job.getCollectedAt());
        vo.setRequirements(requirements);

        MatchReport report = reportMapper.selectOne(new LambdaQueryWrapper<MatchReport>()
                .eq(MatchReport::getJobId, jobId)
                .orderByDesc(MatchReport::getCreatedAt)
                .orderByDesc(MatchReport::getId)
                .last("LIMIT 1"));
        if (report != null) {
            JobDetailVO.ReportBrief brief = new JobDetailVO.ReportBrief();
            brief.setReportId(report.getId());
            brief.setTotalScore(report.getTotalScore());
            brief.setCreatedAt(report.getCreatedAt());
            vo.setLatestReport(brief);
        }
        return vo;
    }

    public Job requireOwned(Long userId, Long jobId) {
        Job job = jobMapper.selectById(jobId);
        if (job == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "岗位不存在或已下线");
        }
        if (!userId.equals(job.getUserId())) {
            throw new BizException(ErrorCode.NOT_OWNED, "岗位不属于当前用户");
        }
        return job;
    }

    private String matchExclude(List<String> words, String title, String company, String summary) {
        if (words.isEmpty()) {
            return null;
        }
        String haystack = ((title == null ? "" : title) + " "
                + (company == null ? "" : company) + " "
                + (summary == null ? "" : summary)).toLowerCase();
        for (String word : words) {
            if (haystack.contains(word.toLowerCase())) {
                return word;
            }
        }
        return null;
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

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String cut(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
