package com.lunchbox.dispatch.routing;

import com.fasterxml.jackson.databind.JsonNode;
import com.google.auth.oauth2.GoogleCredentials;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.integration.NonRetryableIntegrationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Google Route Optimization API ({@code optimizeTours}) provider. Each lunchbox is a shipment: a pickup visit at home
 * inside its pickup window and a delivery visit at its school inside the school's delivery window, demand 1 against
 * the partner's capacity. The single vehicle starts at the partner's position and has an open end. Shipments Google
 * skips, or that are already past their window before departure, come back as late/unserved.
 *
 * <p>Uses real road network and traffic, unlike the straight-line {@link TravelModel}. Enabled with
 * {@code lunchbox.routing.provider=google}; {@link FailoverRouteOptimizer} falls back to OR-Tools on any error.</p>
 */
@Slf4j
public class GoogleRouteOptimizer implements RouteOptimizer {

    static final String LOAD = "lunchboxes";
    private static final long SKIP_PENALTY = 1_000_000L;
    private static final Duration HORIZON_BUFFER = Duration.ofHours(1);
    private static final String SCOPE = "https://www.googleapis.com/auth/cloud-platform";

    private final RestClient http;
    private final GoogleCredentials credentials;
    private final String projectId;
    private final Duration timeout;

    public GoogleRouteOptimizer(RestClient http, GoogleCredentials credentials, String projectId, Duration timeout) {
        this.http = http;
        this.credentials = credentials.createScoped(List.of(SCOPE));
        this.projectId = projectId;
        this.timeout = timeout;
    }

    @Override
    public String name() {
        return "google-route-optimization";
    }

    @Override
    public RoutePlan optimize(RoutingProblem problem) {
        if (problem.pickups().isEmpty()) {
            return new RoutePlan(name(), List.of(), 0, 0, List.of());
        }
        Request request = buildRequest(problem, timeout);
        JsonNode response = http.post()
                .uri("/projects/{project}:optimizeTours", projectId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken())
                .contentType(MediaType.APPLICATION_JSON)
                .body(request.body())
                .retrieve()
                .body(JsonNode.class);
        if (response == null) {
            throw new NonRetryableIntegrationException("Empty optimizeTours response");
        }
        RoutePlan plan = parseResponse(name(), problem, request, response);
        log.debug("Google planned {} stops, {} m, {} unserved", plan.stops().size(), plan.distanceMeters(),
                plan.lateOrUnservedOrderIds().size());
        return plan;
    }

    private String accessToken() {
        try {
            credentials.refreshIfExpired();
            return credentials.getAccessToken().getTokenValue();
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot obtain a Google access token", e);
        }
    }

    /**
     * The JSON body plus the order of the shipments it contains ({@code shipmentIndex} in the response refers to it)
     * and the orders that were infeasible before departure and therefore not sent.
     */
    record Request(Map<String, Object> body, List<PickupTask> shipments, List<UUID> preSkipped) {
    }

