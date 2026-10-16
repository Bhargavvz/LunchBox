package com.lunchbox.payments;

import com.lunchbox.common.persistence.UuidV7;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;

/** Stores every verified webhook once (provider + event id) so redeliveries are acknowledged without re-processing. */
@Component
public class WebhookInbox {

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public WebhookInbox(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** @return true if this is the first delivery of the event */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean accept(String provider, String eventId, String eventType, String payload) {
        return jdbc.update("""
                INSERT INTO webhook_events (id, provider, event_id, event_type, payload, received_at)
                VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?)
                ON CONFLICT (provider, event_id) DO NOTHING
                """, UuidV7.generate(), provider, eventId, eventType, payload, Timestamp.from(clock.instant())) == 1;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void markProcessed(String provider, String eventId) {
        jdbc.update("UPDATE webhook_events SET processed_at = ? WHERE provider = ? AND event_id = ?",
                Timestamp.from(clock.instant()), provider, eventId);
    }
}
