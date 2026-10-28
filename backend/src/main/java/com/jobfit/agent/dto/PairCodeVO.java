package com.jobfit.agent.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class PairCodeVO {

    private String code;
    private int expireIn;
}
