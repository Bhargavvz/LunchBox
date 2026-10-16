package com.lunchbox.payments;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.crypto.Hmac;
import com.lunchbox.common.error.Errors;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
public class RazorpayWebhookService {

    private final PaymentGateway gateway;
    private final WebhookInbox inbox;
    private final List<RazorpayWebhookHandler> handlers;
    private final PaymentRecorder recorder;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meters;

    public RazorpayWebhookService(PaymentGateway gateway, WebhookInbox inbox, List<RazorpayWebhookHandler> handlers,
                                  PaymentRecorder recorder, ObjectMapper objectMapper, MeterRegistry meters) {
        this.gateway = gateway;
        this.inbox = inbox;
        this.handlers = handlers;
        this.recorder = recorder;
        this.objectMapper = objectMapper;
        this.meters = meters;
    }

    @Transactional
    public void receive(String rawBody, String signature, String eventIdHeader) {
        if (signature == null || !gateway.verifyWebhookSignature(rawBody, signature)) {
            meters.counter("lunchbox.webhooks.rejected", "provider", "razorpay").increment();
            throw Errors.unauthorized("Invalid webhook signature.");
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(rawBody);
        } catch (Exception e) {
            throw Errors.badRequest("invalid_payload", "Malformed webhook payload.");
        }
        String event = root.path("event").asText();
        String eventId = eventIdHeader != null && !eventIdHeader.isBlank()
                ? eventIdHeader
                : Hmac.sha256Digest(rawBody);
        if (!inbox.accept("razorpay", eventId, event, rawBody)) {
            log.info("Duplicate Razorpay webhook {} ({}) ignored", eventId, event);
            return;
        }
        JsonNode payload = root.path("payload");
        if ("payment.failed".equals(event)) {
            JsonNode p = payload.path("payment").path("entity");
            recorder.recordFailed(p.path("id").asText(), p.path("error_description").asText(null));
        }
        handlers.stream().filter(h -> h.supports(event)).forEach(h -> h.handle(event, payload));
        inbox.markProcessed("razorpay", eventId);
        meters.counter("lunchbox.webhooks.processed", "provider", "razorpay", "event", event).increment();
    }
}
