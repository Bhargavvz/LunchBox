package com.lunchbox.payments;

import java.util.Map;

/** Razorpay Subscriptions behind an interface; {@link FakePaymentGateway} is used locally and in tests. */
public interface PaymentGateway {

    /** Public key id the mobile checkout needs. */
    String keyId();

    /** @param period "monthly" or "weekly"; {@code interval} multiplies it (3 × monthly = quarterly). */
    String createPlan(String name, long amountPaise, String period, int interval);

    ProviderSubscription createSubscription(String providerPlanId, int totalCount, Map<String, String> notes);

    void cancelSubscription(String providerSubscriptionId, boolean atCycleEnd);

    /** Verifies the signature the checkout returns: HMAC_SHA256(payment_id + "|" + subscription_id, key_secret). */
    boolean verifyCheckoutSignature(String paymentId, String subscriptionId, String signature);

    /** Verifies {@code X-Razorpay-Signature}: HMAC_SHA256(raw body, webhook secret). */
    boolean verifyWebhookSignature(String rawBody, String signature);

    record ProviderSubscription(String id, String shortUrl, String status) {
    }
}
