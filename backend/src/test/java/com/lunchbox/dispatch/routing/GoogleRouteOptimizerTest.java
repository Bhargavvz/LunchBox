package com.lunchbox.dispatch.routing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.dispatch.routing.GoogleRouteOptimizer.Request;
import com.lunchbox.dispatch.routing.RouteOptimizer.DropTarget;
import com.lunchbox.dispatch.routing.RouteOptimizer.PickupTask;
import com.lunchbox.dispatch.routing.RouteOptimizer.RoutePlan;
import com.lunchbox.dispatch.routing.RouteOptimizer.RoutingProblem;
import com.lunchbox.dispatch.routing.RouteOptimizer.StopType;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class GoogleRouteOptimizerTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant T0 = Instant.parse("2026-10-19T04:00:00Z");
    private static final UUID SCHOOL = UUID.randomUUID();
    private static final GeoPoint SCHOOL_AT = new GeoPoint(12.98, 77.60);
    private static final PickupTask A = task(new GeoPoint(12.970, 77.590), T0, T0.plusSeconds(1800));
    private static final PickupTask B = task(new GeoPoint(12.975, 77.595), T0, T0.plusSeconds(1800));
    private static final PickupTask EXPIRED = task(new GeoPoint(12.972, 77.592), T0.minusSeconds(3600), T0.minusSeconds(60));

    private static PickupTask task(GeoPoint at, Instant from, Instant to) {
        return new PickupTask(UUID.randomUUID(), SCHOOL, at, from, to);
    }

    private static RoutingProblem problem(List<PickupTask> pickups) {
        return new RoutingProblem(new GeoPoint(12.96, 77.58), T0, 6, 5.0, Duration.ofMinutes(2), Duration.ofMinutes(3),
                pickups, List.of(new DropTarget(SCHOOL, SCHOOL_AT, T0.plusSeconds(3600), T0.plusSeconds(7200))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void buildsOneShipmentPerLunchboxAndSkipsExpiredWindows() {
        Request request = GoogleRouteOptimizer.buildRequest(problem(List.of(A, EXPIRED, B)), Duration.ofSeconds(15));

        assertThat(request.shipments()).containsExactly(A, B);
        assertThat(request.preSkipped()).containsExactly(EXPIRED.orderId());
        Map<String, Object> model = (Map<String, Object>) request.body().get("model");
        assertThat(model.get("globalStartTime")).isEqualTo(T0.toString());
        assertThat(model.get("globalEndTime")).isEqualTo(T0.plusSeconds(7200).plus(Duration.ofHours(1)).toString());
        List<Map<String, Object>> shipments = (List<Map<String, Object>>) model.get("shipments");
        assertThat(shipments).hasSize(2);
        assertThat(shipments.getFirst().get("label")).isEqualTo(A.orderId().toString());
        Map<String, Object> vehicle = ((List<Map<String, Object>>) model.get("vehicles")).getFirst();
        assertThat(vehicle.get("loadLimits")).isEqualTo(Map.of(GoogleRouteOptimizer.LOAD, Map.of("maxLoad", "6")));
        assertThat(request.body().get("timeout")).isEqualTo("15s");
    }

    @Test
    void parsesVisitsWithProtoDefaultsAndMergesDropsAtTheSameSchool() throws Exception {
        RoutingProblem p = problem(List.of(A, B));
        Request request = GoogleRouteOptimizer.buildRequest(p, Duration.ofSeconds(15));
        // shipmentIndex 0 and isPickup false are omitted in proto3 JSON.
        JsonNode response = JSON.readTree("""
                {"routes":[{"visits":[
                  {"isPickup":true,"startTime":"2026-10-19T04:05:00Z"},
                  {"shipmentIndex":1,"isPickup":true,"startTime":"2026-10-19T04:12:00Z"},
                  {"startTime":"2026-10-19T05:00:00Z"},
                  {"shipmentIndex":1,"startTime":"2026-10-19T05:03:00Z"}],
                  "metrics":{"travelDistanceMeters":4321.6,"totalDuration":"3780s"}}]}
                """);

        RoutePlan plan = GoogleRouteOptimizer.parseResponse("google", p, request, response);

        assertThat(plan.stops()).extracting(RouteOptimizer.PlannedStop::type)
                .containsExactly(StopType.PICKUP, StopType.PICKUP, StopType.DROP);
        assertThat(plan.stops().get(0).orderId()).isEqualTo(A.orderId());
        assertThat(plan.stops().get(1).orderId()).isEqualTo(B.orderId());
        assertThat(plan.stops().get(2).location()).isEqualTo(SCHOOL_AT);
        assertThat(plan.stops().get(2).eta()).isEqualTo(Instant.parse("2026-10-19T05:00:00Z"));
        assertThat(plan.distanceMeters()).isEqualTo(4322);
        assertThat(plan.durationSeconds()).isEqualTo(3780);
        assertThat(plan.feasible()).isTrue();
    }

    @Test
    void reportsSkippedAndPreSkippedShipmentsAsUnserved() throws Exception {
        RoutingProblem p = problem(List.of(A, EXPIRED, B));
        Request request = GoogleRouteOptimizer.buildRequest(p, Duration.ofSeconds(15));
        JsonNode response = JSON.readTree("""
                {"routes":[{"visits":[{"isPickup":true},{}]}],"skippedShipments":[{"index":1}]}
                """);

        RoutePlan plan = GoogleRouteOptimizer.parseResponse("google", p, request, response);

        assertThat(plan.lateOrUnservedOrderIds()).containsExactlyInAnyOrder(EXPIRED.orderId(), B.orderId());
        assertThat(plan.distanceMeters()).isZero();
    }

    @Test
    void parsesProtobufDurations() {
        assertThat(GoogleRouteOptimizer.seconds("3600s")).isEqualTo(3600);
        assertThat(GoogleRouteOptimizer.seconds("12.5s")).isEqualTo(12.5);
        assertThat(GoogleRouteOptimizer.seconds("0s")).isZero();
    }

    @Test
    void failsOverToTheSecondaryOptimiser() {
        RouteOptimizer broken = new RouteOptimizer() {
            @Override
            public String name() {
                return "broken";
            }

            @Override
            public RoutePlan optimize(RoutingProblem problem) {
                throw new IllegalStateException("quota exceeded");
            }
        };
        RouteOptimizer failover = new FailoverRouteOptimizer(broken, new SchoolClusterRouteOptimizer(),
                new SimpleMeterRegistry());

        RoutePlan plan = failover.optimize(problem(List.of(A, B)));

        assertThat(plan.stops()).isNotEmpty();
        assertThat(plan.optimizer()).isNotEqualTo("broken");
    }
}
