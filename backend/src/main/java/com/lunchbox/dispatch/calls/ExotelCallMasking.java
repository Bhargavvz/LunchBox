package com.lunchbox.dispatch.calls;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.integration.HttpClients;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/** Exotel "connect two numbers" API (v1, form-encoded). Not retried: a retry could ring the caller twice. */
@Component
@ConditionalOnProperty(name = "lunchbox.integrations.exotel.mode", havingValue = "live")
public class ExotelCallMasking implements CallMasking {

    private final LunchBoxProperties.Exotel config;
    private final RestClient http;

    public ExotelCallMasking(LunchBoxProperties properties, RestClient.Builder builder) {
        this.config = properties.integrations().exotel();
        String basic = Base64.getEncoder().encodeToString((config.apiKey() + ":" + config.apiToken())
                .getBytes(StandardCharsets.UTF_8));
        this.http = HttpClients.build(builder.defaultHeader("Authorization", "Basic " + basic), config.baseUrl());
    }

    @Override
    @CircuitBreaker(name = "exotel")
    public String connect(String fromPhone, String toPhone, String reference) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("From", fromPhone);
        form.add("To", toPhone);
        form.add("CallerId", config.callerId());
        form.add("CallType", "trans");
        form.add("TimeLimit", "600");
        form.add("CustomField", reference);
        JsonNode res = http.post()
                .uri("/Accounts/{sid}/Calls/connect.json", config.sid())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(JsonNode.class);
        return res == null ? null : res.path("Call").path("Sid").asText(null);
    }
}
