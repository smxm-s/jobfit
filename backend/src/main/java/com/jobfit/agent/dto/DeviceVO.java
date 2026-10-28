package com.jobfit.agent.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DeviceVO {

    private Long id;
    private String deviceName;
    private LocalDateTime lastSeenAt;
    private Integer revoked;
    private LocalDateTime createdAt;
}
