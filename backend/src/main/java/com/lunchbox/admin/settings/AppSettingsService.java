package com.lunchbox.admin.settings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.settings.PlatformSettings;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;

/**
 * Admin-editable settings in {@code app_settings}. Values are cached in memory and refreshed every 30 s so every
 * instance converges quickly after an edit; the instance handling the edit refreshes immediately.
 */
@Slf4j
@Service
public class AppSettingsService implements PlatformSettings {

    private static final Map<String, Predicate<JsonNode>> VALIDATORS = Map.of(
            "order.cutoff_time", v -> v.isTextual() && parsesTime(v.asText()),
            "order.pickup_lead_minutes", v -> v.isInt() && v.asInt() >= 15 && v.asInt() <= 240,
            "order.pickup_window_minutes", v -> v.isInt() && v.asInt() >= 10 && v.asInt() <= 120,
            "geofence.home_arrival_radius_m", v -> v.isInt() && v.asInt() >= 20 && v.asInt() <= 500,
            "geofence.default_school_radius_m", v -> v.isInt() && v.asInt() >= 50 && v.asInt() <= 2000,
            "dispatch.pickup_wait_minutes", v -> v.isInt() && v.asInt() >= 1 && v.asInt() <= 30,
            "dispatch.no_show_grace_minutes", v -> v.isInt() && v.asInt() >= 5 && v.asInt() <= 120,
            "pay.rates", AppSettingsService::validRates);

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final AuditService audit;
    private final ConcurrentHashMap<String, JsonNode> cache = new ConcurrentHashMap<>();

    public AppSettingsService(JdbcTemplate jdbc, ObjectMapper objectMapper, AuditService audit) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.audit = audit;
    }

    public record SettingResponse(String key, JsonNode value, String description, UUID updatedBy, Instant updatedAt,
                                  long version) {
    }

    public record UpdateSettingRequest(JsonNode value, long version) {
    }

    @Scheduled(fixedDelay = 30_000, initialDelay = 0)
    public void refresh() {
        jdbc.query("SELECT key, value::text AS value FROM app_settings", rs -> {
            try {
                cache.put(rs.getString("key"), objectMapper.readTree(rs.getString("value")));
            } catch (Exception e) {
                log.error("Unreadable setting {}", rs.getString("key"), e);
            }
        });
    }

    private JsonNode get(String key) {
        JsonNode v = cache.get(key);
        if (v == null) {
            refresh();
            v = cache.get(key);
        }
        if (v == null) {
            throw new IllegalStateException("Missing app setting " + key);
        }
        return v;
    }

    @Override
    public LocalTime orderCutoffTime() {
        return LocalTime.parse(get("order.cutoff_time").asText());
    }

    @Override
    public int pickupLeadMinutes() {
        return get("order.pickup_lead_minutes").asInt();
    }

    @Override
    public int pickupWindowMinutes() {
        return get("order.pickup_window_minutes").asInt();
    }

    @Override
    public int homeArrivalRadiusM() {
        return get("geofence.home_arrival_radius_m").asInt();
    }

    @Override
    public int defaultSchoolGeofenceRadiusM() {
        return get("geofence.default_school_radius_m").asInt();
    }

    @Override
    public int pickupWaitMinutes() {
        return get("dispatch.pickup_wait_minutes").asInt();
    }

    @Override
    public int noShowGraceMinutes() {
        return get("dispatch.no_show_grace_minutes").asInt();
    }

    @Override
    public PayRates payRates() {
        JsonNode r = get("pay.rates");
        return new PayRates(r.path("baseDayPaise").asLong(), r.path("perDeliveryPaise").asLong(),
                r.path("perKmPaise").asLong(), r.path("onTimeBonusPaise").asLong(),
                r.path("failedDeliveryPenaltyPaise").asLong(), r.path("noShowPenaltyPaise").asLong(),
                r.path("minPayoutPaise").asLong());
    }

    @Transactional(readOnly = true)
    public List<SettingResponse> list() {
        return jdbc.query("SELECT key, value::text AS value, description, updated_by, updated_at, version FROM app_settings ORDER BY key",
                (rs, i) -> {
                    try {
                        return new SettingResponse(rs.getString("key"), objectMapper.readTree(rs.getString("value")),
                                rs.getString("description"), rs.getObject("updated_by", UUID.class),
                                rs.getTimestamp("updated_at").toInstant(), rs.getLong("version"));
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                });
    }

    /** Optimistic concurrency via the version column: two admins editing at once cannot overwrite each other. */
    @Transactional
    public SettingResponse update(String key, UpdateSettingRequest request, CurrentUser admin) {
        Predicate<JsonNode> validator = VALIDATORS.get(key);
        if (validator == null) {
            throw Errors.notFound("Setting");
        }
        if (request.value() == null || !validator.test(request.value())) {
            throw Errors.badRequest("invalid_setting", "That value is not valid for " + key + ".");
        }
        JsonNode before = get(key);
        int updated = jdbc.update("""
                UPDATE app_settings SET value = CAST(? AS jsonb), updated_by = ?, updated_at = now(), version = version + 1
                WHERE key = ? AND version = ?
                """, request.value().toString(), admin.userId(), key, request.version());
        if (updated == 0) {
            throw Errors.conflict("concurrent_update", "This setting was changed by someone else. Refresh and try again.");
        }
        audit.record("setting.updated", "AppSetting", key, Map.of("value", before), Map.of("value", request.value()));
        cache.put(key, request.value());
        return list().stream().filter(s -> s.key().equals(key)).findFirst().orElseThrow();
    }

    private static boolean parsesTime(String s) {
        try {
            LocalTime.parse(s);
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }

    private static boolean validRates(JsonNode v) {
        if (!v.isObject()) {
            return false;
        }
        for (String f : List.of("baseDayPaise", "perDeliveryPaise", "perKmPaise", "onTimeBonusPaise",
                "failedDeliveryPenaltyPaise", "noShowPenaltyPaise", "minPayoutPaise")) {
            JsonNode n = v.get(f);
            if (n == null || !n.canConvertToLong() || n.asLong() < 0 || n.asLong() > 10_000_000) {
                return false;
            }
        }
        return true;
    }
}
