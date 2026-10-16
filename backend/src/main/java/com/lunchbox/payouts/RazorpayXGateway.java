package com.lunchbox.payouts;

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
@ConditionalOnProperty(name = "lunchbox.integrations.razorpayx.mode", havingValue = "live")
public class RazorpayXGateway implements PayoutGateway {

    private final LunchBoxProperties.RazorpayX config;
    private final RestClient http;

    public RazorpayXGateway(LunchBoxProperties properties, RestClient.Builder builder) {
        this.config = properties.integrations().razorpayx();
        String basic = Base64.getEncoder().encodeToString((config.keyId() + ":" + config.keySecret())
                .getBytes(StandardCharsets.UTF_8));
        this.http = HttpClients.build(builder.defaultHeader("Authorization", "Basic " + basic), config.baseUrl());
    }

    @Override
    @Retry(name = "razorpayx")
    @CircuitBreaker(name = "razorpayx")
    public String createContact(String name, String phone, String reference) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("contact", phone == null ? null : phone.replace("+91", ""));
        body.put("type", "vendor");
        body.put("reference_id", reference);
        JsonNode res = http.post().uri("/contacts").contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class);
        return res.path("id").asText();
    }

    @Override
    @Retry(name = "razorpayx")
    @CircuitBreaker(name = "razorpayx")
    public String createBankFundAccount(String contactId, String accountHolder, String accountNumber, String ifsc) {
        Map<String, Object> body = Map.of(
                "contact_id", contactId,
                "account_type", "bank_account",
                "bank_account", Map.of("name", accountHolder, "ifsc", ifsc, "account_number", accountNumber));
        JsonNode res = http.post().uri("/fund_accounts").contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class);
        return res.path("id").asText();
    }

    /** Safe to retry: RazorpayX de-duplicates on X-Payout-Idempotency. */
    @Override
    @Retry(name = "razorpayx")
    @CircuitBreaker(name = "razorpayx")
    public ProviderPayout createPayout(String fundAccountId, long amountPaise, String reference, String idempotencyKey) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("account_number", config.accountNumber());
        body.put("fund_account_id", fundAccountId);
        body.put("amount", amountPaise);
        body.put("currency", "INR");
        body.put("mode", amountPaise > 20_000_000 ? "NEFT" : "IMPS");
        body.put("purpose", "payout");
        body.put("queue_if_low_balance", true);
        body.put("reference_id", reference);
        body.put("narration", "LunchBox earnings");
        JsonNode res = http.post().uri("/payouts")
                .header("X-Payout-Idempotency", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class);
        return new ProviderPayout(res.path("id").asText(), res.path("status").asText());
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signature) {
        if (config.webhookSecret() == null || config.webhookSecret().isBlank() || signature == null) {
            return false;
        }
        return Hmac.constantTimeEquals(Hmac.sha256Hex(config.webhookSecret(), rawBody), signature);
    }
}
