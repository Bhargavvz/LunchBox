package com.lunchbox.dispatch.routing;

import com.lunchbox.common.geo.GeoPoint;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Deterministic heuristic: serve schools in order of their delivery deadline; for each school, collect its lunchboxes
 * by nearest-neighbour (honouring pickup-window opening by waiting), then drop them at the school. Used when OR-Tools
 * is unavailable or fails, and as a sanity baseline in tests.
 */
@Component
public class SchoolClusterRouteOptimizer implements RouteOptimizer {

    @Override
    public String name() {
        return "school-cluster-nn";
    }

    @Override
    public RoutePlan optimize(RoutingProblem p) {
        Map<UUID, DropTarget> dropBySchool = new LinkedHashMap<>();
        p.drops().stream().sorted(Comparator.comparing(DropTarget::windowEnd)).forEach(d -> dropBySchool.put(d.schoolId(), d));

        List<PlannedStop> stops = new ArrayList<>();
        List<UUID> late = new ArrayList<>();
        GeoPoint here = p.start();
        Instant clock = p.departAt();
        long distance = 0;

        for (DropTarget drop : dropBySchool.values()) {
            List<PickupTask> remaining = new ArrayList<>(p.pickups().stream()
                    .filter(t -> t.schoolId().equals(drop.schoolId())).toList());
            List<UUID> onBoard = new ArrayList<>();
            while (!remaining.isEmpty()) {
                final GeoPoint from = here;
                PickupTask next = remaining.stream()
                        .min(Comparator.comparingLong(t -> TravelModel.roadMeters(from, t.location())))
                        .orElseThrow();
                remaining.remove(next);
                distance += TravelModel.roadMeters(here, next.location());
                clock = clock.plusSeconds(TravelModel.seconds(here, next.location(), p.speedMetersPerSecond()));
                if (clock.isBefore(next.windowStart())) {
                    clock = next.windowStart();
                }
                if (clock.isAfter(next.windowEnd())) {
                    late.add(next.orderId());
                }
                stops.add(new PlannedStop(StopType.PICKUP, next.orderId(), next.schoolId(), next.location(), clock));
                onBoard.add(next.orderId());
                clock = clock.plus(p.pickupServiceTime());
                here = next.location();
            }
            if (onBoard.isEmpty()) {
                continue;
            }
            distance += TravelModel.roadMeters(here, drop.location());
            clock = clock.plusSeconds(TravelModel.seconds(here, drop.location(), p.speedMetersPerSecond()));
            if (clock.isBefore(drop.windowStart())) {
                clock = drop.windowStart();
            }
            if (clock.isAfter(drop.windowEnd())) {
                late.addAll(onBoard);
            }
            stops.add(new PlannedStop(StopType.DROP, null, drop.schoolId(), drop.location(), clock));
            clock = clock.plus(p.dropServiceTime());
            here = drop.location();
        }
        int duration = (int) Math.max(0, clock.getEpochSecond() - p.departAt().getEpochSecond());
        return new RoutePlan(name(), stops, (int) distance, duration, late.stream().distinct().toList());
    }
}
