package com.lunchbox.dispatch;

import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.dispatch.routing.RouteOptimizer.PlannedStop;
import com.lunchbox.dispatch.routing.RouteOptimizer.RoutePlan;
import com.lunchbox.dispatch.routing.RouteOptimizer.StopType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RoutePlanMergeTest {

    private static final GeoPoint HOME = new GeoPoint(12.9784, 77.6408);
    private static final GeoPoint SCHOOL = new GeoPoint(12.9719, 77.6412);
    private static final Instant AT = Instant.parse("2026-11-16T05:00:00Z");

    @Test
    void routeWhoseStopsAllCameFromTheHeuristicReportsTheHeuristicTotals() {
        UUID school = UUID.randomUUID();
        UUID order = UUID.randomUUID();
        // Pickup windows already passed: OR-Tools serves nothing and reports 0 m / 0 s.
        RoutePlan orTools = new RoutePlan("or-tools-pdptw", List.of(), 0, 0, List.of(order));
        RoutePlan heuristic = new RoutePlan("school-cluster", List.of(
                new PlannedStop(StopType.PICKUP, order, school, HOME, AT),
                new PlannedStop(StopType.DROP, null, school, SCHOOL, AT.plusSeconds(300))), 820, 540, List.of(order));

        RoutePlan merged = RoutePlanningService.mergeUnserved(orTools, heuristic);

        assertThat(merged.stops()).extracting(PlannedStop::type).containsExactly(StopType.PICKUP, StopType.DROP);
        assertThat(merged.distanceMeters()).isEqualTo(820);
        assertThat(merged.durationSeconds()).isEqualTo(540);
        assertThat(merged.optimizer()).isEqualTo("or-tools-pdptw");
    }

    @Test
    void partlyServedRouteNeverReportsLessThanThePrimary() {
        UUID school = UUID.randomUUID();
        UUID served = UUID.randomUUID();
        UUID dropped = UUID.randomUUID();
        RoutePlan orTools = new RoutePlan("or-tools-pdptw", List.of(
                new PlannedStop(StopType.PICKUP, served, school, HOME, AT),
                new PlannedStop(StopType.DROP, null, school, SCHOOL, AT.plusSeconds(400))), 1500, 900, List.of(dropped));
        RoutePlan heuristic = new RoutePlan("school-cluster", List.of(
                new PlannedStop(StopType.PICKUP, dropped, school, HOME, AT),
                new PlannedStop(StopType.DROP, null, school, SCHOOL, AT.plusSeconds(300))), 820, 540, List.of());

        RoutePlan merged = RoutePlanningService.mergeUnserved(orTools, heuristic);

        assertThat(merged.stops()).hasSize(3);
        assertThat(merged.distanceMeters()).isEqualTo(1500);
        assertThat(merged.durationSeconds()).isEqualTo(900);
    }
}
