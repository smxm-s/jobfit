package com.jobfit.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jobfit.common.BizException;
import com.jobfit.common.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * 算法服务客户端，所有异常统一转为 4001。
 */
@Slf4j
@Component
public class AlgoClient {

    private final String baseUrl;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;
    private final RestTemplate pingTemplate;

    public AlgoClient(AppProperties properties, ObjectMapper objectMapper) {
        this.baseUrl = trimSlash(properties.getAlgo().getBaseUrl());
        this.objectMapper = objectMapper;
        this.restTemplate = buildTemplate(
                properties.getAlgo().getConnectTimeoutMs(),
                properties.getAlgo().getReadTimeoutMs());
        this.pingTemplate = buildTemplate(1000, 1000);
    }

    public JsonNode post(String path, Object body) {
        String response;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            response = restTemplate.postForObject(baseUrl + path, new HttpEntity<>(body, headers), String.class);
        } catch (RestClientException e) {
            log.warn("调用算法服务失败 path={}: {}", path, e.getMessage());
            throw new BizException(ErrorCode.ALGO_UNAVAILABLE, "算法服务不可用");
        }
        if (response == null || response.isBlank()) {
            throw new BizException(ErrorCode.ALGO_UNAVAILABLE, "算法服务返回为空");
        }
        try {
            return objectMapper.readTree(response);
        } catch (Exception e) {
            log.warn("算法服务响应解析失败 path={}: {}", path, e.getMessage());
            throw new BizException(ErrorCode.ALGO_UNAVAILABLE, "算法服务响应异常");
        }
    }

    public boolean ping() {
        try {
            JsonNode response = pingTemplate.getForObject(baseUrl + "/health", JsonNode.class);
            return response != null;
        } catch (Exception e) {
            return false;
        }
    }

    private RestTemplate buildTemplate(int connectTimeout, int readTimeout) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeout);
        factory.setReadTimeout(readTimeout);
        return new RestTemplate(factory);
    }

    private String trimSlash(String url) {
        if (url == null || url.isBlank()) {
            return "http://localhost:8000";
        }
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
