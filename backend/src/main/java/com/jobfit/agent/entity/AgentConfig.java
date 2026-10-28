package com.jobfit.agent.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("agent_config")
public class AgentConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String cities;

    private String keyword;

    private Integer salaryMin;

    private Integer salaryMax;

    private String expCodes;

    private String degreeCodes;

    private String excludeWords;

    private BigDecimal scoreThreshold;

    private String applyLevel;

    private Integer dailyLimit;

    private Integer batchSize;

    private String activeHours;

    private Long resumeVersionId;

    private String greetingTemplate;

    private LocalDateTime updatedAt;
}
