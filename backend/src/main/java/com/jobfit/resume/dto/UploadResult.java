package com.jobfit.resume.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class UploadResult {

    private Long taskId;
    private boolean dedup;
}
