package com.lunchbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.List;
import java.util.Map;

import static com.lunchbox.support.TestBeans.token;
import static org.assertj.core.api.Assertions.assertThat;

/** Parent profile editing: email, profile photo (signed upload, ownership and size checks) and a verified phone change. */
class ParentProfileIT extends IntegrationTest {

    private String register(String uid, String phone, String name) throws Exception {
        String t = token(uid, phone, null, false);
        post("/api/v1/auth/register/parent", t, Map.of("firstName", name, "policyVersion", "2026-10",
                "consents", List.of(Map.of("purpose", "ACCOUNT_AND_SERVICE", "granted", true))), 201);
        return t;
    }

    private JsonNode patchMe(String t, Map<String, Object> body, int status) throws Exception {
        return call(MockMvcRequestBuilders.patch("/api/v1/me"), t, body, status);
    }

    @Test
    void parentEditsProfileAndPhoto() throws Exception {
        String asha = register("profile-asha", "+919811100001", "Asha");
        String ravi = register("profile-ravi", "+919811100002", "Ravi");

        // Name and email; email is normalised, can be cleared, and cannot be taken from another account.
        JsonNode me = patchMe(asha, Map.of("firstName", "Asha", "lastName", "Rao", "email", "Asha.Rao@Example.com"), 200);
        assertThat(me.get("email").asText()).isEqualTo("asha.rao@example.com");
        assertThat(me.get("parent").get("lastName").asText()).isEqualTo("Rao");
        patchMe(ravi, Map.of("email", "ASHA.RAO@example.com"), 409);
        patchMe(asha, Map.of("email", "not-an-email"), 400);
        assertThat(patchMe(asha, Map.of("email", ""), 200).get("email").isNull()).isTrue();

        // Default avatar until a photo is set.
        assertThat(get200("/api/v1/auth/me", asha).get("photoUrl").isNull()).isTrue();

        JsonNode upload = post("/api/v1/me/photo/upload-url", asha, null, 200);
        String key = upload.get("key").asText();
        String userId = get200("/api/v1/auth/me", asha).get("userId").asText();
        assertThat(key).startsWith("profiles/" + userId + "/").endsWith(".jpg");
        assertThat(upload.get("method").asText()).isEqualTo("PUT");

        // Another parent cannot claim this upload as their photo.
        put("/api/v1/me/photo", ravi, Map.of("key", key), 400);
        put("/api/v1/me/photo", asha, Map.of("key", "profiles/" + userId + "/../other.jpg"), 400);

        JsonNode withPhoto = put("/api/v1/me/photo", asha, Map.of("key", key), 200);
        assertThat(withPhoto.get("photoUrl").asText()).contains(key);
        assertThat(delete("/api/v1/me/photo", asha, 200).get("photoUrl").isNull()).isTrue();

        // Riders and staff cannot use the parent photo endpoints.
        post("/api/v1/me/photo/upload-url", token("profile-nobody", "+919811100009", null, false), null, 403);
    }

    @Test
    void phoneChangeAdoptsOnlyTheVerifiedNumber() throws Exception {
        register("profile-meena", "+919811100011", "Meena");
        register("profile-kiran", "+919811100012", "Kiran");

        // After the app verified +91 98111 00013 with an OTP, the refreshed token carries it.
        String changed = token("profile-meena", "+919811100013", null, false);
        assertThat(post("/api/v1/me/phone", changed, null, 200).get("phone").asText()).isEqualTo("+919811100013");

        // A number that already belongs to someone else is refused.
        post("/api/v1/me/phone", token("profile-meena", "+919811100012", null, false), null, 409);

        // A token without a phone number cannot change anything.
        post("/api/v1/me/phone", token("profile-meena", null, "meena@example.com", true), null, 400);
    }
}
