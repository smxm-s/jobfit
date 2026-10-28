package com.jobfit.resume.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ResumeCreateRequest {

    @NotBlank(message = "不能为空")
    @Size(max = 100, message = "长度不能超过 100")
    private String title;
}
