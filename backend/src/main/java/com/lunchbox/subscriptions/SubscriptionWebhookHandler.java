package com.lunchbox.subscriptions;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.payments.RazorpayWebhookHandler;
import org.springframework.stereotype.Component;

import java.time.Instant;

/** Applies Razorpay {@code subscription.*} webhooks to local subscription state. */
@Component
class SubscriptionWebhookHandler implements RazorpayWebhookHandler {

    private final SubscriptionService subscriptions;

    SubscriptionWebhookHandler(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @Override
    public boolean supports(String event) {
        return event != null && event.startsWith("subscription.");
    }

    @Override
    public void handle(String event, JsonNode payload) {
        JsonNode sub = payload.path("subscription").path("entity");
        String providerId = sub.path("id").asText();
        Instant periodEnd = sub.hasNonNull("current_end") ? Instant.ofEpochSecond(sub.path("current_end").asLong()) : null;
        switch (event) {
            case "subscription.authenticated", "subscription.activated", "subscription.resumed" ->
                    subscriptions.onProviderActivated(providerId, periodEnd);
            case "subscription.charged" -> {
                JsonNode payment = payload.path("payment").path("entity");
                Instant paidAt = payment.hasNonNull("created_at")
                        ? Instant.ofEpochSecond(payment.path("created_at").asLong()) : Instant.now();
                subscriptions.onProviderCharged(providerId, periodEnd, payment.path("id").asText(),
                        payment.path("invoice_id").asText(null), payment.path("amount").asLong(),
                        payment.path("method").asText(null), paidAt);
            }
            case "subscription.pending", "subscription.halted", "subscription.paused" ->
                    subscriptions.onProviderHalted(providerId);
            case "subscription.cancelled" -> subscriptions.onProviderEnded(providerId, false);
            case "subscription.completed" -> subscriptions.onProviderEnded(providerId, true);
            default -> {
                // Other subscription events (e.g. updated) need no local state change.
            }
        }
    }
}
