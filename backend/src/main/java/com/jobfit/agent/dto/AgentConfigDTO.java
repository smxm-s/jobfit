package com.jobfit.agent.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class AgentConfigDTO {

    /** 城市列表；也兼容传入逗号分隔字符串 */
    @JsonFormat(with = JsonFormat.Feature.ACCEPT_SINGLE_VALUE_AS_ARRAY)
    private List<String> cities;

    private String keyword;
    private Integer salaryMin;
    private Integer salaryMax;

    @JsonFormat(with = JsonFormat.Feature.ACCEPT_SINGLE_VALUE_AS_ARRAY)
    private List<String> expCodes;

    @JsonFormat(with = JsonFormat.Feature.ACCEPT_SINGLE_VALUE_AS_ARRAY)
    private List<String> degreeCodes;

    @JsonFormat(with = JsonFormat.Feature.ACCEPT_SINGLE_VALUE_AS_ARRAY)
    private List<String> excludeWords;

    private BigDecimal scoreThreshold;
    private String applyLevel;
    private Integer dailyLimit;
    private Integer batchSize;
    private String activeHours;
    private Long resumeVersionId;
    private String greetingTemplate;
    private LocalDateTime updatedAt;
}
