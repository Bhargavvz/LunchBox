package com.lunchbox.payments;

import java.time.Instant;
import java.util.UUID;

/** Public API used by billing flows (subscriptions) to record money movements. */
public interface PaymentRecorder {

    /** Idempotent upsert by Razorpay payment id. */
    void recordCaptured(UUID parentId, UUID subscriptionId, String providerPaymentId, String providerInvoiceId,
                        long amountPaise, String method, String description, Instant paidAt);

    void recordAuthorized(UUID parentId, UUID subscriptionId, String providerPaymentId, long amountPaise, String description);

    void recordFailed(String providerPaymentId, String reason);
}
