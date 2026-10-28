package com.jobfit.job.dto;

import lombok.Data;

import java.util.List;

@Data
public class IngestRequest {

    private String batchId;

    private List<JobItem> jobs;

    @Data
    public static class JobItem {

        private String title;
        private String company;
        private String city;
        private String salary;
        private String exp;
        private String degree;
        private List<String> tags;
        private String jdSummary;
        private String jobUrl;
        private String jdHash;
    }
}
