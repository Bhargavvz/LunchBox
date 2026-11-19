package com.lunchbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.UUID;

import static com.lunchbox.support.TestBeans.token;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Demo data round trip (load → every admin list has data → it cannot reach real operations → removed without a trace)
 * and the rebuilt log (summaries, severity and module filters, CSV export) and payments list.
 */
class AdminDataIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void demoDataLoadsIsHarmlessAndRemovesCleanly() throws Exception {
        UUID adminId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (id, firebase_uid, role, email, display_name, status, preferred_language, created_at, updated_at)
                VALUES (?, 'demo-admin-uid', 'SUPER_ADMIN', 'demo-admin@lunchbox.test', 'Demo Admin', 'ACTIVE', 'en', now(), now())
                """, adminId);
        String admin = token("demo-admin-uid", null, "demo-admin@lunchbox.test", true);
        long realSchools = count("SELECT count(*) FROM schools");

        JsonNode loaded = post("/api/v1/admin/demo-data", admin, null, 200);
        assertThat(loaded.get("present").asBoolean()).isTrue();
        assertThat(loaded.get("records").get("schools").asInt()).isEqualTo(4);
        assertThat(loaded.get("records").get("delivery_partners").asInt()).isEqualTo(12);
        assertThat(loaded.get("records").get("orders").asInt()).isGreaterThan(500);
        post("/api/v1/admin/demo-data", admin, null, 409);

        // Harmless: parents cannot find demo schools, demo riders cannot work, nothing is waiting to be allocated.
        assertThat(count("SELECT count(*) FROM schools WHERE code LIKE 'DEMO-%' AND active")).isZero();
        assertThat(count("SELECT count(*) FROM delivery_partners p JOIN demo_records d ON d.record_id = p.id WHERE p.active")).isZero();
        assertThat(count("""
                SELECT count(*) FROM orders o JOIN demo_records d ON d.record_id = o.id
                WHERE o.status IN ('SCHEDULED', 'REASSIGNED')""")).isZero();
        assertThat(count("SELECT count(*) FROM plans WHERE code = 'DEMO_MONTHLY' AND active")).isZero();
        assertThat(count("SELECT count(*) FROM coupons WHERE code = 'DEMOWELCOME' AND active")).isZero();

        // Every list the admin panel shows has something in it.
        assertThat(get200("/api/v1/admin/payments", admin).get("totalElements").asInt()).isGreaterThan(40);
        assertThat(get200("/api/v1/admin/allocation/runs", admin).size()).isGreaterThanOrEqualTo(5);
        assertThat(get200("/api/v1/admin/partners?size=50", admin).get("totalElements").asInt()).isGreaterThanOrEqualTo(12);
        assertThat(get200("/api/v1/admin/children?size=50", admin).get("totalElements").asInt()).isGreaterThanOrEqualTo(50);

        // The log reads in plain English and filters by module and severity.
        JsonNode demoLog = get200("/api/v1/admin/audit-logs?module=demo", admin);
        assertThat(demoLog.get("items")).anySatisfy(e -> {
            assertThat(e.get("action").asText()).isEqualTo("demo.seeded");
            assertThat(e.get("summary").asText()).isEqualTo("Demo data was loaded.");
            assertThat(e.get("severity").asText()).isEqualTo("INFO");
            assertThat(e.get("actorName").asText()).isEqualTo("Demo Admin");
        });
        assertThat(get200("/api/v1/admin/audit-logs?severity=ERROR&module=demo", admin).get("items")).isEmpty();
        MvcResult csv = mvc.perform(MockMvcRequestBuilders.get("/api/v1/admin/audit-logs.csv?module=demo")
                .header("Authorization", "Bearer " + admin)).andReturn();
        assertThat(csv.getResponse().getStatus()).isEqualTo(200);
        assertThat(csv.getResponse().getContentAsString()).contains("time,severity,module,summary").contains("Demo data was loaded.");

        // Removal deletes every demo row and nothing else.
        JsonNode removed = delete("/api/v1/admin/demo-data", admin, 200);
        assertThat(removed.get("present").asBoolean()).isFalse();
        assertThat(count("SELECT count(*) FROM demo_records")).isZero();
        assertThat(count("SELECT count(*) FROM schools WHERE code LIKE 'DEMO-%'")).isZero();
        assertThat(count("SELECT count(*) FROM users WHERE firebase_uid LIKE 'demo-parent-%' OR firebase_uid LIKE 'demo-rider-%'")).isZero();
        assertThat(count("SELECT count(*) FROM schools")).isEqualTo(realSchools);
        assertThat(count("SELECT count(*) FROM users WHERE id = ?", adminId)).isEqualTo(1);
    }

    private long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    @Test
    void onlyASuperAdminCanDeleteAParentAccountOnRequest() throws Exception {
        UUID superId = UUID.randomUUID();
        UUID opsId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (id, firebase_uid, role, email, display_name, status, preferred_language, created_at, updated_at)
                VALUES (?, 'erase-super-uid', 'SUPER_ADMIN', 'erase-super@lunchbox.test', 'Super', 'ACTIVE', 'en', now(), now()),
                       (?, 'erase-ops-uid', 'OPS_ADMIN', 'erase-ops@lunchbox.test', 'Ops', 'ACTIVE', 'en', now(), now())
                """, superId, opsId);
        UUID parentUser = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (id, firebase_uid, role, display_name, status, preferred_language, created_at, updated_at)
                VALUES (?, NULL, 'PARENT', 'Asha Rao', 'ACTIVE', 'en', now(), now())
                """, parentUser);
        jdbc.update("INSERT INTO parents (id, user_id, first_name, last_name, created_at, updated_at) VALUES (?, ?, 'Asha', 'Rao', now(), now())",
                UUID.randomUUID(), parentUser);
        String ops = token("erase-ops-uid", null, "erase-ops@lunchbox.test", true);
        String superAdmin = token("erase-super-uid", null, "erase-super@lunchbox.test", true);

        post("/api/v1/admin/users/" + parentUser + "/erase", ops, null, 403);
        post("/api/v1/admin/users/" + parentUser + "/erase", superAdmin, null, 204);

        assertThat(jdbc.queryForObject("SELECT status FROM users WHERE id = ?", String.class, parentUser)).isEqualTo("DELETED");
        assertThat(jdbc.queryForObject("SELECT display_name FROM users WHERE id = ?", String.class, parentUser)).isNotEqualTo("Asha Rao");
        // Staff accounts are closed differently and cannot be erased this way.
        post("/api/v1/admin/users/" + opsId + "/erase", superAdmin, null, 403);
    }
}
