package com.jobfit.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RegisterRequest {

    @NotBlank(message = "不能为空")
    @Size(min = 3, max = 50, message = "长度需为 3-50")
    private String username;

    @NotBlank(message = "不能为空")
    @Size(min = 6, max = 64, message = "长度需为 6-64")
    private String password;

    @Size(max = 50, message = "长度不能超过 50")
    private String nickname;

    @Email(message = "格式不正确")
    @Size(max = 100, message = "长度不能超过 100")
    private String email;
}
