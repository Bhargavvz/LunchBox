package com.lunchbox.payments;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.crypto.Hmac;
import com.lunchbox.common.integration.HttpClients;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
@ConditionalOnProperty(name = "lunchbox.integrations.razorpay.mode", havingValue = "live")
public class RazorpayGateway implements PaymentGateway {

    private final LunchBoxProperties.Razorpay config;
    private final RestClient http;

    public RazorpayGateway(LunchBoxProperties properties, RestClient.Builder builder) {
        this.config = properties.integrations().razorpay();
        String basic = Base64.getEncoder().encodeToString((config.keyId() + ":" + config.keySecret())
                .getBytes(StandardCharsets.UTF_8));
        this.http = HttpClients.build(builder.defaultHeader("Authorization", "Basic " + basic), config.baseUrl());
    }

    @Override
    public String keyId() {
        return config.keyId();
    }

    @Override
    @Retry(name = "razorpay")
    @CircuitBreaker(name = "razorpay")
    public String createPlan(String name, long amountPaise, String period, int interval) {
        Map<String, Object> body = Map.of(
                "period", period,
                "interval", interval,
                "item", Map.of("name", name, "amount", amountPaise, "currency", "INR"));
        JsonNode res = http.post().uri("/plans").contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class);
        return res.path("id").asText();
    }

    /** Not retried automatically: a retry after a read timeout could create a duplicate subscription. */
    @Override
    @CircuitBreaker(name = "razorpay")
    public ProviderSubscription createSubscription(String providerPlanId, int totalCount, Map<String, String> notes) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("plan_id", providerPlanId);
        body.put("total_count", totalCount);
        body.put("quantity", 1);
        body.put("customer_notify", 1);
        body.put("notes", notes);
        JsonNode res = http.post().uri("/subscriptions").contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class);
        return new ProviderSubscription(res.path("id").asText(), res.path("short_url").asText(null),
                res.path("status").asText());
    }

    @Override
    @Retry(name = "razorpay")
    @CircuitBreaker(name = "razorpay")
    public void cancelSubscription(String providerSubscriptionId, boolean atCycleEnd) {
        http.post().uri("/subscriptions/{id}/cancel", providerSubscriptionId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("cancel_at_cycle_end", atCycleEnd ? 1 : 0))
                .retrieve().toBodilessEntity();
    }

    @Override
    public boolean verifyCheckoutSignature(String paymentId, String subscriptionId, String signature) {
        String expected = Hmac.sha256Hex(config.keySecret(), paymentId + "|" + subscriptionId);
        return Hmac.constantTimeEquals(expected, signature);
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signature) {
        if (config.webhookSecret() == null || config.webhookSecret().isBlank()) {
            return false;
        }
        return Hmac.constantTimeEquals(Hmac.sha256Hex(config.webhookSecret(), rawBody), signature);
    }
}
