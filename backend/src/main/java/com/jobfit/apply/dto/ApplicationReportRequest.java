package com.jobfit.apply.dto;

import lombok.Data;

import java.util.List;

@Data
public class ApplicationReportRequest {

    private List<Item> items;

    @Data
    public static class Item {
        private Long jobId;
        private String applyLevel;
        private String status;
        private String appliedAt;
        private String skipReason;
        private String failReason;
    }
}
