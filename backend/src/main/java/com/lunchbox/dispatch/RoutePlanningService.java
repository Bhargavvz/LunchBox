package com.lunchbox.dispatch;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.dispatch.routing.OrToolsRouteOptimizer;
import com.lunchbox.dispatch.routing.RouteOptimizer;
import com.lunchbox.dispatch.routing.RouteOptimizer.DropTarget;
import com.lunchbox.dispatch.routing.RouteOptimizer.PickupTask;
import com.lunchbox.dispatch.routing.RouteOptimizer.PlannedStop;
import com.lunchbox.dispatch.routing.RouteOptimizer.RoutePlan;
import com.lunchbox.dispatch.routing.RouteOptimizer.RoutingProblem;
import com.lunchbox.dispatch.routing.SchoolClusterRouteOptimizer;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Builds or rebuilds a partner's route for a day from their active assignments. */
@Slf4j
@Service
public class RoutePlanningService {

    private static final Duration PICKUP_SERVICE = Duration.ofMinutes(3);
    private static final Duration DROP_SERVICE = Duration.ofMinutes(5);

    private final RouteRepository routes;
    private final RouteStopRepository stops;
    private final AssignmentRepository assignments;
    private final PartnerShiftRepository shifts;
    private final PartnerDirectory partners;
    private final OrderQueries orders;
    private final SchoolDirectory schools;
    private final OrToolsRouteOptimizer orTools;
    private final SchoolClusterRouteOptimizer fallback;
    private final LunchBoxProperties properties;
    private final MeterRegistry meters;
    private final java.time.Clock clock;

    public RoutePlanningService(RouteRepository routes, RouteStopRepository stops, AssignmentRepository assignments,
                                PartnerShiftRepository shifts, PartnerDirectory partners, OrderQueries orders,
                                SchoolDirectory schools, OrToolsRouteOptimizer orTools,
                                SchoolClusterRouteOptimizer fallback, LunchBoxProperties properties, MeterRegistry meters,
                                java.time.Clock clock) {
        this.clock = clock;
        this.routes = routes;
        this.stops = stops;
        this.assignments = assignments;
        this.shifts = shifts;
        this.partners = partners;
        this.orders = orders;
        this.schools = schools;
        this.orTools = orTools;
        this.fallback = fallback;
        this.properties = properties;
        this.meters = meters;
    }

    /**
     * (Re)plans the route. Stops already completed are kept in place; only open stops are re-optimised, so a route
     * can be re-planned mid-morning after a reassignment.
     */
    @Transactional
    public Optional<UUID> plan(UUID partnerId, LocalDate date) {
        PartnerDirectory.PartnerInfo partner = partners.require(partnerId);
        List<OrderView> assigned = orders.forPartnerAndDate(partnerId, date).stream()
                .filter(o -> o.status() == OrderStatus.ASSIGNED || o.status() == OrderStatus.PARTNER_EN_ROUTE
                        || o.status() == OrderStatus.PICKED_UP)
                .toList();
        Route route = routes.findByPartnerIdAndRouteDate(partnerId, date).orElse(null);
        if (assigned.isEmpty()) {
            if (route != null && route.getStatus() == Route.Status.PLANNED) {
                stops.deleteByRouteId(route.getId());
                route.cancel();
            }
            return Optional.empty();
        }
        if (route == null) {
            route = routes.save(new Route(partnerId, date));
        }
        if (route.getStatus() == Route.Status.COMPLETED) {
            route.planned(route.getOptimizer(), route.getTotalDistanceM(), route.getTotalDurationS());
        }

        List<RouteStop> existing = stops.findByRouteIdOrderBySequence(route.getId());
        List<RouteStop> done = existing.stream().filter(s -> !s.isOpen()).toList();
        Set<UUID> pickedUp = assigned.stream().filter(o -> o.status() == OrderStatus.PICKED_UP).map(OrderView::id)
                .collect(Collectors.toSet());
        List<OrderView> toPickUp = assigned.stream().filter(o -> !pickedUp.contains(o.id())).toList();
        Map<UUID, SchoolInfo> schoolMap = schools.findAll(assigned.stream().map(OrderView::schoolId).collect(Collectors.toSet()));

        GeoPoint start = startPoint(partner, date, done);
        Instant departAt = assigned.stream().map(OrderView::pickupWindowStart).min(Comparator.naturalOrder()).orElseThrow()
                .minus(Duration.ofMinutes(20));
        Instant now = clock.instant();
        if (departAt.isBefore(now) && TimeZones.dateIst(now).equals(date)) {
            departAt = now;
        }
        List<PickupTask> pickups = toPickUp.stream().map(o -> new PickupTask(o.id(), o.schoolId(),
                Geo.toGeoPoint(o.pickupLocation()), o.pickupWindowStart(), o.pickupWindowEnd())).toList();
        List<DropTarget> drops = schoolMap.values().stream().map(s -> new DropTarget(s.id(), Geo.toGeoPoint(s.location()),
                TimeZones.atIst(date, s.deliveryWindowStart()), TimeZones.atIst(date, s.deliveryWindowEnd()))).toList();
        double speed = properties.tracking().averageSpeedKmph() / 3.6;
        RoutingProblem problem = new RoutingProblem(start, departAt, partner.capacity(), speed, PICKUP_SERVICE, DROP_SERVICE,
                pickups, drops);

        RoutePlan plan = optimise(problem);
        // Lunchboxes already on board still need a drop at their school.
        List<PlannedStop> planned = new ArrayList<>(plan.stops());
        for (UUID schoolId : assigned.stream().filter(o -> pickedUp.contains(o.id())).map(OrderView::schoolId).distinct().toList()) {
            boolean hasDrop = planned.stream().anyMatch(s -> s.type() == RouteOptimizer.StopType.DROP && s.schoolId().equals(schoolId));
            if (!hasDrop) {
                SchoolInfo s = schoolMap.get(schoolId);
                planned.addFirst(new PlannedStop(RouteOptimizer.StopType.DROP, null, schoolId, Geo.toGeoPoint(s.location()),
                        departAt));
            }
        }

        for (RouteStop s : existing) {
            if (s.isOpen()) {
                stops.delete(s);
            }
        }
        stops.flush();
        int seq = done.stream().mapToInt(RouteStop::getSequence).max().orElse(0);
        for (PlannedStop ps : planned) {
            seq++;
            RouteStop stop = ps.type() == RouteOptimizer.StopType.PICKUP
                    ? RouteStop.pickup(route.getId(), seq, ps.orderId(), Geo.point(ps.location()), ps.eta())
                    : RouteStop.drop(route.getId(), seq, ps.schoolId(), Geo.point(ps.location()), ps.eta());
            stops.save(stop);
        }
        route.planned(plan.optimizer(), plan.distanceMeters(), plan.durationSeconds());
        UUID routeId = route.getId();
        assignments.findByOrderIdInAndStatus(assigned.stream().map(OrderView::id).toList(), Assignment.Status.ACTIVE)
                .forEach(a -> a.attachRoute(routeId));
        if (!plan.feasible()) {
            meters.counter("lunchbox.dispatch.route_late_orders").increment(plan.lateOrUnservedOrderIds().size());
            log.warn("Route {} for partner {} has {} late/unserved orders: {}", routeId, partnerId,
                    plan.lateOrUnservedOrderIds().size(), plan.lateOrUnservedOrderIds());
        }
        return Optional.of(routeId);
    }

