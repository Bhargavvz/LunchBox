package com.lunchbox.common.messaging;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Best-effort push to STOMP topics. Live updates are a convenience layered on durable state (clients re-fetch
 * snapshots on reconnect), so a broker outage must never fail the business operation that triggered the push.
 */
@Slf4j
@Component
public class LiveBroadcaster {

    private final SimpMessagingTemplate template;
    private final MeterRegistry meters;

    public LiveBroadcaster(SimpMessagingTemplate template, MeterRegistry meters) {
        this.template = template;
        this.meters = meters;
    }

    public void send(String destination, Object payload) {
        try {
            template.convertAndSend(destination, payload);
        } catch (MessagingException e) {
            meters.counter("lunchbox.stomp.publish_failed").increment();
            log.debug("STOMP publish to {} failed: {}", destination, e.getMessage());
        }
    }
}
