package com.lunchbox.dispatch.kyc;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.integration.HttpClients;
import com.lunchbox.dispatch.KycDocument.DocType;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * IDfy Eve v3 "verify with source" async tasks. Aadhaar requires a holder-driven OTP flow and photos/police
 * verification need human review, so those types go to manual review in the admin panel.
 */
@Component
@ConditionalOnProperty(name = "lunchbox.integrations.idfy.mode", havingValue = "live")
public class IdfyKycProvider implements KycProvider {

    private final RestClient http;

    public IdfyKycProvider(LunchBoxProperties properties, RestClient.Builder builder) {
        LunchBoxProperties.Idfy config = properties.integrations().idfy();
        this.http = HttpClients.build(builder
                .defaultHeader("account-id", config.accountId())
                .defaultHeader("api-key", config.apiKey()), config.baseUrl());
    }

    @Override
    public boolean supports(DocType type) {
        return type == DocType.DRIVING_LICENSE || type == DocType.PAN || type == DocType.VEHICLE_RC;
    }

    @Override
    @Retry(name = "idfy")
    @CircuitBreaker(name = "idfy")
    public String submit(DocType type, String documentNumber, LocalDate dateOfBirth, String referenceId) {
        String task = switch (type) {
            case DRIVING_LICENSE -> "ind_driving_license";
            case PAN -> "ind_pan";
            case VEHICLE_RC -> "ind_rc_basic";
            default -> throw new IllegalArgumentException("Unsupported KYC type " + type);
        };
        Map<String, Object> data = new HashMap<>();
        if (type == DocType.VEHICLE_RC) {
            data.put("rc_number", documentNumber);
        } else {
            data.put("id_number", documentNumber);
        }
        if (type == DocType.DRIVING_LICENSE && dateOfBirth != null) {
            data.put("date_of_birth", dateOfBirth.toString());
        }
        // task_id doubles as an idempotency key at IDfy: a retried submit returns the same request.
        Map<String, Object> body = Map.of("task_id", referenceId, "group_id", UUID.nameUUIDFromBytes(referenceId.getBytes()).toString(),
                "data", data);
        JsonNode res = http.post().uri("/tasks/async/verify_with_source/{task}", task)
                .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
        return res.path("request_id").asText();
    }

    @Override
    @Retry(name = "idfy")
    @CircuitBreaker(name = "idfy")
    public Optional<Result> fetch(String requestId) {
        JsonNode res = http.get().uri(uri -> uri.path("/tasks").queryParam("request_id", requestId).build())
                .retrieve().body(JsonNode.class);
        JsonNode task = res != null && res.isArray() && !res.isEmpty() ? res.get(0) : res;
        if (task == null) {
            return Optional.empty();
        }
        String status = task.path("status").asText();
        if ("in_progress".equals(status)) {
            return Optional.empty();
        }
        JsonNode result = task.path("result").path("source_output");
        boolean verified = "completed".equals(status) && "id_found".equals(result.path("status").asText());
        return Optional.of(new Result(verified, task.toString()));
    }
}
