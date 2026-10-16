package com.lunchbox.payments;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.crypto.Hmac;
import com.lunchbox.common.security.Roles;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Local-profile helper: simulates what the Razorpay checkout and webhooks would do, so the parent app can complete a
 * subscription purchase against the fake gateway. Not registered in any other profile.
 */
@Hidden
@Profile("local")
@ConditionalOnProperty(name = "lunchbox.integrations.razorpay.mode", havingValue = "fake")
@RestController
public class DevPaymentsController {

    private final RazorpayWebhookService webhooks;
    private final ObjectMapper objectMapper;

    public DevPaymentsController(RazorpayWebhookService webhooks, ObjectMapper objectMapper) {
        this.webhooks = webhooks;
        this.objectMapper = objectMapper;
    }

    public record SimulateChargeRequest(@NotBlank String providerSubscriptionId, @Positive long amountPaise) {
    }

    public record SimulatedCheckout(String razorpayPaymentId, String razorpaySignature) {
    }

    @PostMapping("/api/v1/dev/payments/simulate-charge")
    @PreAuthorize(Roles.PARENT)
    public SimulatedCheckout simulate(@RequestBody SimulateChargeRequest request) throws Exception {
        String paymentId = "pay_fake_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
        long now = Instant.now().getEpochSecond();
        Map<String, Object> body = Map.of(
                "event", "subscription.charged",
                "payload", Map.of(
                        "subscription", Map.of("entity", Map.of("id", request.providerSubscriptionId(),
                                "status", "active", "current_end", now + 30L * 24 * 3600)),
                        "payment", Map.of("entity", Map.of("id", paymentId, "amount", request.amountPaise(),
                                "method", "upi", "created_at", now))));
        String raw = objectMapper.writeValueAsString(body);
        webhooks.receive(raw, Hmac.sha256Hex(FakePaymentGateway.FAKE_WEBHOOK_SECRET, raw), "evt_fake_" + paymentId);
        return new SimulatedCheckout(paymentId, FakePaymentGateway.sign(paymentId, request.providerSubscriptionId()));
    }
}
