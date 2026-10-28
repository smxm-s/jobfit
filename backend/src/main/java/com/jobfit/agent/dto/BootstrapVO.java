package com.jobfit.agent.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class BootstrapVO {

    private AgentConfigDTO config;
    private LatestVersion latestVersion;
    private int remainingQuota;
    private List<String> jdHashes;

    @Data
    public static class LatestVersion {
        private Long versionId;
        private Long resumeId;
        private String resumeTitle;
        private Integer versionNo;
        private LocalDateTime createdAt;
    }
}
