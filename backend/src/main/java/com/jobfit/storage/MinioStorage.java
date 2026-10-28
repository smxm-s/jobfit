package com.jobfit.storage;

import com.jobfit.config.AppProperties;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;

/**
 * MinIO 封装：启动时尝试创建简历/导出两个桶，失败只告警，不阻塞启动。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MinioStorage {

    private final AppProperties properties;

    private volatile MinioClient client;

    @PostConstruct
    public void init() {
        AppProperties.Minio minio = properties.getMinio();
        if (minio.getEndpoint() == null || minio.getEndpoint().isBlank()) {
            log.warn("未配置 MINIO_ENDPOINT，对象存储不可用（开发环境可忽略）");
            return;
        }
        try {
            MinioClient minioClient = MinioClient.builder()
                    .endpoint(minio.getEndpoint())
                    .credentials(minio.getAccessKey(), minio.getSecretKey())
                    .build();
            ensureBucket(minioClient, minio.getBucketResume());
            ensureBucket(minioClient, minio.getBucketExport());
            this.client = minioClient;
        } catch (Exception e) {
            log.warn("MinIO 初始化失败，对象存储不可用: {}", e.getMessage());
            this.client = null;
        }
    }

    private void ensureBucket(MinioClient minioClient, String bucket) {
        try {
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                log.info("已创建 MinIO 桶: {}", bucket);
            }
        } catch (Exception e) {
            log.warn("MinIO 桶 {} 不可用: {}", bucket, e.getMessage());
        }
    }

    /**
     * 上传简历原件，返回对象 key；不可用时返回 null（由调用方降级）。
     */
    public String uploadResume(String objectName, byte[] bytes, String contentType) {
        MinioClient minioClient = this.client;
        if (minioClient == null) {
            return null;
        }
        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(properties.getMinio().getBucketResume())
                    .object(objectName)
                    .contentType(contentType)
                    .stream(new ByteArrayInputStream(bytes), bytes.length, -1)
                    .build());
            return objectName;
        } catch (Exception e) {
            log.warn("简历上传 MinIO 失败: {}", e.getMessage());
            return null;
        }
    }
}
