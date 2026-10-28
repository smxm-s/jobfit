package com.jobfit.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

@Data
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Algo algo = new Algo();
    private Minio minio = new Minio();
    private Match match = new Match();
    private Apply apply = new Apply();

    @Data
    public static class Algo {
        private String baseUrl = "http://localhost:8000";
        private int connectTimeoutMs = 2000;
        private int readTimeoutMs = 15000;
    }

    @Data
    public static class Minio {
        private String endpoint = "";
        private String accessKey = "";
        private String secretKey = "";
        private String bucketResume = "resume";
        private String bucketExport = "export";
    }

    @Data
    public static class Match {
        private Map<String, BigDecimal> weights = new LinkedHashMap<>();

        public Match() {
            weights.put("skill", new BigDecimal("0.40"));
            weights.put("sem", new BigDecimal("0.25"));
            weights.put("exp", new BigDecimal("0.20"));
            weights.put("edu", new BigDecimal("0.15"));
        }
    }

    @Data
    public static class Apply {
        private int dailyLimitDefault = 30;
    }
}
