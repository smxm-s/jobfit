package com.jobfit.match.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class BatchMatchItem {

    private Long jobId;
    private BigDecimal score;
    private String stage;
    private List<String> hitSkills;
    private List<String> missSkills;
    private String rejectReason;
    private Boolean fallback;
}
