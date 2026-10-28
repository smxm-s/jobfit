package com.jobfit.resume.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("parse_task")
public class ParseTask {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long resumeId;

    private String fileKey;

    private String fileName;

    private String status;

    private String errorMsg;

    private Integer attempts;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
