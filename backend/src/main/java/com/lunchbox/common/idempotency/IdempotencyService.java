package com.lunchbox.common.idempotency;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.crypto.Hmac;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.persistence.UuidV7;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * Implements the {@code Idempotency-Key} contract for POSTs that create money or orders: the first request with a
 * key executes, concurrent duplicates get 409, completed duplicates replay the stored response, and a reused key
 * with a different payload is rejected with 422.
 */
@Slf4j
@Service
public class IdempotencyService {

    public static final String HEADER = "Idempotency-Key";
    private static final Pattern KEY_FORMAT = Pattern.compile("^[A-Za-z0-9_-]{8,100}$");
    private static final Duration RETENTION = Duration.ofHours(48);

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate newTx;
    private final Clock clock;

    public IdempotencyService(JdbcTemplate jdbc, ObjectMapper objectMapper, PlatformTransactionManager txManager,
                              Clock clock) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.newTx = new TransactionTemplate(txManager);
        this.newTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
    }

    public <T> T execute(String key, UUID userId, String scope, Object request, Class<T> responseType,
                         Supplier<T> action) {
        if (key == null || key.isBlank()) {
            return action.get();
        }
        if (!KEY_FORMAT.matcher(key).matches()) {
            throw Errors.badRequest("invalid_idempotency_key", "Idempotency-Key must be 8-100 URL-safe characters.");
        }
        String requestHash = Hmac.sha256Digest(serialize(request));
        Instant now = clock.instant();

        Integer inserted = newTx.execute(status -> jdbc.update("""
                INSERT INTO idempotency_keys (id, idem_key, user_id, scope, request_hash, status, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?)
                ON CONFLICT (user_id, scope, idem_key) DO NOTHING
                """, UuidV7.generate(), key, userId, scope, requestHash, Timestamp.from(now),
                Timestamp.from(now.plus(RETENTION))));

        if (inserted == null || inserted == 0) {
            return replay(key, userId, scope, requestHash, responseType);
        }

        T result;
        try {
            result = action.get();
        } catch (RuntimeException e) {
            newTx.executeWithoutResult(status -> jdbc.update(
                    "DELETE FROM idempotency_keys WHERE user_id = ? AND scope = ? AND idem_key = ?", userId, scope, key));
            throw e;
        }
        String body = serialize(result);
        newTx.executeWithoutResult(status -> jdbc.update("""
                UPDATE idempotency_keys SET status = 'COMPLETED', response_body = CAST(? AS jsonb)
                WHERE user_id = ? AND scope = ? AND idem_key = ?
                """, body, userId, scope, key));
        return result;
    }

    private <T> T replay(String key, UUID userId, String scope, String requestHash, Class<T> responseType) {
        List<Stored> rows = jdbc.query("""
                SELECT request_hash, status, response_body::text AS body FROM idempotency_keys
                WHERE user_id = ? AND scope = ? AND idem_key = ?
                """, (rs, i) -> new Stored(rs.getString("request_hash"), rs.getString("status"), rs.getString("body")),
                userId, scope, key);
        if (rows.isEmpty()) {
            throw Errors.conflict("idempotency_retry", "Please retry the request.");
        }
        Stored stored = rows.getFirst();
        if (!stored.requestHash().equals(requestHash)) {
            throw Errors.unprocessable("idempotency_key_reused",
                    "This Idempotency-Key was already used with a different request.");
        }
        if (!"COMPLETED".equals(stored.status())) {
            throw Errors.conflict("request_in_progress", "An identical request is still being processed.");
        }
        try {
            return objectMapper.readValue(stored.body(), responseType);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Corrupt idempotency record", e);
        }
    }

    private String serialize(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    @Scheduled(cron = "0 0 * * * *")
    public void purgeExpired() {
        int deleted = jdbc.update("DELETE FROM idempotency_keys WHERE expires_at < ?", Timestamp.from(clock.instant()));
        if (deleted > 0) {
            log.info("Purged {} expired idempotency keys", deleted);
        }
    }

    private record Stored(String requestHash, String status, String body) {
    }
}
