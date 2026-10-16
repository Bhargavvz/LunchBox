package com.lunchbox.dispatch.routing;

import com.google.ortools.Loader;
import com.google.ortools.constraintsolver.FirstSolutionStrategy;
import com.google.ortools.constraintsolver.LocalSearchMetaheuristic;
import com.google.ortools.constraintsolver.RoutingDimension;
import com.google.ortools.constraintsolver.RoutingIndexManager;
import com.google.ortools.constraintsolver.RoutingModel;
import com.google.ortools.constraintsolver.RoutingSearchParameters;
import com.google.ortools.constraintsolver.Solver;
import com.google.ortools.constraintsolver.main;
import com.lunchbox.common.geo.GeoPoint;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.LongBinaryOperator;
import java.util.function.LongUnaryOperator;

/**
 * Pickup-and-delivery VRP with time windows and capacity, solved with Google OR-Tools.
 *
 * <p>Node layout: 0 = start, 1..n = pickups, n+1..2n = one drop node per lunchbox at its school (co-located drops cost
 * zero to move between and are merged into one stop afterwards), 2n+1 = virtual end (open route). Each pickup/drop
 * pair must be on the vehicle with pickup before drop. Every node has a time window; lunchboxes that cannot be served
 * in time may be dropped from the solution at a high penalty and are reported back so they can be re-planned.</p>
 */
@Slf4j
@Component
public class OrToolsRouteOptimizer implements RouteOptimizer {

    private static final long DROP_PENALTY = 10_000_000L;
    private static final long MAX_WAIT_SECONDS = 3 * 3600L;
    private static volatile boolean nativeLoaded;

    @Override
    public String name() {
        return "or-tools-pdptw";
    }

    private static synchronized void ensureNative() {
        if (!nativeLoaded) {
            Loader.loadNativeLibraries();
            nativeLoaded = true;
        }
    }

