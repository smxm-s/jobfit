package com.jobfit.job.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("job")
public class Job {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String title;

    private String company;

    private String city;

    private String salaryRange;

    private String expReq;

    private String degreeReq;

    private String tags;

    private String jdSummary;

    private String jobUrl;

    private String source;

    private String jdHash;

    private String status;

    private LocalDateTime collectedAt;

    private LocalDateTime createdAt;
}
