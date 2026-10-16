package com.lunchbox.payments;

import com.lunchbox.common.crypto.Hmac;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * Sandbox implementation for local development and tests. Signatures use fixed, well-known secrets so tests and the
 * local "simulate payment" endpoint can produce valid ones. Never active in the prod profile (IntegrationModeGuard).
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "lunchbox.integrations.razorpay.mode", havingValue = "fake", matchIfMissing = true)
public class FakePaymentGateway implements PaymentGateway {

    public static final String FAKE_KEY_SECRET = "fake_razorpay_key_secret";
    public static final String FAKE_WEBHOOK_SECRET = "fake_razorpay_webhook_secret";

    @Override
    public String keyId() {
        return "rzp_test_fake";
    }

    @Override
    public String createPlan(String name, long amountPaise, String period, int interval) {
        return "plan_fake_" + shortId();
    }

    @Override
    public ProviderSubscription createSubscription(String providerPlanId, int totalCount, Map<String, String> notes) {
        String id = "sub_fake_" + shortId();
        log.info("[fake razorpay] created subscription {} for plan {}", id, providerPlanId);
        return new ProviderSubscription(id, "https://rzp.example/fake/" + id, "created");
    }

    @Override
    public void cancelSubscription(String providerSubscriptionId, boolean atCycleEnd) {
        log.info("[fake razorpay] cancelled subscription {} (atCycleEnd={})", providerSubscriptionId, atCycleEnd);
    }

    @Override
    public boolean verifyCheckoutSignature(String paymentId, String subscriptionId, String signature) {
        return Hmac.constantTimeEquals(sign(paymentId, subscriptionId), signature);
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signature) {
        return Hmac.constantTimeEquals(Hmac.sha256Hex(FAKE_WEBHOOK_SECRET, rawBody), signature);
    }

    public static String sign(String paymentId, String subscriptionId) {
        return Hmac.sha256Hex(FAKE_KEY_SECRET, paymentId + "|" + subscriptionId);
    }

    private static String shortId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 14);
    }
}
