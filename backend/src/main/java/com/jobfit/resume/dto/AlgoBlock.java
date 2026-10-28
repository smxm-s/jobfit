package com.jobfit.resume.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 算法服务 /internal/parse 返回的区块结构。
 */
@Data
public class AlgoBlock {

    private String blockType;
    private Integer sectionIdx;
    private String rawText;
    private Integer pageNo;
    private Integer startOffset;
    private Integer endOffset;
    private BigDecimal confidence;
}
