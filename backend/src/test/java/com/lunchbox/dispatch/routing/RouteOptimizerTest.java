package com.lunchbox.dispatch.routing;

import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.dispatch.routing.RouteOptimizer.DropTarget;
import com.lunchbox.dispatch.routing.RouteOptimizer.PickupTask;
import com.lunchbox.dispatch.routing.RouteOptimizer.PlannedStop;
import com.lunchbox.dispatch.routing.RouteOptimizer.RoutePlan;
import com.lunchbox.dispatch.routing.RouteOptimizer.RoutingProblem;
import com.lunchbox.dispatch.routing.RouteOptimizer.StopType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class RouteOptimizerTest {

    private static final Instant T0 = Instant.parse("2026-10-19T04:00:00Z"); // 09:30 IST
    private static final GeoPoint START = new GeoPoint(12.9716, 77.5946);

    static Stream<RouteOptimizer> optimizers() {
        return Stream.of(new SchoolClusterRouteOptimizer(), new OrToolsRouteOptimizer());
    }

    /** Ten homes around two schools; generous windows, enough capacity. */
    private static RoutingProblem problem(int capacity) {
        Random rnd = new Random(42);
        UUID schoolA = UUID.randomUUID();
        UUID schoolB = UUID.randomUUID();
        List<PickupTask> pickups = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            UUID school = i % 2 == 0 ? schoolA : schoolB;
            GeoPoint home = new GeoPoint(12.96 + rnd.nextDouble() * 0.03, 77.58 + rnd.nextDouble() * 0.03);
            pickups.add(new PickupTask(UUID.randomUUID(), school, home, T0, T0.plus(Duration.ofMinutes(75))));
        }
        List<DropTarget> drops = List.of(
                new DropTarget(schoolA, new GeoPoint(12.975, 77.60), T0.plus(Duration.ofMinutes(90)), T0.plus(Duration.ofMinutes(150))),
                new DropTarget(schoolB, new GeoPoint(12.965, 77.61), T0.plus(Duration.ofMinutes(90)), T0.plus(Duration.ofMinutes(150))));
        return new RoutingProblem(START, T0.minus(Duration.ofMinutes(20)), capacity, 18 / 3.6, Duration.ofMinutes(2),
                Duration.ofMinutes(4), pickups, drops);
    }

    @ParameterizedTest
    @MethodSource("optimizers")
    void everyLunchboxIsPickedUpBeforeItsSchoolDrop(RouteOptimizer optimizer) {
        RoutingProblem p = problem(10);
        RoutePlan plan = optimizer.optimize(p);

        Set<UUID> pickedUp = new HashSet<>();
        for (PlannedStop stop : plan.stops()) {
            if (stop.type() == StopType.PICKUP) {
                assertThat(pickedUp.add(stop.orderId())).as("picked up once").isTrue();
            }
        }
        assertThat(pickedUp).hasSize(p.pickups().size());
        for (PickupTask task : p.pickups()) {
            int pickIdx = indexOfPickup(plan, task.orderId());
            int dropIdx = firstDropAfter(plan, task.schoolId(), pickIdx);
            assertThat(dropIdx).as("drop for %s after its pickup", task.orderId()).isGreaterThan(pickIdx);
        }
        assertThat(plan.feasible()).isTrue();
        assertThat(plan.distanceMeters()).isPositive();
    }

    @ParameterizedTest
    @MethodSource("optimizers")
    void etasAreMonotonic(RouteOptimizer optimizer) {
        RoutePlan plan = optimizer.optimize(problem(10));
        for (int i = 1; i < plan.stops().size(); i++) {
            assertThat(plan.stops().get(i).eta()).isAfterOrEqualTo(plan.stops().get(i - 1).eta());
        }
    }

    @Test
    void orToolsRespectsCapacity() {
        RoutePlan plan = new OrToolsRouteOptimizer().optimize(problem(3));
        int onBoard = 0;
        Set<UUID> carried = new HashSet<>();
        RoutingProblem p = problem(3);
        for (PlannedStop stop : plan.stops()) {
            if (stop.type() == StopType.PICKUP) {
                onBoard++;
                carried.add(stop.orderId());
            } else {
                onBoard = 0;
            }
            assertThat(onBoard).isLessThanOrEqualTo(3);
        }
        assertThat(carried).isNotEmpty();
        assertThat(p.capacity()).isEqualTo(3);
    }

    @Test
    void impossibleWindowIsReported() {
        UUID school = UUID.randomUUID();
        PickupTask far = new PickupTask(UUID.randomUUID(), school, new GeoPoint(13.30, 77.90), T0, T0.plusSeconds(600));
        RoutingProblem p = new RoutingProblem(START, T0, 5, 18 / 3.6, Duration.ofMinutes(2), Duration.ofMinutes(4),
                List.of(far), List.of(new DropTarget(school, new GeoPoint(12.975, 77.60), T0, T0.plusSeconds(900))));
        RoutePlan plan = new SchoolClusterRouteOptimizer().optimize(p);
        assertThat(plan.lateOrUnservedOrderIds()).containsExactly(far.orderId());
    }

    private static int indexOfPickup(RoutePlan plan, UUID orderId) {
        for (int i = 0; i < plan.stops().size(); i++) {
            if (plan.stops().get(i).type() == StopType.PICKUP && orderId.equals(plan.stops().get(i).orderId())) {
                return i;
            }
        }
        return -1;
    }

    private static int firstDropAfter(RoutePlan plan, UUID schoolId, int from) {
        for (int i = from + 1; i < plan.stops().size(); i++) {
            PlannedStop s = plan.stops().get(i);
            if (s.type() == StopType.DROP && schoolId.equals(s.schoolId())) {
                return i;
            }
        }
        return -1;
    }
}
