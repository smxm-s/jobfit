package com.jobfit.resume.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class ResumeVersionVO {

    private Long versionId;
    private Long resumeId;
    private Integer versionNo;
    private String source;
    private BigDecimal parseConfidence;
    private JsonNode schema;
    private List<BlockVO> blocks;
    private LocalDateTime createdAt;
}
