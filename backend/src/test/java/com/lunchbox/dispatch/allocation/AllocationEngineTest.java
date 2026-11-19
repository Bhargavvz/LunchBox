package com.lunchbox.dispatch.allocation;

import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.dispatch.allocation.AllocationModel.Assignment;
import com.lunchbox.dispatch.allocation.AllocationModel.Job;
import com.lunchbox.dispatch.allocation.AllocationModel.Presence;
import com.lunchbox.dispatch.allocation.AllocationModel.Reason;
import com.lunchbox.dispatch.allocation.AllocationModel.Result;
import com.lunchbox.dispatch.allocation.AllocationModel.Rider;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Polygon;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class AllocationEngineTest {

    private static final Instant WINDOW_START = Instant.parse("2026-10-20T04:30:00Z"); // 10:00 IST
    private static final Instant WINDOW_END = WINDOW_START.plusSeconds(45 * 60);
    private static final Instant DEADLINE = Instant.parse("2026-10-20T06:45:00Z");
    private static final Instant SHIFT_START = Instant.parse("2026-10-20T04:00:00Z");
    private static final Instant SHIFT_END = Instant.parse("2026-10-20T08:00:00Z");
    private static final AllocationWeights W = AllocationWeights.DEFAULTS;
    private static final TravelTimeProvider TRAVEL = new EstimatedTravelTimes();

    private final UUID schoolA = UUID.randomUUID();
    private final UUID schoolB = UUID.randomUUID();

    @Test
    void emptyInputsGiveEmptyResults() {
        assertThat(AllocationEngine.allocate(List.of(), List.of(rider(17.385, 78.486, 5)), W, TRAVEL, null).assignments()).isEmpty();
        Result none = AllocationEngine.allocate(List.of(job(17.385, 78.486, schoolA)), List.of(), W, TRAVEL, null);
        assertThat(none.unassigned()).extracting(AllocationModel.Unassigned::reason).containsExactly(Reason.NO_RIDERS_ON_SHIFT);
    }

    @Test
    void anOrderGoesToTheNearestRider() {
        Rider near = rider(17.385, 78.4867, 5);
        Rider far = rider(17.420, 78.5200, 5);
        Job job = job(17.386, 78.4870, schoolA);

        Result r = AllocationEngine.allocate(List.of(job), List.of(far, near), W, TRAVEL, null);

        assertThat(r.assignments()).singleElement().extracting(Assignment::partnerId).isEqualTo(near.partnerId());
        Assignment a = r.assignments().get(0);
        assertThat(a.eligibleRiders()).isEqualTo(2);
        assertThat(a.runnerUpPartnerId()).isEqualTo(far.partnerId());
        assertThat(a.breakdown().roadDistance()).isFalse();
        assertThat(a.breakdown().total()).isLessThan(a.runnerUpCost());
    }

    @Test
    void theOptimumBeatsGreedyWhenTheNearestRiderIsNeededElsewhere() {
        // Greedy (orders in input order) gives job1 to rider X (nearest), leaving job2 to Y, which is far from job2.
        // The optimum gives job1 to Y (almost as near) and job2 to X (much nearer).
        Rider x = rider(17.3850, 78.4860, 1);
        Rider y = rider(17.3850, 78.4900, 1);
        Job job1 = job(17.3850, 78.4875, schoolA); // 160 m from X, 270 m from Y
        Job job2 = job(17.3850, 78.4800, schoolA); // 640 m from X, 1060 m from Y

        Result r = AllocationEngine.allocate(List.of(job1, job2), List.of(x, y), weightsWithoutBatching(), TRAVEL, null);

        Map<UUID, UUID> got = byOrder(r);
        assertThat(got.get(job1.orderId())).isEqualTo(y.partnerId());
        assertThat(got.get(job2.orderId())).isEqualTo(x.partnerId());
    }

    @Test
    void keepsASchoolsBoxesTogether() {
        Rider a = rider(17.3850, 78.4860, 6);
        Rider b = rider(17.3851, 78.4861, 6);
        List<Job> jobs = IntStream.range(0, 6).mapToObj(i -> job(17.386 + i * 0.0002, 78.487, i < 3 ? schoolA : schoolB)).toList();

        Result r = AllocationEngine.allocate(jobs, List.of(a, b), W, TRAVEL, null);

        Map<UUID, Set<UUID>> schoolsPerRider = new HashMap<>();
        for (Assignment as : r.assignments()) {
            UUID school = jobs.stream().filter(j -> j.orderId().equals(as.orderId())).findFirst().orElseThrow().schoolId();
            schoolsPerRider.computeIfAbsent(as.partnerId(), k -> new java.util.HashSet<>()).add(school);
        }
        assertThat(r.assignments()).hasSize(6);
        assertThat(schoolsPerRider.values()).allSatisfy(s -> assertThat(s).hasSize(1));
    }

    @Test
    void spreadsWorkInsteadOfFillingOneRider() {
        Rider a = rider(17.3850, 78.4860, 10);
        Rider b = rider(17.3850, 78.4862, 10);
        List<Job> jobs = IntStream.range(0, 8).mapToObj(i -> job(17.386, 78.487 + i * 0.00005, schoolA)).toList();

        Result r = AllocationEngine.allocate(jobs, List.of(a, b), weightsWithoutBatching(), TRAVEL, null);

        Map<UUID, Long> load = r.assignments().stream().collect(Collectors.groupingBy(Assignment::partnerId, Collectors.counting()));
        assertThat(load.values()).containsExactlyInAnyOrder(4L, 4L);
    }

    @Test
    void neverExceedsCapacityAndCountsBoxesAlreadyHeld() {
        Rider busy = new Rider(UUID.randomUUID(), "Busy", Geo.point(17.385, 78.486), 3, 2, Set.of(), 5000, null,
                SHIFT_START, SHIFT_END, Presence.NOT_STARTED, null, 0.9, Set.of());
        List<Job> jobs = List.of(job(17.3851, 78.4861, schoolA), job(17.3852, 78.4862, schoolA), job(17.3853, 78.4863, schoolA));

        Result r = AllocationEngine.allocate(jobs, List.of(busy), W, TRAVEL, null);

        assertThat(r.assignments()).hasSize(1);
        assertThat(r.unassigned()).hasSize(2).allSatisfy(u -> assertThat(u.reason()).isEqualTo(Reason.ALL_FULL));
    }

    @Test
    void explainsWhyAnOrderFoundNoRider() {
        Job farAway = job(17.60, 78.70, schoolA);
        Result outOfRange = AllocationEngine.allocate(List.of(farAway), List.of(rider(17.385, 78.486, 5)), W, TRAVEL, null);
        assertThat(outOfRange.unassigned()).singleElement().extracting(AllocationModel.Unassigned::reason).isEqualTo(Reason.OUT_OF_RANGE);

        Polygon zone = Geo.polygon(List.of(new GeoPoint(17.40, 78.40), new GeoPoint(17.40, 78.42), new GeoPoint(17.42, 78.42),
                new GeoPoint(17.42, 78.40)));
        Rider zoned = new Rider(UUID.randomUUID(), "Zoned", Geo.point(17.385, 78.486), 5, 0, Set.of(), 10_000, zone,
                SHIFT_START, SHIFT_END, Presence.NOT_STARTED, null, 0.9, Set.of());
        Result outside = AllocationEngine.allocate(List.of(job(17.386, 78.487, schoolA)), List.of(zoned), W, TRAVEL, null);
        assertThat(outside.unassigned()).singleElement().extracting(AllocationModel.Unassigned::reason).isEqualTo(Reason.OUTSIDE_ZONE);

        Rider lateShift = new Rider(UUID.randomUUID(), "Late", Geo.point(17.385, 78.486), 5, 0, Set.of(), 5000, null,
                WINDOW_END.plusSeconds(60), SHIFT_END, Presence.NOT_STARTED, null, 0.9, Set.of());
        Result shift = AllocationEngine.allocate(List.of(job(17.386, 78.487, schoolA)), List.of(lateShift), W, TRAVEL, null);
        assertThat(shift.unassigned()).singleElement().extracting(AllocationModel.Unassigned::reason).isEqualTo(Reason.SHIFT_TIMES);

        Job declined = job(17.386, 78.487, schoolA);
        Rider decliner = new Rider(UUID.randomUUID(), "No", Geo.point(17.385, 78.486), 5, 0, Set.of(), 5000, null,
                SHIFT_START, SHIFT_END, Presence.NOT_STARTED, null, 0.9, Set.of(declined.orderId()));
        Result d = AllocationEngine.allocate(List.of(declined), List.of(decliner), W, TRAVEL, null);
        assertThat(d.unassigned()).singleElement().extracting(AllocationModel.Unassigned::reason).isEqualTo(Reason.DECLINED);
    }

    @Test
    void sameDayRunsSkipOfflineRidersAndRidersWhoCannotMakeItInTime() {
        Rider offline = new Rider(UUID.randomUUID(), "Off", Geo.point(17.385, 78.486), 5, 0, Set.of(), 5000, null,
                SHIFT_START, SHIFT_END, Presence.OFFLINE, null, 0.9, Set.of());
        Job job = job(17.386, 78.487, schoolA);
        Result off = AllocationEngine.allocate(List.of(job), List.of(offline), W, TRAVEL, WINDOW_START);
        assertThat(off.unassigned()).singleElement().extracting(AllocationModel.Unassigned::reason).isEqualTo(Reason.RIDER_OFFLINE);
        // The same rider is fine when planning a future day: presence only matters today.
        assertThat(AllocationEngine.allocate(List.of(job), List.of(offline), W, TRAVEL, null).assignments()).hasSize(1);

        // 9 km away at 18 km/h ≈ 40 min; with 10 minutes of the window left the rider cannot make it.
        Rider far = new Rider(UUID.randomUUID(), "Far", Geo.point(17.320, 78.486), 5, 0, Set.of(), 20_000, null,
                SHIFT_START, SHIFT_END, Presence.ONLINE, null, 0.9, Set.of());
        Result late = AllocationEngine.allocate(List.of(job), List.of(far), W, TRAVEL, WINDOW_END.minusSeconds(600));
        assertThat(late.unassigned()).singleElement().extracting(AllocationModel.Unassigned::reason).isEqualTo(Reason.TOO_LATE);
    }

    @Test
    void priorityOrdersWinWhenThereIsNotEnoughRoom() {
        Rider one = rider(17.385, 78.486, 1);
        Job normal = job(17.3851, 78.4861, schoolA);
        Job priority = new Job(UUID.randomUUID(), schoolA, Geo.point(17.3900, 78.4900), WINDOW_START, WINDOW_END, DEADLINE, true);

        Result r = AllocationEngine.allocate(List.of(normal, priority), List.of(one), W, TRAVEL, null);

        assertThat(byOrder(r)).containsOnlyKeys(priority.orderId());
    }

    @Test
    void reliableWellRatedRidersAreFavouredAtEqualDistance() {
        Rider unreliable = new Rider(UUID.randomUUID(), "U", Geo.point(17.385, 78.486), 5, 0, Set.of(), 5000, null,
                SHIFT_START, SHIFT_END, Presence.NOT_STARTED, 3.0, 0.5, Set.of());
        Rider reliable = new Rider(UUID.randomUUID(), "R", Geo.point(17.385, 78.486), 5, 0, Set.of(), 5000, null,
                SHIFT_START, SHIFT_END, Presence.NOT_STARTED, 4.9, 1.0, Set.of());

        Result r = AllocationEngine.allocate(List.of(job(17.386, 78.487, schoolA)), List.of(unreliable, reliable), W, TRAVEL, null);

        assertThat(r.assignments()).singleElement().extracting(Assignment::partnerId).isEqualTo(reliable.partnerId());
    }

    @Test
    void theBreakdownAddsUpToTheTotal() {
        Result r = AllocationEngine.allocate(List.of(job(17.386, 78.487, schoolA)), List.of(rider(17.385, 78.486, 5)), W, TRAVEL, null);
        AllocationModel.Breakdown b = r.assignments().get(0).breakdown();
        double sum = b.distanceCost() + b.newSchoolCost() + b.workloadCost() + b.ratingCost() + b.reliabilityCost();
        assertThat(b.total()).isCloseTo(sum, org.assertj.core.data.Offset.offset(0.02));
    }

    @Test
    void isDeterministic() {
        List<Rider> riders = IntStream.range(0, 6).mapToObj(i -> rider(17.38 + i * 0.004, 78.48, 4)).toList();
        List<Job> jobs = IntStream.range(0, 20).mapToObj(i -> job(17.38 + (i % 7) * 0.003, 78.482 + (i % 5) * 0.002,
                i % 3 == 0 ? schoolA : schoolB)).toList();

        Map<UUID, UUID> first = byOrder(AllocationEngine.allocate(jobs, riders, W, TRAVEL, null));
        Map<UUID, UUID> second = byOrder(AllocationEngine.allocate(jobs, riders, W, TRAVEL, null));

        assertThat(second).isEqualTo(first);
    }

    // ---- fixtures ----

    private static AllocationWeights weightsWithoutBatching() {
        return new AllocationWeights(1.0, 0.0, W.workloadKm(), W.ratingKm(), W.reliabilityKm(), W.unassignedPenaltyKm(),
                W.priorityMultiplier(), W.candidatesPerOrder(), W.offlineAfterMinutes(), W.roadDetourFactor(),
                W.averageSpeedKmph());
    }

    private static Rider rider(double lat, double lng, int capacity) {
        return new Rider(UUID.randomUUID(), "Rider", Geo.point(lat, lng), capacity, 0, Set.of(), 8000, null, SHIFT_START,
                SHIFT_END, Presence.NOT_STARTED, null, 0.9, Set.of());
    }

    private static Job job(double lat, double lng, UUID school) {
        return new Job(UUID.randomUUID(), school, Geo.point(lat, lng), WINDOW_START, WINDOW_END, DEADLINE, false);
    }

    private static Map<UUID, UUID> byOrder(Result r) {
        return r.assignments().stream().collect(Collectors.toMap(Assignment::orderId, Assignment::partnerId));
    }
}
