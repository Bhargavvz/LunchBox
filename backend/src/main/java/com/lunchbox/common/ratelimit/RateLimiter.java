package com.lunchbox.common.ratelimit;

import com.lunchbox.common.error.TooManyRequestsException;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.List;

@Slf4j
@Component
public class RateLimiter {

    private final StringRedisTemplate redis;
    @SuppressWarnings("rawtypes")
    private final RedisScript<List> script;
    private final Clock clock;
    private final MeterRegistry meters;

    @SuppressWarnings("rawtypes")
    public RateLimiter(StringRedisTemplate redis, RedisScript<List> tokenBucketScript, Clock clock, MeterRegistry meters) {
        this.redis = redis;
        this.script = tokenBucketScript;
        this.clock = clock;
        this.meters = meters;
    }

    /** Consumes one token or throws {@link TooManyRequestsException}. Fails open if Redis is unreachable. */
    public void consume(RateLimitPolicy policy, String subject) {
        long retryMs = tryConsume(policy, subject);
        if (retryMs > 0) {
            meters.counter("lunchbox.ratelimit.rejected", "policy", policy.name()).increment();
            throw new TooManyRequestsException(Math.max(1, (retryMs + 999) / 1000));
        }
    }

    /** @return 0 when allowed, otherwise milliseconds until a token is available. */
    @SuppressWarnings("unchecked")
    public long tryConsume(RateLimitPolicy policy, String subject) {
        String key = "rl:" + policy.name().toLowerCase() + ":" + subject;
        try {
            List<Long> result = redis.execute(script, List.of(key),
                    String.valueOf(policy.capacity()),
                    String.valueOf(policy.refillPerMilli()),
                    String.valueOf(clock.millis()),
                    "1");
            if (result == null || result.size() < 2) {
                return 0;
            }
            return result.get(0) == 1L ? 0 : Math.max(1, result.get(1));
        } catch (DataAccessException e) {
            log.warn("Rate limiter unavailable, allowing request: {}", e.getMessage());
            return 0;
        }
    }
}
