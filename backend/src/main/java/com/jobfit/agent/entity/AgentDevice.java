package com.jobfit.agent.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("agent_device")
public class AgentDevice {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String deviceName;

    private String tokenHash;

    private LocalDateTime lastSeenAt;

    private Integer revoked;

    private LocalDateTime createdAt;
}
