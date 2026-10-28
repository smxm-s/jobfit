package com.jobfit.common;

import com.jobfit.config.AlgoClient;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class HealthController {

    private final AlgoClient algoClient;

    @GetMapping("/health")
    public Result<Map<String, Object>> health() {
        Map<String, Object> algo = new LinkedHashMap<>();
        algo.put("reachable", algoClient.ping());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "UP");
        data.put("time", LocalDateTime.now());
        data.put("algo", algo);
        return Result.ok(data);
    }
}
