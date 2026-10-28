package com.jobfit.match.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("match_report")
public class MatchReport {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long resumeVersionId;

    private Long jobId;

    private BigDecimal totalScore;

    private BigDecimal sSkill;

    private BigDecimal sSem;

    private BigDecimal sExp;

    private BigDecimal sEdu;

    private String weightsJson;

    private String algoVersion;

    private String inputSnapshot;

    private LocalDateTime createdAt;
}
