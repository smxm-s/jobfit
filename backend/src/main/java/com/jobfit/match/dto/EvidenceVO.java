package com.jobfit.match.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class EvidenceVO {

    private Long id;
    private String dimension;
    private Long reqId;
    private String reqText;
    private Long resumeBlockId;
    private boolean hit;
    private BigDecimal score;
    private String note;
}
