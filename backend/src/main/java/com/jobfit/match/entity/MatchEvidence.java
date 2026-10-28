package com.jobfit.match.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

@Data
@TableName("match_evidence")
public class MatchEvidence {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long reportId;

    private String dimension;

    private Long reqId;

    private Long resumeBlockId;

    private Integer hit;

    private BigDecimal score;

    private String note;
}
