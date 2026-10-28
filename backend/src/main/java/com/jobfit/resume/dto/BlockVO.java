package com.jobfit.resume.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class BlockVO {

    private Long id;
    private String blockType;
    private Integer sectionIdx;
    private String rawText;
    private Integer pageNo;
    private Integer startOffset;
    private Integer endOffset;
    private BigDecimal confidence;
    private Integer corrected;
}
