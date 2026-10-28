package com.jobfit.resume.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("resume_version")
public class ResumeVersion {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long resumeId;

    private Integer versionNo;

    private String schemaJson;

    private String source;

    private BigDecimal parseConfidence;

    private LocalDateTime createdAt;
}
