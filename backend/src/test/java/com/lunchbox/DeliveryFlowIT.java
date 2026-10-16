package com.lunchbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.dispatch.KycService;
import com.lunchbox.payments.FakePaymentGateway;
import com.lunchbox.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.lunchbox.support.TestBeans.token;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * End-to-end: school + plan setup → parent registers with consent → child, address, subscription paid →
 * partner onboarded with KYC → orders generated after cut-off → auto-assigned → route started → OTP pickup →
 * geofenced photo handover → DELIVERED, with earnings written by the async pipeline.
 */
class DeliveryFlowIT extends IntegrationTest {

    private static final double SCHOOL_LAT = 12.9750;
    private static final double SCHOOL_LNG = 77.6000;
    private static final double HOME_LAT = 12.9690;
    private static final double HOME_LNG = 77.5950;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    KycService kyc;

    @Test
    void lunchboxGoesFromHomeToSchool() throws Exception {
        // ---- Platform setup (Sunday 10:00 IST) ----
        UUID adminId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (id, firebase_uid, role, email, display_name, status, preferred_language, created_at, updated_at)
                VALUES (?, 'admin-uid', 'SUPER_ADMIN', 'ops@lunchbox.test', 'Ops', 'ACTIVE', 'en', now(), now())
                """, adminId);
        String admin = token("admin-uid", null, "ops@lunchbox.test", true);

        JsonNode school = post("/api/v1/admin/schools", admin, Map.ofEntries(
                Map.entry("code", "DPS-IT-1"), Map.entry("name", "Delhi Public School"),
                Map.entry("addressLine", "1 School Road"), Map.entry("city", "Bengaluru"), Map.entry("pincode", "560001"),
                Map.entry("location", Map.of("lat", SCHOOL_LAT, "lng", SCHOOL_LNG)), Map.entry("geofenceRadiusM", 200),
                Map.entry("lunchTime", "12:30"), Map.entry("deliveryWindowStart", "11:30"),
                Map.entry("deliveryWindowEnd", "12:15"),
                Map.entry("workingDays", List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY")),
                Map.entry("active", true)), 201);
        String schoolId = school.get("id").asText();

        post("/api/v1/admin/service-areas", admin, Map.of("name", "Central", "city", "Bengaluru", "active", true,
                "boundary", List.of(Map.of("lat", 12.90, "lng", 77.50), Map.of("lat", 12.90, "lng", 77.70),
                        Map.of("lat", 13.05, "lng", 77.70), Map.of("lat", 13.05, "lng", 77.50))), 201);

        JsonNode plan = post("/api/v1/admin/plans", admin, Map.of("code", "MONTHLY_5", "name", "Monthly · 5 days",
                "pricePaise", 249900, "billingPeriod", "MONTHLY", "maxDaysPerWeek", 5), 201);

        // ---- Parent onboarding ----
        String parent = token("parent-uid", "+919800000001", null, false);
        JsonNode me = get200("/api/v1/auth/me", parent);
        assertThat(me.get("registered").asBoolean()).isFalse();
        post("/api/v1/auth/register/parent", parent, Map.of("firstName", "Asha", "lastName", "Rao",
                "preferredLanguage", "en", "policyVersion", "2026-10",
                "consents", List.of(Map.of("purpose", "ACCOUNT_AND_SERVICE", "granted", true),
                        Map.of("purpose", "CHILD_DATA_PROCESSING", "granted", true),
                        Map.of("purpose", "LIVE_TRACKING", "granted", true))), 201);

        JsonNode address = post("/api/v1/addresses", parent, Map.of("label", "Home", "line1", "12 Lotus Residency",
                "city", "Bengaluru", "pincode", "560025", "location", Map.of("lat", HOME_LAT, "lng", HOME_LNG),
                "instructions", "Ring twice", "makeDefault", true), 201);
        JsonNode child = post("/api/v1/children", parent, Map.of("schoolId", schoolId, "firstName", "Meera",
                "className", "4", "section", "B", "rollNumber", "17"), 201);

        JsonNode checkout = post("/api/v1/subscriptions", parent, Map.of("childId", child.get("id").asText(),
                "planId", plan.get("id").asText(), "addressId", address.get("id").asText(),
                "daysOfWeek", List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"),
                "startDate", "2026-10-19"), 201);
        String providerSub = checkout.get("providerSubscriptionId").asText();
        String paymentId = "pay_it_" + UUID.randomUUID().toString().substring(0, 8);
        JsonNode sub = post("/api/v1/subscriptions/" + checkout.get("subscriptionId").asText() + "/verify", parent,
                Map.of("razorpayPaymentId", paymentId,
                        "razorpaySignature", FakePaymentGateway.sign(paymentId, providerSub)), 200);
        assertThat(sub.get("status").asText()).isEqualTo("ACTIVE");

        // ---- Partner onboarding + KYC ----
        JsonNode partner = post("/api/v1/admin/partners", admin, Map.of("phone", "+919800000002", "profile", Map.of(
                "firstName", "Ravi", "vehicleType", "SCOOTER", "vehicleNumber", "KA01AB1234", "capacity", 8,
                "homeZone", Map.of("lat", 12.9700, "lng", 77.5900), "serviceRadiusM", 6000)), 201);
        String partnerId = partner.get("id").asText();
        List<String> docIds = new ArrayList<>();
        for (String type : List.of("AADHAAR", "DRIVING_LICENSE", "PHOTO")) {
            JsonNode doc = post("/api/v1/admin/partners/" + partnerId + "/kyc/documents", admin, Map.of(
                    "docType", type, "s3Key", "kyc/" + partnerId + "/" + type.toLowerCase() + ".jpg",
                    "documentNumber", type.equals("PHOTO") ? "" : "DOC" + type.hashCode()), 201);
            docIds.add(doc.get("id").asText());
        }
        post("/api/v1/admin/partners/" + partnerId + "/kyc/documents/" + docIds.get(0) + "/review?verified=true", admin, null, 200);
        post("/api/v1/admin/partners/" + partnerId + "/kyc/documents/" + docIds.get(2) + "/review?verified=true", admin, null, 200);
        kyc.pollPending();
        post("/api/v1/admin/partners/" + partnerId + "/kyc/decision", admin, Map.of("approved", true, "notes", "OK"), 204);

        String partnerToken = token("partner-uid", "+919800000002", null, false);
        JsonNode partnerMe = get200("/api/v1/auth/me", partnerToken);
        assertThat(partnerMe.get("role").asText()).isEqualTo("PARTNER");
        post("/api/v1/admin/partners/" + partnerId + "/shifts", admin,
                Map.of("date", "2026-10-19", "plannedStart", "09:00", "plannedEnd", "13:00"), 200);

        // ---- After the cut-off: generate and assign Monday's orders ----
        clock.set(Instant.parse("2026-10-18T16:00:00Z")); // 21:30 IST
        JsonNode generated = post("/api/v1/admin/jobs/generate-orders?date=2026-10-19", admin, null, 200);
        assertThat(generated.get("created").asInt()).isEqualTo(1);
        JsonNode assigned = post("/api/v1/admin/jobs/auto-assign?date=2026-10-19", admin, null, 200);
        assertThat(assigned.get("assigned").asInt()).isEqualTo(1);

        // ---- Monday morning ----
        clock.set(Instant.parse("2026-10-19T03:30:00Z")); // 09:00 IST
        post("/api/v1/partner/shift/start", partnerToken, Map.of("location", Map.of("lat", 12.97, "lng", 77.59)), 200);
        JsonNode route = post("/api/v1/partner/route/start", partnerToken, null, 200);
        assertThat(route.get("stops")).hasSize(2);
        JsonNode pickupStop = route.get("stops").get(0);
        assertThat(pickupStop.get("type").asText()).isEqualTo("PICKUP");
        // Child-safety: the partner sees only the parent's first name and a masked number.
        assertThat(pickupStop.get("pickup").get("parentFirstName").asText()).isEqualTo("Asha");
        assertThat(pickupStop.get("pickup").get("maskedPhone").asText()).contains("XX").doesNotContain("98000000");
        String orderId = pickupStop.get("pickup").get("orderId").asText();

        JsonNode today = get200("/api/v1/orders/today", parent);
        assertThat(today.get(0).get("status").asText()).isEqualTo("PARTNER_EN_ROUTE");

        // Another parent can never see this order.
        String stranger = token("stranger-uid", "+919800000099", null, false);
        post("/api/v1/auth/register/parent", stranger, Map.of("firstName", "X", "policyVersion", "2026-10",
                "consents", List.of(Map.of("purpose", "ACCOUNT_AND_SERVICE", "granted", true))), 201);
        call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/orders/" + orderId),
                stranger, null, 404);

        JsonNode code = get200("/api/v1/orders/" + orderId + "/pickup-code", parent);
        String otp = code.get("otp").asText();
        assertThat(otp).hasSize(6);

        post("/api/v1/partner/orders/" + orderId + "/pickup", partnerToken,
                Map.of("method", "OTP", "code", "000000", "location", Map.of("lat", HOME_LAT, "lng", HOME_LNG)), 422);
        JsonNode afterPickup = post("/api/v1/partner/orders/" + orderId + "/pickup", partnerToken,
                Map.of("method", "OTP", "code", otp, "location", Map.of("lat", HOME_LAT, "lng", HOME_LNG)), 200);
        assertThat(afterPickup.get("stops").get(0).get("status").asText()).isEqualTo("COMPLETED");

        // Handover outside the school geofence is refused.
        clock.advance(Duration.ofMinutes(40));
        JsonNode upload = post("/api/v1/partner/handover/upload-url", partnerToken, null, 200);
        post("/api/v1/partner/schools/" + schoolId + "/handover", partnerToken,
                Map.of("photoKey", upload.get("key").asText(), "location", Map.of("lat", 12.990, "lng", 77.620)), 422);
        post("/api/v1/partner/schools/" + schoolId + "/handover", partnerToken,
                Map.of("photoKey", upload.get("key").asText(), "location", Map.of("lat", SCHOOL_LAT + 0.0005, "lng", SCHOOL_LNG)), 200);

        JsonNode detail = get200("/api/v1/orders/" + orderId, parent);
        assertThat(detail.get("order").get("status").asText()).isEqualTo("DELIVERED");
        List<String> timeline = new ArrayList<>();
        detail.get("timeline").forEach(e -> timeline.add(e.get("status").asText()));
        assertThat(timeline).containsSubsequence("SCHEDULED", "ASSIGNED", "PARTNER_EN_ROUTE", "PICKED_UP", "IN_TRANSIT",
                "AT_SCHOOL", "DELIVERED");

        // Outbox → RabbitMQ → earnings consumer writes the delivery + on-time entries.
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM earnings_ledger WHERE order_id = ?::uuid", Integer.class, orderId)).isEqualTo(2));

        Integer audits = jdbc.queryForObject("SELECT count(*) FROM audit_logs", Integer.class);
        assertThat(audits).isGreaterThan(10);
    }
}
