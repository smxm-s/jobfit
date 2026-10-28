package com.jobfit.match.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class MatchBatchRequest {

    @NotNull(message = "不能为空")
    private Long versionId;

    @NotEmpty(message = "不能为空")
    private List<Long> jobIds;
}
