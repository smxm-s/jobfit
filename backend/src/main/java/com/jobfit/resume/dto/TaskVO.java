package com.jobfit.resume.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TaskVO {

    private Long id;
    private Long resumeId;
    private String fileName;
    private String status;
    private String errorMsg;
    private Integer attempts;
    private Long versionId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
