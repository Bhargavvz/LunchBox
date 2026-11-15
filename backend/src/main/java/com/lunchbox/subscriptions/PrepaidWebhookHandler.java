package com.lunchbox.subscriptions;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.payments.RazorpayWebhookHandler;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Backstop for prepaid plans (ADR-0018): Razorpay's {@code payment.captured} for a plan's open order activates the
 * plan even when the app closed before it could confirm the payment itself. A payment the app already confirmed is
 * a no-op (the order is no longer open).
 */
@Component
class PrepaidWebhookHandler implements RazorpayWebhookHandler {

    private final SubscriptionService subscriptions;

    PrepaidWebhookHandler(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @Override
    public boolean supports(String event) {
        return "payment.captured".equals(event);
    }

    @Override
    public void handle(String event, JsonNode payload) {
        JsonNode payment = payload.path("payment").path("entity");
        String orderId = payment.path("order_id").asText(null);
        if (orderId == null || orderId.isBlank()) {
            return;
        }
        Instant paidAt = payment.hasNonNull("created_at")
                ? Instant.ofEpochSecond(payment.path("created_at").asLong()) : Instant.now();
        subscriptions.onOrderPaid(orderId, payment.path("id").asText(), payment.path("amount").asLong(),
                payment.path("method").asText(null), paidAt);
    }
}
