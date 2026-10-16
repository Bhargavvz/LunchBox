package com.lunchbox.payouts;

import com.lunchbox.common.crypto.Hmac;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Sandbox RazorpayX: honours idempotency keys like the real API so retry behaviour can be tested. */
@Slf4j
@Component
@ConditionalOnProperty(name = "lunchbox.integrations.razorpayx.mode", havingValue = "fake", matchIfMissing = true)
public class FakePayoutGateway implements PayoutGateway {

    public static final String FAKE_WEBHOOK_SECRET = "fake_razorpayx_webhook_secret";
    private final Map<String, ProviderPayout> byIdempotencyKey = new ConcurrentHashMap<>();

    @Override
    public String createContact(String name, String phone, String reference) {
        return "cont_fake_" + shortId();
    }

    @Override
    public String createBankFundAccount(String contactId, String accountHolder, String accountNumber, String ifsc) {
        return "fa_fake_" + shortId();
    }

    @Override
    public ProviderPayout createPayout(String fundAccountId, long amountPaise, String reference, String idempotencyKey) {
        return byIdempotencyKey.computeIfAbsent(idempotencyKey, k -> {
            log.info("[fake razorpayx] payout of {} paise to {} ({})", amountPaise, fundAccountId, reference);
            return new ProviderPayout("pout_fake_" + shortId(), "processing");
        });
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signature) {
        return Hmac.constantTimeEquals(Hmac.sha256Hex(FAKE_WEBHOOK_SECRET, rawBody), signature);
    }

    private static String shortId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 14);
    }
}
