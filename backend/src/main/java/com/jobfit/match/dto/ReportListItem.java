package com.jobfit.match.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class ReportListItem {

    private Long id;
    private Long jobId;
    private String jobTitle;
    private String company;
    private BigDecimal totalScore;
    private String algoVersion;
    private LocalDateTime createdAt;
}
