package com.jobfit.job.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 岗位列表行（附带最新报告分数与是否已投递）。
 */
@Data
public class JobListItem {

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
    private LocalDateTime createdAt;
    private BigDecimal latestScore;
    private Integer appliedFlag;
}
