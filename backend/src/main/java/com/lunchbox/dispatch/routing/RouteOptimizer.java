package com.lunchbox.dispatch.routing;

import com.lunchbox.common.geo.GeoPoint;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Plans one partner's day as a pickup-and-delivery problem with time windows: every lunchbox is collected inside its
 * home pickup window and dropped at its school before the school's delivery window closes. Implementations:
 * {@link OrToolsRouteOptimizer} (default primary), {@link GoogleRouteOptimizer} (opt-in primary, wrapped in
 * {@link FailoverRouteOptimizer}) and {@link SchoolClusterRouteOptimizer} (deterministic fallback). The primary is
 * chosen in {@link RoutingConfig}.
 */
public interface RouteOptimizer {

    String name();

    RoutePlan optimize(RoutingProblem problem);

    record RoutingProblem(
            GeoPoint start,
            Instant departAt,
            int capacity,
            double speedMetersPerSecond,
            Duration pickupServiceTime,
            Duration dropServiceTime,
            List<PickupTask> pickups,
            List<DropTarget> drops) {
    }

    record PickupTask(UUID orderId, UUID schoolId, GeoPoint location, Instant windowStart, Instant windowEnd) {
    }

    record DropTarget(UUID schoolId, GeoPoint location, Instant windowStart, Instant windowEnd) {
    }

    enum StopType { PICKUP, DROP }

    record PlannedStop(StopType type, UUID orderId, UUID schoolId, GeoPoint location, Instant eta) {
    }

    record RoutePlan(String optimizer, List<PlannedStop> stops, int distanceMeters, int durationSeconds,
                     List<UUID> lateOrUnservedOrderIds) {

        public boolean feasible() {
            return lateOrUnservedOrderIds.isEmpty();
        }
    }
}
