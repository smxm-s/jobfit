package com.jobfit.job.dto;

import com.jobfit.job.entity.JobRequirement;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class JobDetailVO {

    private Long id;
    private String title;
    private String company;
    private String city;
    private String salaryRange;
    private String expReq;
    private String degreeReq;
    private String tags;
    private String jdSummary;
    private String jobUrl;
    private String source;
    private String jdHash;
    private String status;
    private LocalDateTime collectedAt;
    private List<JobRequirement> requirements;
    private ReportBrief latestReport;

    @Data
    public static class ReportBrief {
        private Long reportId;
        private BigDecimal totalScore;
        private LocalDateTime createdAt;
    }
}
