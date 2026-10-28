package com.jobfit.auth.dto;

import lombok.Data;

@Data
public class LoginResponse {

    private String token;
    private UserVO user;
    private Long userId;
    private String username;
    private String nickname;
    private String role;
    private String jobIntention;
}
