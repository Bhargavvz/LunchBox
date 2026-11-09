package com.lunchbox.dispatch.routing;

import com.lunchbox.common.geo.GeoPoint;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Deterministic heuristic: collect lunchboxes by nearest-neighbour (honouring pickup-window opening by waiting), and
 * drop what is on board at the schools in order of their delivery deadline once the bag is full or every pickup is
 * done. Pickups are never held back waiting for a school gate to open. Used when OR-Tools is unavailable or fails,
 * and as a sanity baseline in tests.
 */
@Component
public class SchoolClusterRouteOptimizer implements RouteOptimizer {

    @Override
    public String name() {
        return "school-cluster-nn";
    }

    @Override
    public RoutePlan optimize(RoutingProblem p) {
        Map<UUID, DropTarget> dropBySchool = new HashMap<>();
        p.drops().forEach(d -> dropBySchool.put(d.schoolId(), d));
        int capacity = Math.max(1, p.capacity());

        Leg leg = new Leg(p);
        List<PickupTask> remaining = new ArrayList<>(p.pickups());
        List<PickupTask> onBoard = new ArrayList<>();
        while (!remaining.isEmpty()) {
            final GeoPoint from = leg.here;
            PickupTask next = remaining.stream()
                    .min(Comparator.comparingLong(t -> TravelModel.roadMeters(from, t.location())))
                    .orElseThrow();
            remaining.remove(next);
            leg.travelTo(next.location());
            if (leg.clock.isBefore(next.windowStart())) {
                leg.clock = next.windowStart();
            }
            if (leg.clock.isAfter(next.windowEnd())) {
                leg.late.add(next.orderId());
            }
            leg.stops.add(new PlannedStop(StopType.PICKUP, next.orderId(), next.schoolId(), next.location(), leg.clock));
            onBoard.add(next);
            leg.clock = leg.clock.plus(p.pickupServiceTime());
            if (onBoard.size() >= capacity) {
                deliver(leg, onBoard, dropBySchool);
            }
        }
        deliver(leg, onBoard, dropBySchool);

        int duration = (int) Math.max(0, leg.clock.getEpochSecond() - p.departAt().getEpochSecond());
        return new RoutePlan(name(), leg.stops, (int) leg.distance, duration, leg.late.stream().distinct().toList());
    }

    /** Drops everything on board, visiting the schools in order of their delivery deadline. */
    private static void deliver(Leg leg, List<PickupTask> onBoard, Map<UUID, DropTarget> dropBySchool) {
        onBoard.stream().filter(t -> !dropBySchool.containsKey(t.schoolId())).forEach(t -> leg.late.add(t.orderId()));
        List<DropTarget> drops = onBoard.stream().map(t -> dropBySchool.get(t.schoolId())).filter(Objects::nonNull)
                .distinct().sorted(Comparator.comparing(DropTarget::windowEnd)).toList();
        for (DropTarget drop : drops) {
            leg.travelTo(drop.location());
            if (leg.clock.isBefore(drop.windowStart())) {
                leg.clock = drop.windowStart();
            }
            if (leg.clock.isAfter(drop.windowEnd())) {
                onBoard.stream().filter(t -> t.schoolId().equals(drop.schoolId()))
                        .forEach(t -> leg.late.add(t.orderId()));
            }
            leg.stops.add(new PlannedStop(StopType.DROP, null, drop.schoolId(), drop.location(), leg.clock));
            leg.clock = leg.clock.plus(leg.problem.dropServiceTime());
        }
        onBoard.clear();
    }

    /** Mutable position, clock and running totals while the route is built. */
    private static final class Leg {
        final RoutingProblem problem;
        final List<PlannedStop> stops = new ArrayList<>();
        final List<UUID> late = new ArrayList<>();
        GeoPoint here;
        Instant clock;
        long distance;

        Leg(RoutingProblem problem) {
            this.problem = problem;
            this.here = problem.start();
            this.clock = problem.departAt();
        }

        void travelTo(GeoPoint to) {
            distance += TravelModel.roadMeters(here, to);
            clock = clock.plusSeconds(TravelModel.seconds(here, to, problem.speedMetersPerSecond()));
            here = to;
        }
    }
}
