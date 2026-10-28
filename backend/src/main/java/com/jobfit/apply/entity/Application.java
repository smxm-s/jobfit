package com.jobfit.apply.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("application")
public class Application {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private Long jobId;

    private String channel;

    private String applyLevel;

    private String status;

    private String skipReason;

    private String failReason;

    private LocalDateTime appliedAt;

    private LocalDateTime createdAt;
}