    private RoutePlan optimise(RoutingProblem problem) {
        Timer.Sample sample = Timer.start(meters);
        try {
            RoutePlan plan = orTools.optimize(problem);
            if (!plan.lateOrUnservedOrderIds().isEmpty()) {
                // Keep every lunchbox on the route: append unserved ones using the deterministic heuristic order.
                RoutePlan alt = fallback.optimize(problem);
                if (alt.lateOrUnservedOrderIds().size() < plan.lateOrUnservedOrderIds().size()) {
                    return alt;
                }
                return mergeUnserved(plan, alt);
            }
            return plan;
        } catch (RuntimeException | UnsatisfiedLinkError e) {
            log.warn("OR-Tools unavailable or failed ({}); using fallback optimiser", e.toString());
            meters.counter("lunchbox.dispatch.optimizer_fallback").increment();
            return fallback.optimize(problem);
        } finally {
            sample.stop(meters.timer("lunchbox.dispatch.route_optimisation"));
        }
    }

    /** Adds stops for orders OR-Tools dropped, at the position the heuristic would visit them. */
    private static RoutePlan mergeUnserved(RoutePlan primary, RoutePlan heuristic) {
        Set<UUID> missing = Set.copyOf(primary.lateOrUnservedOrderIds());
        List<PlannedStop> merged = new ArrayList<>(primary.stops());
        for (PlannedStop hs : heuristic.stops()) {
            if (hs.type() == RouteOptimizer.StopType.PICKUP && missing.contains(hs.orderId())) {
                int dropIdx = -1;
                for (int i = 0; i < merged.size(); i++) {
                    if (merged.get(i).type() == RouteOptimizer.StopType.DROP && merged.get(i).schoolId().equals(hs.schoolId())) {
                        dropIdx = i;
                        break;
                    }
                }
                if (dropIdx >= 0) {
                    merged.add(dropIdx, hs);
                } else {
                    merged.add(hs);
                    heuristic.stops().stream()
                            .filter(s -> s.type() == RouteOptimizer.StopType.DROP && s.schoolId().equals(hs.schoolId()))
                            .findFirst().ifPresent(merged::add);
                }
            }
        }
        return new RoutePlan(primary.optimizer(), merged, primary.distanceMeters(), primary.durationSeconds(),
                primary.lateOrUnservedOrderIds());
    }

    private GeoPoint startPoint(PartnerDirectory.PartnerInfo partner, LocalDate date, List<RouteStop> done) {
        if (!done.isEmpty()) {
            return Geo.toGeoPoint(done.getLast().getLocation());
        }
        return shifts.findByPartnerIdAndShiftDate(partner.id(), date)
                .filter(s -> s.getStartLocation() != null)
                .map(s -> Geo.toGeoPoint(s.getStartLocation()))
                .orElse(Geo.toGeoPoint(partner.homeZone()));
    }
}
