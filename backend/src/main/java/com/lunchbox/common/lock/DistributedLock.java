package com.lunchbox.common.lock;

import com.lunchbox.common.error.Errors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;

/**
 * Single-instance Redis lock (SET NX PX + owner-checked release). Used as a fast mutual-exclusion guard;
 * correctness is still backed by optimistic locking and unique constraints in Postgres.
 */
@Slf4j
@Component
public class DistributedLock {

    private final StringRedisTemplate redis;
    private final RedisScript<Long> releaseScript;

    public DistributedLock(StringRedisTemplate redis, RedisScript<Long> releaseLockScript) {
        this.redis = redis;
        this.releaseScript = releaseLockScript;
    }

    public Optional<String> tryAcquire(String key, Duration ttl) {
        String token = UUID.randomUUID().toString();
        Boolean ok = redis.opsForValue().setIfAbsent("lock:" + key, token, ttl);
        return Boolean.TRUE.equals(ok) ? Optional.of(token) : Optional.empty();
    }

    public void release(String key, String token) {
        redis.execute(releaseScript, List.of("lock:" + key), token);
    }

    public <T> T withLock(String key, Duration ttl, Duration wait, Supplier<T> action) {
        long deadline = System.nanoTime() + wait.toNanos();
        long backoffMs = 20;
        while (true) {
            Optional<String> token = tryAcquire(key, ttl);
            if (token.isPresent()) {
                try {
                    return action.get();
                } finally {
                    release(key, token.get());
                }
            }
            if (System.nanoTime() >= deadline) {
                throw Errors.conflict("resource_busy", "This item is being updated. Please retry in a moment.");
            }
            sleep(backoffMs + ThreadLocalRandom.current().nextLong(backoffMs));
            backoffMs = Math.min(backoffMs * 2, 250);
        }
    }

    public void withLock(String key, Duration ttl, Duration wait, Runnable action) {
        withLock(key, ttl, wait, () -> {
            action.run();
            return null;
        });
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw Errors.unavailable("interrupted", "Request interrupted.");
        }
    }
}
