package com.lunchbox.dispatch;

import org.locationtech.jts.geom.Point;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Public API used by the tracking module to drive geofence-based route progress. */
public interface DispatchTracking {

    /** Today's active route for the partner user, with its open stops in sequence. */
    Optional<ActiveRoute> activeRoute(UUID partnerUserId);

    /** Geofence: partner reached a home. Marks the stop arrived (starts the wait timer) and notifies the parent. */
    void arrivedAtPickup(UUID partnerId, UUID stopId);

    /** Geofence: partner entered a school; lunchboxes in transit to it move to AT_SCHOOL. */
    void arrivedAtSchool(UUID partnerId, UUID schoolId);

    record ActiveRoute(UUID partnerId, UUID routeId, List<StopPoint> openStops) {
    }

    record StopPoint(UUID stopId, RouteStop.Type type, UUID orderId, UUID schoolId, Point location,
                     RouteStop.Status status) {
    }

    /** Outbox payload for {@code order.partner_arriving}. */
    record PartnerArriving(UUID orderId, UUID parentId, UUID partnerId, java.time.Instant at) {
    }
}
