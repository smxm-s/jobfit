package com.jobfit.apply.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ApplyReportResult {

    private int recorded;
    private int remainingQuota;
}
