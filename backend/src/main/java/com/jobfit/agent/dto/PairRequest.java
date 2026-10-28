package com.jobfit.agent.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class PairRequest {

    @NotBlank(message = "不能为空")
    private String code;

    @Size(max = 100, message = "长度不能超过 100")
    private String deviceName;
}
