package com.jobfit.match.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class MatchRequest {

    @NotNull(message = "不能为空")
    private Long versionId;
}
