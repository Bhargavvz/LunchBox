package com.lunchbox.common.redis;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import org.springframework.boot.autoconfigure.cache.RedisCacheManagerBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;

import java.time.Duration;
import java.util.List;

@Configuration
public class RedisConfig {

    /**
     * Token bucket. KEYS[1]=bucket, ARGV: capacity, refill tokens per ms, now ms, tokens requested.
     * Returns {allowed (0/1), retry-after ms}.
     */
    @Bean
    @SuppressWarnings({"rawtypes", "unchecked"})
    public RedisScript<List> tokenBucketScript() {
        String lua = """
                local key = KEYS[1]
                local capacity = tonumber(ARGV[1])
                local refill = tonumber(ARGV[2])
                local now = tonumber(ARGV[3])
                local requested = tonumber(ARGV[4])
                local data = redis.call('HMGET', key, 'tokens', 'ts')
                local tokens = tonumber(data[1])
                local ts = tonumber(data[2])
                if tokens == nil then tokens = capacity end
                if ts == nil then ts = now end
                local elapsed = math.max(0, now - ts)
                tokens = math.min(capacity, tokens + elapsed * refill)
                local allowed = 0
                local retry = 0
                if tokens >= requested then
                  tokens = tokens - requested
                  allowed = 1
                else
                  retry = math.ceil((requested - tokens) / refill)
                end
                redis.call('HSET', key, 'tokens', tostring(tokens), 'ts', tostring(now))
                redis.call('PEXPIRE', key, math.ceil(capacity / refill) + 1000)
                return {allowed, retry}
                """;
        return (RedisScript<List>) (RedisScript) RedisScript.of(lua, List.class);
    }

    /** Compare-and-delete so a lock is only released by its owner. */
    @Bean
    public RedisScript<Long> releaseLockScript() {
        return RedisScript.of("""
                if redis.call('GET', KEYS[1]) == ARGV[1] then
                  return redis.call('DEL', KEYS[1])
                end
                return 0
                """, Long.class);
    }

    @Bean
    public RedisCacheManagerBuilderCustomizer cacheSerialization(ObjectMapper objectMapper) {
        RedisCacheConfiguration base = RedisCacheConfiguration.defaultCacheConfig()
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(
                        new GenericJackson2JsonRedisSerializer(objectMapper.copy().activateDefaultTyping(
                                BasicPolymorphicTypeValidator.builder()
                                        .allowIfSubType("com.lunchbox.")
                                        .allowIfSubType("java.util.")
                                        .allowIfSubType("java.time.")
                                        .allowIfSubType("java.lang.")
                                        .allowIfSubTypeIsArray()
                                        .build(),
                                ObjectMapper.DefaultTyping.EVERYTHING))))
                .prefixCacheNameWith("cache:")
                .entryTtl(Duration.ofMinutes(10));
        return builder -> builder.cacheDefaults(base)
                .withCacheConfiguration("schools", base.entryTtl(Duration.ofMinutes(5)))
                .withCacheConfiguration("serviceAreas", base.entryTtl(Duration.ofMinutes(5)));
    }
}
