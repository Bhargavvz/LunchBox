package com.lunchbox.tracking;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.geo.Circle;
import org.springframework.data.geo.Distance;
import org.springframework.data.geo.GeoResults;
import org.springframework.data.geo.Metrics;
import org.springframework.data.geo.Point;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Redis state for live tracking:
 * <ul>
 *   <li>{@code trk:geo} — GEO set of latest partner positions (nearby search for ops)</li>
 *   <li>{@code trk:last:<partnerId>} — hash with the latest fix</li>
 *   <li>{@code trk:partner-orders:<partnerId>} — orders whose parents may currently watch this partner</li>
 *   <li>{@code trk:order-meta:<orderId>} — status and current destination of an order</li>
 *   <li>{@code trk:buffer} — list of pings waiting to be batch-persisted</li>
 * </ul>
 */
@Component
public class LiveLocationStore {

    static final String GEO = "trk:geo";
    static final String BUFFER = "trk:buffer";
    private static final Duration STATE_TTL = Duration.ofHours(18);

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    public LiveLocationStore(StringRedisTemplate redis, ObjectMapper objectMapper) {
        this.redis = redis;
        this.objectMapper = objectMapper;
    }

    public record Fix(double lat, double lng, Double accuracyM, Double speedMps, Double headingDeg, Integer batteryPct,
                      Instant recordedAt) {
    }

    public record BufferedPing(UUID id, UUID partnerId, UUID routeId, double lat, double lng, Double accuracyM,
                               Double speedMps, Double headingDeg, Integer batteryPct, Instant recordedAt,
                               Instant receivedAt) {
    }

    public record OrderMeta(String status, double destLat, double destLng, String destType) {
    }

    public Optional<Fix> last(UUID partnerId) {
        Map<Object, Object> h = redis.opsForHash().entries("trk:last:" + partnerId);
        if (h.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new Fix(d(h.get("lat")), d(h.get("lng")), dn(h.get("acc")), dn(h.get("spd")), dn(h.get("hdg")),
                h.get("bat") == null ? null : Integer.valueOf(h.get("bat").toString()),
                Instant.ofEpochMilli(Long.parseLong(h.get("ts").toString()))));
    }

    public void updateLatest(UUID partnerId, Fix fix) {
        redis.opsForGeo().add(GEO, new Point(fix.lng(), fix.lat()), partnerId.toString());
        Map<String, String> h = new HashMap<>();
        h.put("lat", String.valueOf(fix.lat()));
        h.put("lng", String.valueOf(fix.lng()));
        h.put("ts", String.valueOf(fix.recordedAt().toEpochMilli()));
        if (fix.accuracyM() != null) h.put("acc", String.valueOf(fix.accuracyM()));
        if (fix.speedMps() != null) h.put("spd", String.valueOf(fix.speedMps()));
        if (fix.headingDeg() != null) h.put("hdg", String.valueOf(fix.headingDeg()));
        if (fix.batteryPct() != null) h.put("bat", String.valueOf(fix.batteryPct()));
        String key = "trk:last:" + partnerId;
        redis.opsForHash().putAll(key, h);
        redis.expire(key, STATE_TTL);
    }

    public void buffer(List<BufferedPing> pings) {
        if (pings.isEmpty()) {
            return;
        }
        List<String> json = new ArrayList<>(pings.size());
        for (BufferedPing p : pings) {
            try {
                json.add(objectMapper.writeValueAsString(p));
            } catch (JsonProcessingException e) {
                throw new IllegalStateException(e);
            }
        }
        redis.opsForList().rightPushAll(BUFFER, json);
    }

    public List<BufferedPing> drain(int max) {
        List<String> raw = redis.opsForList().leftPop(BUFFER, max);
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        List<BufferedPing> out = new ArrayList<>(raw.size());
        for (String s : raw) {
            try {
                out.add(objectMapper.readValue(s, BufferedPing.class));
            } catch (JsonProcessingException e) {
                // A malformed entry must not block the pipeline; it is dropped.
            }
        }
        return out;
    }

    public Set<String> trackableOrders(UUID partnerId) {
        Set<String> members = redis.opsForSet().members("trk:partner-orders:" + partnerId);
        return members == null ? Set.of() : members;
    }

    public void addTrackable(UUID partnerId, UUID orderId, OrderMeta meta) {
        String setKey = "trk:partner-orders:" + partnerId;
        redis.opsForSet().add(setKey, orderId.toString());
        redis.expire(setKey, STATE_TTL);
        redis.opsForValue().set("trk:order-partner:" + orderId, partnerId.toString(), STATE_TTL);
        putMeta(orderId, meta);
    }

    public void removeTrackable(UUID orderId) {
        String partner = redis.opsForValue().get("trk:order-partner:" + orderId);
        if (partner != null) {
            redis.opsForSet().remove("trk:partner-orders:" + partner, orderId.toString());
        }
        redis.delete(List.of("trk:order-partner:" + orderId, "trk:order-meta:" + orderId));
    }

    public void putMeta(UUID orderId, OrderMeta meta) {
        redis.opsForValue().set("trk:order-meta:" + orderId,
                meta.status() + "|" + meta.destLat() + "|" + meta.destLng() + "|" + meta.destType(), STATE_TTL);
    }

    public Optional<OrderMeta> meta(UUID orderId) {
        String v = redis.opsForValue().get("trk:order-meta:" + orderId);
        if (v == null) {
            return Optional.empty();
        }
        String[] p = v.split("\\|");
        return Optional.of(new OrderMeta(p[0], Double.parseDouble(p[1]), Double.parseDouble(p[2]), p[3]));
    }

    /** True at most once per {@code window} per key: used for throttling and one-shot geofence triggers. */
    public boolean once(String key, Duration window) {
        return Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key, "1", window));
    }

    public List<UUID> nearby(double lat, double lng, double radiusM, int limit) {
        GeoResults<RedisGeoCommands.GeoLocation<String>> results = redis.opsForGeo().radius(GEO,
                new Circle(new Point(lng, lat), new Distance(radiusM / 1000.0, Metrics.KILOMETERS)),
                RedisGeoCommands.GeoRadiusCommandArgs.newGeoRadiusArgs().sortAscending().limit(limit));
        if (results == null) {
            return List.of();
        }
        return results.getContent().stream().map(r -> UUID.fromString(r.getContent().getName())).toList();
    }

    public List<UUID> allLivePartners() {
        Set<String> members = redis.opsForZSet().range(GEO, 0, -1);
        return members == null ? List.of() : members.stream().map(UUID::fromString).toList();
    }

    public void forget(UUID partnerId) {
        redis.opsForGeo().remove(GEO, partnerId.toString());
        redis.delete("trk:last:" + partnerId);
    }

    private static double d(Object o) {
        return Double.parseDouble(o.toString());
    }

    private static Double dn(Object o) {
        return o == null ? null : Double.valueOf(o.toString());
    }
}
