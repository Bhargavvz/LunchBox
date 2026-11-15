package com.lunchbox.payments;

import java.util.Map;

/**
 * Razorpay behind an interface; {@link FakePaymentGateway} is used locally and in tests. Two billing styles share it:
 * prepaid periods paid through Orders (ADR-0018, the default) and auto-debit through Subscriptions.
 */
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

    /** A one-time Razorpay Order for {@code amountPaise}; the checkout pays it. */
    ProviderOrder createOrder(long amountPaise, String receipt, Map<String, String> notes);

    /** Verifies the signature an order checkout returns: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
    boolean verifyOrderSignature(String orderId, String paymentId, String signature);

    record ProviderSubscription(String id, String shortUrl, String status) {
    }

    record ProviderOrder(String id, long amountPaise) {
    }
}