    static Request buildRequest(RoutingProblem p, Duration timeout) {
        Map<UUID, DropTarget> drops = new HashMap<>();
        p.drops().forEach(d -> drops.put(d.schoolId(), d));
        Instant start = p.departAt();

        List<PickupTask> sent = new ArrayList<>();
        List<UUID> preSkipped = new ArrayList<>();
        List<Map<String, Object>> shipments = new ArrayList<>();
        Instant end = start;
        for (PickupTask task : p.pickups()) {
            DropTarget drop = drops.get(task.schoolId());
            if (drop == null || !task.windowEnd().isAfter(start) || !drop.windowEnd().isAfter(start)) {
                preSkipped.add(task.orderId());
                continue;
            }
            Map<String, Object> pickup = visit(task.location(), p.pickupServiceTime(), later(task.windowStart(), start),
                    task.windowEnd());
            Map<String, Object> delivery = visit(drop.location(), p.dropServiceTime(), later(drop.windowStart(), start),
                    drop.windowEnd());
            Map<String, Object> shipment = new LinkedHashMap<>();
            shipment.put("label", task.orderId().toString());
            shipment.put("pickups", List.of(pickup));
            shipment.put("deliveries", List.of(delivery));
            shipment.put("loadDemands", Map.of(LOAD, Map.of("amount", "1")));
            shipment.put("penaltyCost", SKIP_PENALTY);
            shipments.add(shipment);
            sent.add(task);
            if (drop.windowEnd().isAfter(end)) {
                end = drop.windowEnd();
            }
        }

        Map<String, Object> vehicle = new LinkedHashMap<>();
        vehicle.put("label", "partner");
        vehicle.put("startLocation", latLng(p.start()));
        vehicle.put("travelMode", "DRIVING");
        vehicle.put("loadLimits", Map.of(LOAD, Map.of("maxLoad", String.valueOf(p.capacity()))));
        // Minimise time first (lunch deadlines), distance second.
        vehicle.put("costPerHour", 60.0);
        vehicle.put("costPerKilometer", 1.0);

        Map<String, Object> model = new LinkedHashMap<>();
        model.put("globalStartTime", start.toString());
        model.put("globalEndTime", end.plus(HORIZON_BUFFER).toString());
        model.put("shipments", shipments);
        model.put("vehicles", List.of(vehicle));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("considerRoadTraffic", true);
        body.put("timeout", timeout.toSeconds() + "s");
        return new Request(body, sent, preSkipped);
    }

    static RoutePlan parseResponse(String optimizer, RoutingProblem p, Request request, JsonNode response) {
        Map<UUID, GeoPoint> schoolLocations = new HashMap<>();
        p.drops().forEach(d -> schoolLocations.put(d.schoolId(), d.location()));

        List<PlannedStop> stops = new ArrayList<>();
        Set<UUID> visited = new HashSet<>();
        JsonNode route = response.path("routes").path(0);
        for (JsonNode visit : route.path("visits")) {
            // proto3 JSON omits default values: shipmentIndex 0 and isPickup false are absent.
            int index = visit.path("shipmentIndex").asInt(0);
            boolean isPickup = visit.path("isPickup").asBoolean(false);
            if (index < 0 || index >= request.shipments().size()) {
                throw new NonRetryableIntegrationException("optimizeTours returned unknown shipment " + index);
            }
            PickupTask task = request.shipments().get(index);
            Instant eta = visit.hasNonNull("startTime") ? Instant.parse(visit.get("startTime").asText()) : p.departAt();
            if (isPickup) {
                visited.add(task.orderId());
                stops.add(new PlannedStop(StopType.PICKUP, task.orderId(), task.schoolId(), task.location(), eta));
            } else {
                PlannedStop last = stops.isEmpty() ? null : stops.getLast();
                boolean mergeable = last != null && last.type() == StopType.DROP && last.schoolId().equals(task.schoolId());
                if (!mergeable) {
                    stops.add(new PlannedStop(StopType.DROP, null, task.schoolId(), schoolLocations.get(task.schoolId()), eta));
                }
            }
        }

        List<UUID> unserved = new ArrayList<>(request.preSkipped());
        for (PickupTask task : request.shipments()) {
            if (!visited.contains(task.orderId())) {
                unserved.add(task.orderId());
            }
        }
        JsonNode metrics = route.path("metrics");
        int distance = (int) Math.round(metrics.path("travelDistanceMeters").asDouble(0));
        int duration = (int) Math.round(seconds(metrics.path("totalDuration").asText("0s")));
        return new RoutePlan(optimizer, stops, distance, duration, unserved);
    }

    private static Map<String, Object> visit(GeoPoint location, Duration service, Instant from, Instant to) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("arrivalLocation", latLng(location));
        v.put("duration", service.toSeconds() + "s");
        v.put("timeWindows", List.of(Map.of("startTime", from.toString(), "endTime", to.toString())));
        return v;
    }

    private static Map<String, Object> latLng(GeoPoint point) {
        return Map.of("latitude", point.lat(), "longitude", point.lng());
    }

    private static Instant later(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }

    /** Parses a protobuf JSON duration such as {@code "3600s"} or {@code "12.5s"}. */
    static double seconds(String duration) {
        String s = duration.endsWith("s") ? duration.substring(0, duration.length() - 1) : duration;
        return s.isBlank() ? 0 : Double.parseDouble(s);
    }
}
