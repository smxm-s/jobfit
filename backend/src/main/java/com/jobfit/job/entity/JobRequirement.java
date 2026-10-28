package com.jobfit.job.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

@Data
@TableName("job_requirement")
public class JobRequirement {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long jobId;

    private String reqType;

    private String category;

    private String rawText;

    private Long skillId;

    private BigDecimal weight;
}
