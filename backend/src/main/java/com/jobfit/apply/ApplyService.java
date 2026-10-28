package com.jobfit.apply;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.jobfit.agent.entity.AgentConfig;
import com.jobfit.agent.mapper.AgentConfigMapper;
import com.jobfit.apply.dto.ApplicationReportRequest;
import com.jobfit.apply.dto.ApplyReportResult;
import com.jobfit.apply.entity.Application;
import com.jobfit.apply.mapper.ApplicationMapper;
import com.jobfit.common.BizException;
import com.jobfit.common.ErrorCode;
import com.jobfit.common.PageResult;
import com.jobfit.job.entity.Job;
import com.jobfit.job.mapper.JobMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ApplyService {

    private static final Set<String> STATUS = Set.of("SENT", "SKIPPED", "FAILED");
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ApplicationMapper applicationMapper;
    private final JobMapper jobMapper;
    private final AgentConfigMapper configMapper;

    public ApplyReportResult report(Long userId, ApplicationReportRequest request) {
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new BizException(ErrorCode.PARAM, "items 不能为空");
        }
        int recorded = 0;
        for (ApplicationReportRequest.Item item : request.getItems()) {
            if (item.getJobId() == null) {
                throw new BizException(ErrorCode.PARAM, "jobId 不能为空");
            }
            String status = item.getStatus() == null ? "" : item.getStatus().toUpperCase();
            if (!STATUS.contains(status)) {
                throw new BizException(ErrorCode.PARAM, "status 只能是 SENT/SKIPPED/FAILED");
            }
            Job job = jobMapper.selectById(item.getJobId());
            if (job == null || !userId.equals(job.getUserId())) {
                continue;
            }
            LocalDateTime appliedAt = parseTime(item.getAppliedAt());
            if (appliedAt == null && "SENT".equals(status)) {
                appliedAt = LocalDateTime.now();
            }

            Application application = applicationMapper.selectOne(new LambdaQueryWrapper<Application>()
                    .eq(Application::getUserId, userId)
                    .eq(Application::getJobId, item.getJobId())
                    .last("LIMIT 1"));
            if (application == null) {
                application = new Application();
                application.setUserId(userId);
                application.setJobId(item.getJobId());
                application.setChannel("EXTENSION");
                application.setApplyLevel(item.getApplyLevel());
                application.setStatus(status);
                application.setSkipReason(item.getSkipReason());
                application.setFailReason(item.getFailReason());
                application.setAppliedAt(appliedAt);
                applicationMapper.insert(application);
            } else {
                application.setApplyLevel(item.getApplyLevel());
                application.setStatus(status);
                application.setSkipReason(item.getSkipReason());
                application.setFailReason(item.getFailReason());
                application.setAppliedAt(appliedAt);
                applicationMapper.updateById(application);
            }
            recorded++;
        }
        int dailyLimit = dailyLimit(userId);
        return new ApplyReportResult(recorded, remainingQuota(userId, dailyLimit));
    }

    public PageResult<Application> list(Long userId, int page, int size) {
        Page<Application> result = applicationMapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<Application>()
                        .eq(Application::getUserId, userId)
                        .orderByDesc(Application::getCreatedAt));
        return new PageResult<>(result.getRecords(), result.getTotal(), page, size);
    }

    public int countTodaySent(Long userId) {
        LocalDateTime start = LocalDate.now().atStartOfDay();
        Long count = applicationMapper.selectCount(new LambdaQueryWrapper<Application>()
                .eq(Application::getUserId, userId)
                .eq(Application::getStatus, "SENT")
                .ge(Application::getAppliedAt, start)
                .lt(Application::getAppliedAt, start.plusDays(1)));
        return count == null ? 0 : count.intValue();
    }

    public int remainingQuota(Long userId, int dailyLimit) {
        return Math.max(0, dailyLimit - countTodaySent(userId));
    }

    private int dailyLimit(Long userId) {
        AgentConfig config = configMapper.selectOne(new LambdaQueryWrapper<AgentConfig>()
                .eq(AgentConfig::getUserId, userId)
                .last("LIMIT 1"));
        return config == null || config.getDailyLimit() == null ? 30 : config.getDailyLimit();
    }

    private LocalDateTime parseTime(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(text.trim(), FORMATTER);
        } catch (Exception e) {
            throw new BizException(ErrorCode.PARAM, "appliedAt 格式应为 yyyy-MM-dd HH:mm:ss");
        }
    }
}
