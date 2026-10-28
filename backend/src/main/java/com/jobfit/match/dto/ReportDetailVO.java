package com.jobfit.match.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
public class ReportDetailVO {

    private Long id;
    private Long jobId;
    private String jobTitle;
    private String company;
    private BigDecimal totalScore;
    private Map<String, BigDecimal> subScores;
    private Map<String, BigDecimal> weights;
    private String algoVersion;
    private JsonNode inputSnapshot;
    private List<EvidenceVO> evidences;
    private List<String> risks;
    private LocalDateTime createdAt;
}
