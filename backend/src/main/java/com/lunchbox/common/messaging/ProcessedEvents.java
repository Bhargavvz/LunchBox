package com.lunchbox.common.messaging;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Consumer-side de-duplication (RabbitMQ delivers at least once). Call inside the consumer's transaction:
 * if the handler fails, the marker rolls back with it and the redelivery is processed.
 */
@Component
public class ProcessedEvents {

    private final JdbcTemplate jdbc;

    public ProcessedEvents(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean markFirstDelivery(String consumer, UUID eventId) {
        return jdbc.update("""
                INSERT INTO processed_events (consumer, event_id, processed_at) VALUES (?, ?, now())
                ON CONFLICT DO NOTHING
                """, consumer, eventId) == 1;
    }
}
