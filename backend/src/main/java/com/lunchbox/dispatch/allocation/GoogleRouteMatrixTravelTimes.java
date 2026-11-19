package com.lunchbox.dispatch.allocation;

import com.fasterxml.jackson.databind.JsonNode;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.Point;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Road distances and riding times from Google's Routes API ({@code computeRouteMatrix}, two-wheeler, traffic-unaware),
 * cached in Redis for 30 days per (origin, destination) rounded to ~1 m. Riders start from the same few places and
 * homes do not move, so after the first run nearly every lookup is a cache hit and costs nothing. Any failure falls
 * back to the straight-line estimate for the legs it could not get; allocation never waits on Google.
 */
@Slf4j
public class GoogleRouteMatrixTravelTimes implements TravelTimeProvider {

    private static final int CHUNK = 25; // 25 × 25 = 625 elements, the per-request limit
    private static final Duration CACHE_TTL = Duration.ofDays(30);
    private static final String FIELD_MASK = "originIndex,destinationIndex,distanceMeters,duration,condition";

    private final RestClient http;
    private final String apiKey;
    private final StringRedisTemplate redis;
    private final MeterRegistry meters;

    public GoogleRouteMatrixTravelTimes(RestClient http, String apiKey, StringRedisTemplate redis, MeterRegistry meters) {
        this.http = http;
        this.apiKey = apiKey;
        this.redis = redis;
        this.meters = meters;
    }

    @Override
    public String name() {
        return "google-routes";
    }

    @Override
    public List<Leg> legs(List<Pair> pairs, AllocationWeights weights) {
        Leg[] out = new Leg[pairs.size()];
        List<String> keys = pairs.stream().map(GoogleRouteMatrixTravelTimes::key).toList();
        List<String> cached = cacheGet(keys);
        // origin key -> (destination key -> pair indexes) for the misses
        Map<String, Map<String, List<Integer>>> misses = new LinkedHashMap<>();
        Map<String, Point> points = new HashMap<>();
        for (int i = 0; i < pairs.size(); i++) {
            String hit = cached.get(i);
            if (hit != null) {
                String[] parts = hit.split(",");
                out[i] = new Leg(Double.parseDouble(parts[0]), Double.parseDouble(parts[1]), true);
                continue;
            }
            String o = coord(pairs.get(i).from());
            String d = coord(pairs.get(i).to());
            points.put(o, pairs.get(i).from());
            points.put(d, pairs.get(i).to());
            misses.computeIfAbsent(o, x -> new LinkedHashMap<>()).computeIfAbsent(d, x -> new ArrayList<>()).add(i);
        }
        meters.counter("lunchbox.allocation.travel_cache", "result", "hit").increment(pairs.size() - countMisses(misses));
        meters.counter("lunchbox.allocation.travel_cache", "result", "miss").increment(countMisses(misses));

        List<String> origins = new ArrayList<>(misses.keySet());
        for (int oi = 0; oi < origins.size(); oi += CHUNK) {
            List<String> originChunk = origins.subList(oi, Math.min(origins.size(), oi + CHUNK));
            List<String> destinations = originChunk.stream().flatMap(o -> misses.get(o).keySet().stream()).distinct().toList();
            for (int di = 0; di < destinations.size(); di += CHUNK) {
                List<String> destChunk = destinations.subList(di, Math.min(destinations.size(), di + CHUNK));
                try {
                    fetch(originChunk, destChunk, points, misses, pairs, out);
                } catch (RuntimeException e) {
                    meters.counter("lunchbox.allocation.travel_errors").increment();
                    log.warn("Route matrix request failed; using estimates for {}×{} legs: {}", originChunk.size(),
                            destChunk.size(), e.getMessage());
                }
            }
        }
        for (int i = 0; i < out.length; i++) {
            if (out[i] == null) {
                out[i] = EstimatedTravelTimes.estimate(pairs.get(i), weights);
            }
        }
        return List.of(out);
    }

    private void fetch(List<String> origins, List<String> destinations, Map<String, Point> points,
                       Map<String, Map<String, List<Integer>>> misses, List<Pair> pairs, Leg[] out) {
        Map<String, Object> body = Map.of(
                "origins", origins.stream().map(o -> waypoint(points.get(o))).toList(),
                "destinations", destinations.stream().map(d -> waypoint(points.get(d))).toList(),
                "travelMode", "TWO_WHEELER");
        JsonNode response = http.post().uri("/distanceMatrix/v2:computeRouteMatrix")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Goog-Api-Key", apiKey)
                .header("X-Goog-FieldMask", FIELD_MASK)
                .body(body)
                .retrieve()
                .body(JsonNode.class);
        if (response == null || !response.isArray()) {
            throw new IllegalStateException("Unexpected route matrix response");
        }
        Map<String, String> toCache = new HashMap<>();
        for (JsonNode e : response) {
            if (!"ROUTE_EXISTS".equals(e.path("condition").asText()) || !e.has("distanceMeters")) {
                continue;
            }
            String o = origins.get(e.path("originIndex").asInt());
            String d = destinations.get(e.path("destinationIndex").asInt());
            List<Integer> wanted = misses.getOrDefault(o, Map.of()).get(d);
            if (wanted == null) {
                continue;
            }
            double metersValue = e.path("distanceMeters").asDouble();
            double seconds = parseSeconds(e.path("duration").asText("0s"));
            for (int i : wanted) {
                out[i] = new Leg(metersValue, seconds, true);
            }
            toCache.put(key(pairs.get(wanted.get(0))), metersValue + "," + seconds);
        }
        cachePut(toCache);
    }

    private static Map<String, Object> waypoint(Point p) {
        return Map.of("waypoint", Map.of("location", Map.of("latLng", Map.of("latitude", p.getY(), "longitude", p.getX()))));
    }

    static double parseSeconds(String duration) {
        String s = duration.endsWith("s") ? duration.substring(0, duration.length() - 1) : duration;
        return s.isBlank() ? 0 : Double.parseDouble(s);
    }

    private static int countMisses(Map<String, Map<String, List<Integer>>> misses) {
        return misses.values().stream().flatMap(m -> m.values().stream()).mapToInt(List::size).sum();
    }

    private static String coord(Point p) {
        return String.format(Locale.ROOT, "%.5f,%.5f", p.getY(), p.getX());
    }

    private static String key(Pair p) {
        return "travel:v1:" + coord(p.from()) + ":" + coord(p.to());
    }

    private List<String> cacheGet(List<String> keys) {
        try {
            List<String> values = redis.opsForValue().multiGet(keys);
            if (values != null && values.size() == keys.size()) {
                return values;
            }
        } catch (RuntimeException e) {
            log.warn("Travel cache unavailable: {}", e.getMessage());
        }
        List<String> none = new ArrayList<>(keys.size());
        keys.forEach(k -> none.add(null));
        return none;
    }

    private void cachePut(Map<String, String> values) {
        try {
            values.forEach((k, v) -> redis.opsForValue().set(k, v, CACHE_TTL));
        } catch (RuntimeException e) {
            log.warn("Could not cache travel times: {}", e.getMessage());
        }
    }
}
