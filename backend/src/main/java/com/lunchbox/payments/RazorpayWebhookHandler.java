package com.lunchbox.payments;

import com.fasterxml.jackson.databind.JsonNode;

/** Implemented by modules that react to Razorpay webhook events (e.g. subscriptions for subscription.*). */
public interface RazorpayWebhookHandler {

    boolean supports(String event);

    /** Runs inside the webhook transaction; throw to have Razorpay redeliver. */
    void handle(String event, JsonNode payload);
}
