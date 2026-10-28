package com.jobfit.job.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
public class IngestResponse {

    private List<Accepted> accepted;
    private List<Rejected> rejected;

    public IngestResponse(List<Accepted> accepted, List<Rejected> rejected) {
        this.accepted = accepted;
        this.rejected = rejected;
    }

    @Data
    @AllArgsConstructor
    public static class Accepted {
        private String jdHash;
        private Long jobId;
        private boolean dedup;
    }

    @Data
    @AllArgsConstructor
    public static class Rejected {
        private String jdHash;
        private String reason;
        private String word;
    }
}
