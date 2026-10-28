package com.jobfit.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.jobfit.agent.dto.AgentConfigDTO;
import com.jobfit.agent.dto.BootstrapVO;
import com.jobfit.agent.dto.DeviceVO;
import com.jobfit.agent.dto.PairCodeVO;
import com.jobfit.agent.dto.PairRequest;
import com.jobfit.agent.dto.PairResult;
import com.jobfit.agent.entity.AgentConfig;
import com.jobfit.agent.mapper.AgentConfigMapper;
import com.jobfit.apply.ApplyService;
import com.jobfit.common.BizException;
import com.jobfit.common.ErrorCode;
import com.jobfit.config.AppProperties;
import com.jobfit.job.entity.Job;
import com.jobfit.job.mapper.JobMapper;
import com.jobfit.resume.ResumeService;
import com.jobfit.resume.entity.Resume;
import com.jobfit.resume.entity.ResumeVersion;
import com.jobfit.resume.mapper.ResumeMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class AgentService {

    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final Set<String> APPLY_LEVELS = Set.of("L1", "L2", "L3");

    private final AgentConfigMapper configMapper;
    private final AgentDeviceService deviceService;
    private final PairCodeStore pairCodeStore;
    private final ResumeMapper resumeMapper;
    private final ResumeService resumeService;
    private final JobMapper jobMapper;
    private final ApplyService applyService;
    private final AppProperties properties;
    private final SecureRandom random = new SecureRandom();

    public AgentConfigDTO getConfig(Long userId) {
        AgentConfig config = configMapper.selectOne(new LambdaQueryWrapper<AgentConfig>()
                .eq(AgentConfig::getUserId, userId)
                .last("LIMIT 1"));
        return config == null ? defaultConfig() : toDTO(config);
    }

    public AgentConfigDTO saveConfig(Long userId, AgentConfigDTO dto) {
        validate(dto);
        if (dto.getResumeVersionId() != null) {
            resumeService.requireVersionOwned(userId, dto.getResumeVersionId());
        }
        AgentConfig config = configMapper.selectOne(new LambdaQueryWrapper<AgentConfig>()
                .eq(AgentConfig::getUserId, userId)
                .last("LIMIT 1"));
        boolean insert = config == null;
        if (insert) {
            config = new AgentConfig();
            config.setUserId(userId);
        }
        applyDTO(config, dto);
        config.setUpdatedAt(LocalDateTime.now());
        if (insert) {
            configMapper.insert(config);
        } else {
            configMapper.updateById(config);
        }
        return toDTO(config);
    }

    public PairCodeVO createPairCode(Long userId) {
        String raw = randomCode(8);
        String code = raw.substring(0, 4) + "-" + raw.substring(4);
        pairCodeStore.save(code, userId);
        return new PairCodeVO(code, 600);
    }

    public PairResult pair(PairRequest request) {
        String code = request.getCode().trim().toUpperCase();
        Long userId = pairCodeStore.consume(code);
        if (userId == null) {
            throw new BizException(ErrorCode.PAIR_CODE_INVALID, "配对码无效或已过期");
        }
        return deviceService.create(userId, request.getDeviceName());
    }

    public List<DeviceVO> devices(Long userId) {
        return deviceService.list(userId);
    }

    public void revokeDevice(Long userId, Long deviceId) {
        deviceService.revoke(userId, deviceId);
    }

    public BootstrapVO bootstrap(Long userId) {
        AgentConfigDTO config = getConfig(userId);
        BootstrapVO vo = new BootstrapVO();
        vo.setConfig(config);
        vo.setRemainingQuota(applyService.remainingQuota(userId, config.getDailyLimit()));
        vo.setJdHashes(recentJdHashes(userId));
        vo.setLatestVersion(latestVersion(userId));
        return vo;
    }

    private BootstrapVO.LatestVersion latestVersion(Long userId) {
        Resume resume = resumeMapper.selectOne(new LambdaQueryWrapper<Resume>()
                .eq(Resume::getUserId, userId)
                .orderByDesc(Resume::getUpdatedAt)
                .orderByDesc(Resume::getId)
                .last("LIMIT 1"));
        if (resume == null) {
            return null;
        }
        ResumeVersion version = resumeService.latestVersionOrNull(resume.getId());
        if (version == null) {
            return null;
        }
        BootstrapVO.LatestVersion vo = new BootstrapVO.LatestVersion();
        vo.setVersionId(version.getId());
        vo.setResumeId(resume.getId());
        vo.setResumeTitle(resume.getTitle());
        vo.setVersionNo(version.getVersionNo());
        vo.setCreatedAt(version.getCreatedAt());
        return vo;
    }

    private List<String> recentJdHashes(Long userId) {
        QueryWrapper<Job> wrapper = new QueryWrapper<>();
        wrapper.select("jd_hash")
                .eq("user_id", userId)
                .orderByDesc("collected_at")
                .last("LIMIT 500");
        List<Object> values = jobMapper.selectObjs(wrapper);
        LinkedHashSet<String> hashes = new LinkedHashSet<>();
        for (Object value : values) {
            if (value != null) {
                hashes.add(String.valueOf(value));
            }
        }
        return List.copyOf(hashes);
    }

    private AgentConfigDTO defaultConfig() {
        AgentConfigDTO dto = new AgentConfigDTO();
        dto.setScoreThreshold(new BigDecimal("0.700"));
        dto.setApplyLevel("L1");
        dto.setDailyLimit(properties.getApply().getDailyLimitDefault());
        dto.setBatchSize(20);
        dto.setActiveHours("09:00-21:00");
        return dto;
    }

    private void validate(AgentConfigDTO dto) {
        if (dto.getApplyLevel() != null && !APPLY_LEVELS.contains(dto.getApplyLevel())) {
            throw new BizException(ErrorCode.PARAM, "applyLevel 只能是 L1/L2/L3");
        }
        if (dto.getScoreThreshold() != null
                && (dto.getScoreThreshold().compareTo(BigDecimal.ZERO) < 0
                || dto.getScoreThreshold().compareTo(BigDecimal.ONE) > 0)) {
            throw new BizException(ErrorCode.PARAM, "scoreThreshold 需在 0-1 之间");
        }
        if (dto.getDailyLimit() != null && (dto.getDailyLimit() < 1 || dto.getDailyLimit() > 1000)) {
            throw new BizException(ErrorCode.PARAM, "dailyLimit 需在 1-1000 之间");
        }
        if (dto.getBatchSize() != null && (dto.getBatchSize() < 1 || dto.getBatchSize() > 100)) {
            throw new BizException(ErrorCode.PARAM, "batchSize 需在 1-100 之间");
        }
        if (dto.getSalaryMin() != null && dto.getSalaryMin() < 0) {
            throw new BizException(ErrorCode.PARAM, "salaryMin 不能为负数");
        }
    }

    private void applyDTO(AgentConfig config, AgentConfigDTO dto) {
        config.setCities(csv(dto.getCities()));
        config.setKeyword(dto.getKeyword());
        config.setSalaryMin(dto.getSalaryMin());
        config.setSalaryMax(dto.getSalaryMax());
        config.setExpCodes(csv(dto.getExpCodes()));
        config.setDegreeCodes(csv(dto.getDegreeCodes()));
        config.setExcludeWords(csv(dto.getExcludeWords()));
        config.setScoreThreshold(dto.getScoreThreshold() == null ? new BigDecimal("0.700") : dto.getScoreThreshold());
        config.setApplyLevel(dto.getApplyLevel() == null ? "L1" : dto.getApplyLevel());
        config.setDailyLimit(dto.getDailyLimit() == null ? properties.getApply().getDailyLimitDefault() : dto.getDailyLimit());
        config.setBatchSize(dto.getBatchSize() == null ? 20 : dto.getBatchSize());
        config.setActiveHours(dto.getActiveHours() == null || dto.getActiveHours().isBlank()
                ? "09:00-21:00" : dto.getActiveHours());
        config.setResumeVersionId(dto.getResumeVersionId());
        config.setGreetingTemplate(dto.getGreetingTemplate());
    }

    private AgentConfigDTO toDTO(AgentConfig config) {
        AgentConfigDTO dto = new AgentConfigDTO();
        dto.setCities(splitCsv(config.getCities()));
        dto.setKeyword(config.getKeyword());
        dto.setSalaryMin(config.getSalaryMin());
        dto.setSalaryMax(config.getSalaryMax());
        dto.setExpCodes(splitCsv(config.getExpCodes()));
        dto.setDegreeCodes(splitCsv(config.getDegreeCodes()));
        dto.setExcludeWords(splitCsv(config.getExcludeWords()));
        dto.setScoreThreshold(config.getScoreThreshold());
        dto.setApplyLevel(config.getApplyLevel());
        dto.setDailyLimit(config.getDailyLimit());
        dto.setBatchSize(config.getBatchSize());
        dto.setActiveHours(config.getActiveHours());
        dto.setResumeVersionId(config.getResumeVersionId());
        dto.setGreetingTemplate(config.getGreetingTemplate());
        dto.setUpdatedAt(config.getUpdatedAt());
        return dto;
    }

    private static String csv(List<String> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        return values.stream()
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .collect(java.util.stream.Collectors.joining(","));
    }

    private static List<String> splitCsv(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private String randomCode(int length) {
        StringBuilder builder = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            builder.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
        }
        return builder.toString();
    }
}
