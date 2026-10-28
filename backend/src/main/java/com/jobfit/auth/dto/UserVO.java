package com.jobfit.auth.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserVO {

    private Long id;
    private String username;
    private String nickname;
    private String email;
    private String role;
    private String jobIntention;
    private LocalDateTime createdAt;
}
