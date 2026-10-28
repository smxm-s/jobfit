package com.jobfit.resume.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ResumeVO {

    private Long id;
    private String title;
    private Integer currentVersion;
    private String status;
    private String fileHash;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
