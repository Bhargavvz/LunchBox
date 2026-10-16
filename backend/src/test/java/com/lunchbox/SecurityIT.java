package com.lunchbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.Iterator;
import java.util.Map;
import java.util.UUID;

import static com.lunchbox.support.TestBeans.token;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SecurityIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void anonymousRequestsAreRejectedWithProblemDetails() throws Exception {
        mvc.perform(get("/api/v1/children"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthorized"));
    }

    @Test
    void invalidTokenIsRejected() throws Exception {
        mvc.perform(get("/api/v1/children").header("Authorization", "Bearer garbage"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unregisteredUserCannotUseTheApi() throws Exception {
        call(MockMvcRequestBuilders.get("/api/v1/children"), token("new-uid", "+919811111111", null, false), null, 403);
    }

    @Test
    void parentCannotUseAdminEndpoints() throws Exception {
        String parent = token("sec-parent", "+919822222222", null, false);
        post("/api/v1/auth/register/parent", parent, Map.of("firstName", "P", "policyVersion", "2026-10",
                "consents", java.util.List.of(Map.of("purpose", "ACCOUNT_AND_SERVICE", "granted", true))), 201);
        call(MockMvcRequestBuilders.get("/api/v1/admin/orders"), parent, null, 403);
        call(MockMvcRequestBuilders.get("/api/v1/partner/route/today"), parent, null, 403);
    }

    @Test
    void childCannotBeAddedWithoutParentalConsent() throws Exception {
        String parent = token("sec-parent-2", "+919833333333", null, false);
        post("/api/v1/auth/register/parent", parent, Map.of("firstName", "P", "policyVersion", "2026-10",
                "consents", java.util.List.of(Map.of("purpose", "ACCOUNT_AND_SERVICE", "granted", true))), 201);
        JsonNode problem = post("/api/v1/children", parent, Map.of("schoolId", UUID.randomUUID().toString(),
                "firstName", "Kid", "className", "1"), 422);
        assertThat(problem.get("code").asText()).isEqualTo("parental_consent_required");
    }

    @Test
    void adminWithoutMfaIsRejected() throws Exception {
        jdbc.update("""
                INSERT INTO users (id, firebase_uid, role, email, display_name, status, preferred_language, created_at, updated_at)
                VALUES (?, 'nomfa-admin', 'OPS_ADMIN', 'nomfa@lunchbox.test', 'Ops', 'ACTIVE', 'en', now(), now())
                ON CONFLICT DO NOTHING
                """, UUID.randomUUID());
        JsonNode problem = call(MockMvcRequestBuilders.get("/api/v1/admin/orders"),
                token("nomfa-admin", null, "nomfa@lunchbox.test", false), null, 403);
        assertThat(problem.get("code").asText()).isEqualTo("mfa_required");
    }

    @Test
    void webhookWithBadSignatureIsRejected() throws Exception {
        mvc.perform(MockMvcRequestBuilders.post("/api/v1/webhooks/razorpay")
                        .contentType("application/json")
                        .header("X-Razorpay-Signature", "deadbeef")
                        .content("{\"event\":\"subscription.charged\",\"payload\":{}}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void openApiDocumentsEveryApiOperationAsSecured() throws Exception {
        String body = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode spec = json.readTree(body);
        assertThat(spec.at("/components/securitySchemes/firebase/scheme").asText()).isEqualTo("bearer");
        assertThat(spec.at("/security/0").has("firebase")).isTrue();
        Iterator<String> paths = spec.get("paths").fieldNames();
        int count = 0;
        while (paths.hasNext()) {
            String path = paths.next();
            assertThat(path).startsWith("/api/v1/").doesNotStartWith("/api/v1/webhooks");
            count++;
        }
        assertThat(count).isGreaterThan(40);
        assertThat(spec.at("/components/schemas/OrderResponse/required").isArray()).isTrue();
    }
}
