package com.lunchbox.common.outbox;

import com.lunchbox.common.messaging.Messaging;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.List;
import java.util.UUID;

@Slf4j
@Component
public class OutboxRelay {

    private static final int BATCH = 200;

    private final JdbcTemplate jdbc;
    private final RabbitTemplate rabbit;
    private final Clock clock;
    private final MeterRegistry meters;

    public OutboxRelay(JdbcTemplate jdbc, RabbitTemplate rabbit, Clock clock, MeterRegistry meters) {
        this.jdbc = jdbc;
        this.rabbit = rabbit;
        this.clock = clock;
        this.meters = meters;
    }

    @Scheduled(fixedDelay = 1000)
    @SchedulerLock(name = "outboxRelay", lockAtMostFor = "PT1M")
    @Transactional
    public void relay() {
        List<Row> rows = jdbc.query("""
                SELECT id, aggregate_type, aggregate_id, event_type, payload::text AS payload
                FROM outbox_events
                WHERE published_at IS NULL AND attempts < 20
                ORDER BY created_at
                LIMIT ?
                FOR UPDATE SKIP LOCKED
                """, (rs, i) -> new Row(rs.getObject("id", UUID.class), rs.getString("aggregate_type"),
                rs.getObject("aggregate_id", UUID.class), rs.getString("event_type"), rs.getString("payload")), BATCH);

        for (Row row : rows) {
            try {
                Message message = MessageBuilder.withBody(row.payload().getBytes(StandardCharsets.UTF_8))
                        .setContentType("application/json")
                        .setContentEncoding("utf-8")
                        .setMessageId(row.id().toString())
                        .setHeader(Messaging.HEADER_EVENT_ID, row.id().toString())
                        .setHeader(Messaging.HEADER_EVENT_TYPE, row.eventType())
                        .setHeader("x-aggregate-type", row.aggregateType())
                        .setHeader("x-aggregate-id", row.aggregateId().toString())
                        .setDeliveryMode(MessageDeliveryMode.PERSISTENT)
                        .build();
                rabbit.invoke(ops -> {
                    ops.send(Messaging.EVENTS_EXCHANGE, row.eventType(), message);
                    ops.waitForConfirmsOrDie(5_000);
                    return null;
                });
                jdbc.update("UPDATE outbox_events SET published_at = ? WHERE id = ?",
                        Timestamp.from(clock.instant()), row.id());
                meters.counter("lunchbox.outbox.published", "type", row.eventType()).increment();
            } catch (RuntimeException e) {
                log.warn("Outbox publish failed for {} ({}): {}", row.id(), row.eventType(), e.getMessage());
                jdbc.update("UPDATE outbox_events SET attempts = attempts + 1, last_error = ? WHERE id = ?",
                        truncate(e.getMessage()), row.id());
                meters.counter("lunchbox.outbox.failed", "type", row.eventType()).increment();
                break;
            }
        }
    }

    @Scheduled(cron = "0 30 3 * * *")
    @SchedulerLock(name = "outboxCleanup", lockAtMostFor = "PT10M")
    public void cleanup() {
        int deleted = jdbc.update("DELETE FROM outbox_events WHERE published_at < now() - interval '14 days'");
        log.info("Removed {} published outbox events", deleted);
    }

    private static String truncate(String s) {
        if (s == null) {
            return null;
        }
        return s.length() > 1000 ? s.substring(0, 1000) : s;
    }

    private record Row(UUID id, String aggregateType, UUID aggregateId, String eventType, String payload) {
    }
}
