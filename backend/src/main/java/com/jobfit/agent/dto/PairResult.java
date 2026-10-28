package com.jobfit.agent.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class PairResult {

    private String deviceToken;
    private Long userId;
    private Long deviceId;
}