    @Override
    public RoutePlan optimize(RoutingProblem p) {
        ensureNative();
        int n = p.pickups().size();
        if (n == 0) {
            return new RoutePlan(name(), List.of(), 0, 0, List.of());
        }
        Map<UUID, DropTarget> drops = new HashMap<>();
        p.drops().forEach(d -> drops.put(d.schoolId(), d));

        int nodeCount = 2 * n + 2;
        int endNode = 2 * n + 1;
        GeoPoint[] location = new GeoPoint[nodeCount];
        long[] windowStart = new long[nodeCount];
        long[] windowEnd = new long[nodeCount];
        long[] service = new long[nodeCount];
        long[] demand = new long[nodeCount];
        long t0 = p.departAt().getEpochSecond();

        location[0] = p.start();
        long horizon = 0;
        for (int i = 0; i < n; i++) {
            PickupTask task = p.pickups().get(i);
            DropTarget drop = drops.get(task.schoolId());
            int pick = 1 + i;
            int del = 1 + n + i;
            location[pick] = task.location();
            windowStart[pick] = Math.max(0, task.windowStart().getEpochSecond() - t0);
            windowEnd[pick] = Math.max(windowStart[pick], task.windowEnd().getEpochSecond() - t0);
            service[pick] = p.pickupServiceTime().toSeconds();
            demand[pick] = 1;
            location[del] = drop.location();
            windowStart[del] = Math.max(0, drop.windowStart().getEpochSecond() - t0);
            windowEnd[del] = Math.max(windowStart[del], drop.windowEnd().getEpochSecond() - t0);
            service[del] = p.dropServiceTime().toSeconds();
            demand[del] = -1;
            horizon = Math.max(horizon, windowEnd[del] + service[del]);
        }
        location[endNode] = p.start();
        windowEnd[0] = horizon;
        windowEnd[endNode] = horizon + MAX_WAIT_SECONDS;

        long[][] travel = new long[nodeCount][nodeCount];
        long[][] meters = new long[nodeCount][nodeCount];
        for (int a = 0; a < nodeCount; a++) {
            for (int b = 0; b < nodeCount; b++) {
                if (a == b || b == endNode || a == endNode) {
                    continue;
                }
                meters[a][b] = TravelModel.roadMeters(location[a], location[b]);
                travel[a][b] = TravelModel.seconds(location[a], location[b], p.speedMetersPerSecond());
            }
        }

        RoutingIndexManager manager = new RoutingIndexManager(nodeCount, 1, new int[]{0}, new int[]{endNode});
        RoutingModel routing = new RoutingModel(manager);

        LongBinaryOperator timeCallback = (fromIndex, toIndex) -> {
            int from = manager.indexToNode(fromIndex);
            int to = manager.indexToNode(toIndex);
            return travel[from][to] + service[from];
        };
        int timeCb = routing.registerTransitCallback(timeCallback);
        routing.setArcCostEvaluatorOfAllVehicles(timeCb);
        routing.addDimension(timeCb, MAX_WAIT_SECONDS, horizon + MAX_WAIT_SECONDS, false, "Time");
        RoutingDimension time = routing.getMutableDimension("Time");

        LongUnaryOperator demandCallback = fromIndex -> demand[manager.indexToNode(fromIndex)];
        int demandCb = routing.registerUnaryTransitCallback(demandCallback);
        routing.addDimensionWithVehicleCapacity(demandCb, 0, new long[]{p.capacity()}, true, "Capacity");

        Solver solver = routing.solver();
        for (int node = 0; node < nodeCount; node++) {
            if (node == endNode) {
                continue;
            }
            long index = manager.nodeToIndex(node);
            if (node == 0) {
                time.cumulVar(routing.start(0)).setRange(0, windowEnd[0]);
            } else {
                time.cumulVar(index).setRange(windowStart[node], windowEnd[node]);
            }
        }
        for (int i = 0; i < n; i++) {
            long pickIndex = manager.nodeToIndex(1 + i);
            long delIndex = manager.nodeToIndex(1 + n + i);
            routing.addPickupAndDelivery(pickIndex, delIndex);
            solver.addConstraint(solver.makeEquality(routing.vehicleVar(pickIndex), routing.vehicleVar(delIndex)));
            solver.addConstraint(solver.makeLessOrEqual(time.cumulVar(pickIndex), time.cumulVar(delIndex)));
            routing.addDisjunction(new long[]{pickIndex}, DROP_PENALTY);
            routing.addDisjunction(new long[]{delIndex}, DROP_PENALTY);
        }

        RoutingSearchParameters params = main.defaultRoutingSearchParameters().toBuilder()
                .setFirstSolutionStrategy(FirstSolutionStrategy.Value.PARALLEL_CHEAPEST_INSERTION)
                .setLocalSearchMetaheuristic(LocalSearchMetaheuristic.Value.GUIDED_LOCAL_SEARCH)
                .setTimeLimit(com.google.protobuf.Duration.newBuilder().setSeconds(n > 15 ? 5 : 2).build())
                .build();
        com.google.ortools.constraintsolver.Assignment solution = routing.solveWithParameters(params);
        if (solution == null) {
            throw new IllegalStateException("OR-Tools found no solution");
        }

        List<PlannedStop> stops = new ArrayList<>();
        List<UUID> unserved = new ArrayList<>();
        long distance = 0;
        int prevNode = 0;
        long index = routing.start(0);
        while (!routing.isEnd(index)) {
            int node = manager.indexToNode(index);
            if (node != 0) {
                distance += meters[prevNode][node];
                Instant eta = Instant.ofEpochSecond(t0 + solution.min(time.cumulVar(index)));
                if (node <= n) {
                    PickupTask task = p.pickups().get(node - 1);
                    stops.add(new PlannedStop(StopType.PICKUP, task.orderId(), task.schoolId(), task.location(), eta));
                } else {
                    PickupTask task = p.pickups().get(node - 1 - n);
                    PlannedStop last = stops.isEmpty() ? null : stops.getLast();
                    boolean mergeable = last != null && last.type() == StopType.DROP && last.schoolId().equals(task.schoolId());
                    if (!mergeable) {
                        stops.add(new PlannedStop(StopType.DROP, null, task.schoolId(), location[node], eta));
                    }
                }
                prevNode = node;
            }
            index = solution.value(routing.nextVar(index));
        }
        for (int i = 0; i < n; i++) {
            long pickIndex = manager.nodeToIndex(1 + i);
            if (solution.value(routing.nextVar(pickIndex)) == pickIndex) {
                unserved.add(p.pickups().get(i).orderId());
            }
        }
        long endCumul = solution.min(time.cumulVar(routing.end(0)));
        log.debug("OR-Tools planned {} stops, {} m, {} unserved", stops.size(), distance, unserved.size());
        return new RoutePlan(name(), stops, (int) distance, (int) endCumul, unserved);
    }
}
