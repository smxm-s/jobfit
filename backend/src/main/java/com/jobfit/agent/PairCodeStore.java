package com.jobfit.agent;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 一次性配对码存储：优先 Redis（10 分钟 TTL），Redis 不可用时回退内存 Map。
 */
@Slf4j
@Component
public class PairCodeStore {

    private static final String KEY_PREFIX = "jobfit:pair:";
    private static final int TTL_MINUTES = 10;

    private final StringRedisTemplate redisTemplate;
    private final Map<String, MemoryEntry> memory = new ConcurrentHashMap<>();

    public PairCodeStore(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void save(String code, Long userId) {
        try {
            redisTemplate.opsForValue().set(KEY_PREFIX + code, String.valueOf(userId), Duration.ofMinutes(TTL_MINUTES));
        } catch (Exception e) {
            log.warn("Redis 不可用，配对码回退内存存储: {}", e.getMessage());
        }
        long expireAt = System.currentTimeMillis() + TTL_MINUTES * 60_000L;
        memory.put(code, new MemoryEntry(userId, expireAt));
        cleanup();
    }

    /**
     * 取出并删除配对码，无效或过期返回 null。
     */
    public Long consume(String code) {
        Long userId = null;
        try {
            String value = redisTemplate.opsForValue().get(KEY_PREFIX + code);
            if (value != null) {
                redisTemplate.delete(KEY_PREFIX + code);
                userId = Long.valueOf(value);
            }
        } catch (Exception e) {
            log.warn("Redis 不可用，改从内存读取配对码: {}", e.getMessage());
        }
        MemoryEntry entry = memory.remove(code);
        if (userId == null && entry != null && entry.expireAt >= System.currentTimeMillis()) {
            userId = entry.userId;
        }
        return userId;
    }

    private void cleanup() {
        if (memory.size() < 200) {
            return;
        }
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<String, MemoryEntry>> iterator = memory.entrySet().iterator();
        while (iterator.hasNext()) {
            if (iterator.next().getValue().expireAt < now) {
                iterator.remove();
            }
        }
    }

    private record MemoryEntry(Long userId, long expireAt) {
    }
}
