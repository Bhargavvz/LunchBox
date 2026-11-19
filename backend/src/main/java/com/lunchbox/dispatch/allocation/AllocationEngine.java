package com.lunchbox.dispatch.allocation;

import com.google.ortools.Loader;
import com.google.ortools.graph.MinCostFlow;
import com.google.ortools.graph.MinCostFlowBase;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.dispatch.allocation.AllocationModel.Assignment;
import com.lunchbox.dispatch.allocation.AllocationModel.Breakdown;
import com.lunchbox.dispatch.allocation.AllocationModel.Job;
import com.lunchbox.dispatch.allocation.AllocationModel.Presence;
import com.lunchbox.dispatch.allocation.AllocationModel.Reason;
import com.lunchbox.dispatch.allocation.AllocationModel.Result;
import com.lunchbox.dispatch.allocation.AllocationModel.Rider;
import com.lunchbox.dispatch.allocation.AllocationModel.Unassigned;
import com.lunchbox.dispatch.allocation.TravelTimeProvider.Leg;
import com.lunchbox.dispatch.allocation.TravelTimeProvider.Pair;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Assigns a day's lunchboxes to riders (ADR-0023).
 *
 * <ol>
 *   <li><b>Eligibility.</b> A rider can take an order only if the home is inside their service radius (and zone, if
 *   they have one), their shift covers the pickup window and the school deadline, they have not declined it, and —
 *   for same-day runs — they are not offline and can reach the home before the pickup window closes. Each order keeps
 *   its nearest {@code candidatesPerOrder} eligible riders, priced with road distances when available.</li>
 *   <li><b>Optimal assignment.</b> A min-cost flow (OR-Tools) over source → order → rider → sink finds the cheapest way
 *   to serve every order at once, instead of greedily giving each order its nearest rider. Rider capacity is a set of
 *   unit slots whose cost grows with the load (workload term), so work spreads evenly; every order also has an arc to
 *   "unassigned" with a large penalty, so the flow is always feasible and unservable orders are reported, not lost.</li>
 *   <li><b>Batching.</b> Keeping a school's boxes on one rider is a fixed cost per (rider, school), which a flow cannot
 *   express exactly; a local search then relocates single orders, moves a whole school's orders between riders and
 *   swaps orders while the exact objective improves.</li>
 * </ol>
 *
 * Pure and deterministic (ties break on input order); no database or Spring dependencies.
 */
public final class AllocationEngine {

    /** Cost units per km-equivalent in the integer flow. */
    private static final double SCALE = 100.0;
    private static final double EPS = 1e-9;
    private static final int MAX_PASSES = 40;
    private static final long LOCAL_SEARCH_BUDGET_MS = 3_000;
    private static final double UNRATED = 4.0;

    static {
        Loader.loadNativeLibraries();
    }

    private AllocationEngine() {
    }

    /**
     * @param now the current instant for same-day runs (enables offline and "can still make it" checks); null when
     *            planning a future day
     */
    public static Result allocate(List<Job> jobs, List<Rider> riders, AllocationWeights w, TravelTimeProvider travel,
                                  Instant now) {
        long started = System.nanoTime();
        int jobCount = jobs.size();
        int riderCount = riders.size();
        if (jobCount == 0) {
            return new Result(List.of(), List.of(), 0, 0, 0, travel.name());
        }
        if (riderCount == 0) {
            List<Unassigned> all = jobs.stream().map(j -> new Unassigned(j.orderId(), Reason.NO_RIDERS_ON_SHIFT)).toList();
            return new Result(List.of(), all, jobCount * w.unassignedPenaltyKm(), 0, millis(started), travel.name());
        }

        // ---- 1. Eligibility (cheap checks) and the nearest K riders per order ----
        int[][] cand = new int[jobCount][];
        Reason[] funnel = new Reason[jobCount];
        List<Pair> pairs = new ArrayList<>();
        for (int j = 0; j < jobCount; j++) {
            Job job = jobs.get(j);
            List<int[]> ok = new ArrayList<>(); // {riderIndex, straight-line metres}
            int furthest = -1;
            for (int r = 0; r < riderCount; r++) {
                Rider rider = riders.get(r);
                double straight = Geo.haversineMeters(rider.start(), job.pickup());
                int stage;
                if (straight > rider.serviceRadiusM()) {
                    stage = 0;
                } else if (rider.zone() != null && !rider.zone().covers(job.pickup())) {
                    stage = 1;
                } else if (!shiftCovers(rider, job)) {
                    stage = 2;
                } else if (now != null && rider.presence() == Presence.OFFLINE) {
                    stage = 3;
                } else if (rider.declined().contains(job.orderId())) {
                    stage = 4;
                } else if (rider.freeSlots() == 0) {
                    stage = 6;
                } else {
                    ok.add(new int[]{r, (int) Math.round(straight)});
                    continue;
                }
                furthest = Math.max(furthest, stage);
            }
            ok.sort(Comparator.comparingInt((int[] a) -> a[1]).thenComparingInt(a -> a[0]));
            int keep = Math.min(ok.size(), Math.max(1, w.candidatesPerOrder()));
            cand[j] = new int[keep];
            for (int k = 0; k < keep; k++) {
                cand[j][k] = ok.get(k)[0];
                pairs.add(new Pair(riders.get(cand[j][k]).start(), job.pickup()));
            }
            funnel[j] = furthest < 0 ? null : FUNNEL[furthest];
        }

        // ---- Travel (one batched lookup) and the time check for same-day runs ----
        List<Leg> legs = pairs.isEmpty() ? List.of() : travel.legs(pairs, w);
        Leg[][] candLeg = new Leg[jobCount][];
        double[][] candBase = new double[jobCount][];
        int cursor = 0;
        for (int j = 0; j < jobCount; j++) {
            Job job = jobs.get(j);
            List<Integer> keptRiders = new ArrayList<>();
            List<Leg> keptLegs = new ArrayList<>();
            for (int r : cand[j]) {
                Leg leg = legs.get(cursor++);
                if (now != null && !canMakeIt(riders.get(r), job, leg, now)) {
                    funnel[j] = worse(funnel[j], Reason.TOO_LATE);
                    continue;
                }
                keptRiders.add(r);
                keptLegs.add(leg);
            }
            cand[j] = keptRiders.stream().mapToInt(Integer::intValue).toArray();
            candLeg[j] = keptLegs.toArray(Leg[]::new);
            candBase[j] = new double[cand[j].length];
            for (int k = 0; k < cand[j].length; k++) {
                candBase[j][k] = baseCost(riders.get(cand[j][k]), candLeg[j][k], w);
            }
        }

        // ---- 2. Min-cost flow ----
        int[] assign = solveFlow(jobs, riders, cand, candBase, w);

        // ---- 3. Local search on the exact objective ----
        State state = new State(jobs, riders, cand, candBase, w, assign);
        int moves = state.improve(started);

        // ---- 4. Explain ----
        List<Assignment> assignments = new ArrayList<>();
        List<Unassigned> unassigned = new ArrayList<>();
        for (int j = 0; j < jobCount; j++) {
            Job job = jobs.get(j);
            int k = state.assign[j];
            if (k < 0) {
                unassigned.add(new Unassigned(job.orderId(), cand[j].length > 0 ? Reason.ALL_FULL
                        : funnel[j] == null ? Reason.ALL_FULL : funnel[j]));
                continue;
            }
            int r = cand[j][k];
            Rider rider = riders.get(r);
            Leg leg = candLeg[j][k];
            double km = leg.meters() / 1000;
            double distanceCost = w.distancePerKm() * km;
            double ratingCost = ratingCost(rider, w);
            double reliabilityCost = reliabilityCost(rider, w);
            int newHere = state.newJobsAt(r);
            double workloadShare = newHere == 0 ? 0
                    : (workload(rider, rider.load() + newHere, w) - workload(rider, rider.load(), w)) / newHere;
            double schoolShare = rider.schools().contains(job.schoolId()) ? 0
                    : w.newSchoolKm() / state.count(r, job.schoolId());
            double total = distanceCost + ratingCost + reliabilityCost + workloadShare + schoolShare;
            UUID runnerUp = null;
            Double runnerUpCost = null;
            for (int k2 = 0; k2 < cand[j].length; k2++) {
                if (k2 == k) {
                    continue;
                }
                int r2 = cand[j][k2];
                Rider other = riders.get(r2);
                double c = candBase[j][k2]
                        + (workload(other, state.load[r2] + 1, w) - workload(other, state.load[r2], w))
                        + (other.schools().contains(job.schoolId()) || state.count(r2, job.schoolId()) > 0 ? 0 : w.newSchoolKm());
                if (runnerUpCost == null || c < runnerUpCost) {
                    runnerUpCost = round2(c);
                    runnerUp = other.partnerId();
                }
            }
            Breakdown b = new Breakdown(round2(km), (int) Math.round(leg.seconds() / 60), leg.road(), round2(distanceCost),
                    round2(schoolShare), round2(workloadShare), round2(ratingCost), round2(reliabilityCost), round2(total));
            assignments.add(new Assignment(job.orderId(), rider.partnerId(), b, cand[j].length, runnerUp, runnerUpCost));
        }
        return new Result(assignments, unassigned, round2(state.objective()), moves, millis(started), travel.name());
    }

    private static final Reason[] FUNNEL = {Reason.OUT_OF_RANGE, Reason.OUTSIDE_ZONE, Reason.SHIFT_TIMES,
            Reason.RIDER_OFFLINE, Reason.DECLINED, Reason.TOO_LATE, Reason.ALL_FULL};

    private static Reason worse(Reason current, Reason candidate) {
        if (current == null) {
            return candidate;
        }
        return indexOf(candidate) > indexOf(current) ? candidate : current;
    }

    private static int indexOf(Reason r) {
        for (int i = 0; i < FUNNEL.length; i++) {
            if (FUNNEL[i] == r) {
                return i;
            }
        }
        return -1;
    }

    /** The shift must have started by the time the pickup window closes and last until the school deadline. */
    static boolean shiftCovers(Rider rider, Job job) {
        boolean startsInTime = rider.shiftStart() == null || !rider.shiftStart().isAfter(job.pickupWindowEnd());
        boolean lastsLongEnough = rider.shiftEnd() == null || !rider.shiftEnd().isBefore(job.deliveryDeadline());
        return startsInTime && lastsLongEnough;
    }

    private static boolean canMakeIt(Rider rider, Job job, Leg leg, Instant now) {
        Instant leave = rider.shiftStart() != null && rider.shiftStart().isAfter(now) ? rider.shiftStart() : now;
        return !leave.plusSeconds((long) leg.seconds()).isAfter(job.pickupWindowEnd());
    }

    private static double baseCost(Rider rider, Leg leg, AllocationWeights w) {
        return w.distancePerKm() * leg.meters() / 1000 + ratingCost(rider, w) + reliabilityCost(rider, w);
    }

    private static double ratingCost(Rider rider, AllocationWeights w) {
        double rating = rider.rating() == null ? UNRATED : Math.max(0, Math.min(5, rider.rating()));
        return w.ratingKm() * (1 - rating / 5);
    }

    private static double reliabilityCost(Rider rider, AllocationWeights w) {
        return w.reliabilityKm() * (1 - Math.max(0, Math.min(1, rider.reliability())));
    }

    /** Total workload cost of a rider holding {@code load} boxes: convex, so the k-th box costs more than the (k−1)-th. */
    static double workload(Rider rider, int load, AllocationWeights w) {
        return w.workloadKm() * (double) load * load / Math.max(1, rider.capacity());
    }

    private static double penalty(Job job, AllocationWeights w) {
        return w.unassignedPenaltyKm() * (job.priority() ? w.priorityMultiplier() : 1);
    }

    /** Returns, per job, the index into its candidate list, or -1 for unassigned. */
    private static int[] solveFlow(List<Job> jobs, List<Rider> riders, int[][] cand, double[][] candBase,
                                   AllocationWeights w) {
        int jobCount = jobs.size();
        int riderCount = riders.size();
        int source = 0;
        int sink = 1 + jobCount + riderCount;
        MinCostFlow flow = new MinCostFlow();
        int[] demandPerRider = new int[riderCount];
        Map<Integer, int[]> jobArcs = new HashMap<>();
        int[] unassignedArc = new int[jobCount];
        for (int j = 0; j < jobCount; j++) {
            Job job = jobs.get(j);
            flow.addArcWithCapacityAndUnitCost(source, 1 + j, 1, 0);
            int[] arcs = new int[cand[j].length];
            for (int k = 0; k < cand[j].length; k++) {
                int r = cand[j][k];
                Rider rider = riders.get(r);
                double approxSchool = rider.schools().contains(job.schoolId()) ? 0 : w.newSchoolKm();
                arcs[k] = flow.addArcWithCapacityAndUnitCost(1 + j, 1 + jobCount + r, 1,
                        Math.round((candBase[j][k] + approxSchool) * SCALE));
                demandPerRider[r]++;
            }
            jobArcs.put(j, arcs);
            unassignedArc[j] = flow.addArcWithCapacityAndUnitCost(1 + j, sink, 1, Math.round(penalty(job, w) * SCALE));
        }
        for (int r = 0; r < riderCount; r++) {
            Rider rider = riders.get(r);
            int last = Math.min(rider.capacity(), rider.load() + demandPerRider[r]);
            for (int slot = rider.load() + 1; slot <= last; slot++) {
                double marginal = workload(rider, slot, w) - workload(rider, slot - 1, w);
                flow.addArcWithCapacityAndUnitCost(1 + jobCount + r, sink, 1, Math.round(marginal * SCALE));
            }
        }
        flow.setNodeSupply(source, jobCount);
        flow.setNodeSupply(sink, -jobCount);
        MinCostFlowBase.Status status = flow.solve();
        if (status != MinCostFlowBase.Status.OPTIMAL) {
            throw new IllegalStateException("Allocation flow did not solve: " + status);
        }
        int[] assign = new int[jobCount];
        Arrays.fill(assign, -1);
        for (int j = 0; j < jobCount; j++) {
            int[] arcs = jobArcs.get(j);
            for (int k = 0; k < arcs.length; k++) {
                if (flow.getFlow(arcs[k]) > 0) {
                    assign[j] = k;
                    break;
                }
            }
        }
        return assign;
    }

    /** Mutable assignment with the exact objective, for the local search. */
    private static final class State {
        final List<Job> jobs;
        final List<Rider> riders;
        final int[][] cand;
        final double[][] base;
        final AllocationWeights w;
        final int[] assign;
        final int[] load;
        final List<Map<UUID, Integer>> schoolCounts;
        final List<List<Integer>> jobsAt;

        State(List<Job> jobs, List<Rider> riders, int[][] cand, double[][] base, AllocationWeights w, int[] assign) {
            this.jobs = jobs;
            this.riders = riders;
            this.cand = cand;
            this.base = base;
            this.w = w;
            this.assign = assign;
            this.load = new int[riders.size()];
            this.schoolCounts = new ArrayList<>();
            this.jobsAt = new ArrayList<>();
            for (int r = 0; r < riders.size(); r++) {
                load[r] = riders.get(r).load();
                schoolCounts.add(new HashMap<>());
                jobsAt.add(new ArrayList<>());
            }
            for (int j = 0; j < jobs.size(); j++) {
                if (assign[j] >= 0) {
                    add(j, cand[j][assign[j]]);
                }
            }
        }

        int count(int r, UUID school) {
            return schoolCounts.get(r).getOrDefault(school, 0);
        }

        int newJobsAt(int r) {
            return jobsAt.get(r).size();
        }

        private void add(int j, int r) {
            load[r]++;
            schoolCounts.get(r).merge(jobs.get(j).schoolId(), 1, Integer::sum);
            jobsAt.get(r).add(j);
        }

        private void remove(int j, int r) {
            load[r]--;
            schoolCounts.get(r).merge(jobs.get(j).schoolId(), -1, Integer::sum);
            jobsAt.get(r).remove(Integer.valueOf(j));
        }

        private int indexIn(int j, int r) {
            for (int k = 0; k < cand[j].length; k++) {
                if (cand[j][k] == r) {
                    return k;
                }
            }
            return -1;
        }

        private double schoolCharge(int r, UUID school, int countAfter) {
            return countAfter > 0 && !riders.get(r).schools().contains(school) ? w.newSchoolKm() : 0;
        }

        double objective() {
            double total = 0;
            for (int j = 0; j < jobs.size(); j++) {
                total += assign[j] < 0 ? penalty(jobs.get(j), w) : base[j][assign[j]];
            }
            for (int r = 0; r < riders.size(); r++) {
                Rider rider = riders.get(r);
                total += workload(rider, load[r], w) - workload(rider, rider.load(), w);
                for (Map.Entry<UUID, Integer> e : schoolCounts.get(r).entrySet()) {
                    total += schoolCharge(r, e.getKey(), e.getValue());
                }
            }
            return total;
        }

        /** Change in objective from moving {@code group} (all at rider {@code from}, or -1) to rider {@code to} (or -1). */
        private double moveDelta(List<Integer> group, int from, int to) {
            double delta = 0;
            Map<UUID, Integer> leaving = new HashMap<>();
            for (int j : group) {
                delta -= from < 0 ? penalty(jobs.get(j), w) : base[j][assign[j]];
                if (to < 0) {
                    delta += penalty(jobs.get(j), w);
                } else {
                    int k = indexIn(j, to);
                    if (k < 0) {
                        return Double.POSITIVE_INFINITY;
                    }
                    delta += base[j][k];
                }
                leaving.merge(jobs.get(j).schoolId(), 1, Integer::sum);
            }
            int n = group.size();
            if (from >= 0) {
                Rider a = riders.get(from);
                delta += workload(a, load[from] - n, w) - workload(a, load[from], w);
                for (Map.Entry<UUID, Integer> e : leaving.entrySet()) {
                    int before = count(from, e.getKey());
                    delta += schoolCharge(from, e.getKey(), before - e.getValue()) - schoolCharge(from, e.getKey(), before);
                }
            }
            if (to >= 0) {
                Rider b = riders.get(to);
                if (load[to] + n > b.capacity()) {
                    return Double.POSITIVE_INFINITY;
                }
                delta += workload(b, load[to] + n, w) - workload(b, load[to], w);
                for (Map.Entry<UUID, Integer> e : leaving.entrySet()) {
                    int before = count(to, e.getKey());
                    delta += schoolCharge(to, e.getKey(), before + e.getValue()) - schoolCharge(to, e.getKey(), before);
                }
            }
            return delta;
        }

        private void apply(List<Integer> group, int from, int to) {
            for (int j : group) {
                if (from >= 0) {
                    remove(j, from);
                }
                if (to >= 0) {
                    add(j, to);
                    assign[j] = indexIn(j, to);
                } else {
                    assign[j] = -1;
                }
            }
        }

        private double swapDelta(int j1, int a, int j2, int b) {
            int k1 = indexIn(j1, b);
            int k2 = indexIn(j2, a);
            if (k1 < 0 || k2 < 0) {
                return Double.POSITIVE_INFINITY;
            }
            double delta = base[j1][k1] + base[j2][k2] - base[j1][assign[j1]] - base[j2][assign[j2]];
            UUID s1 = jobs.get(j1).schoolId();
            UUID s2 = jobs.get(j2).schoolId();
            if (!s1.equals(s2)) {
                delta += schoolCharge(a, s1, count(a, s1) - 1) - schoolCharge(a, s1, count(a, s1));
                delta += schoolCharge(a, s2, count(a, s2) + 1) - schoolCharge(a, s2, count(a, s2));
                delta += schoolCharge(b, s2, count(b, s2) - 1) - schoolCharge(b, s2, count(b, s2));
                delta += schoolCharge(b, s1, count(b, s1) + 1) - schoolCharge(b, s1, count(b, s1));
            }
            return delta;
        }

        int improve(long startedNanos) {
            int moves = 0;
            for (int pass = 0; pass < MAX_PASSES; pass++) {
                boolean improved = false;
                // Single relocations, including unassigned → rider.
                for (int j = 0; j < jobs.size(); j++) {
                    int from = assign[j] < 0 ? -1 : cand[j][assign[j]];
                    for (int r : cand[j]) {
                        if (r == from) {
                            continue;
                        }
                        List<Integer> one = List.of(j);
                        if (moveDelta(one, from, r) < -EPS) {
                            apply(one, from, r);
                            from = r;
                            moves++;
                            improved = true;
                        }
                    }
                }
                // Whole-school moves: what keeps a school's boxes together when single moves cannot pay the fixed cost.
                for (int a = 0; a < riders.size(); a++) {
                    for (UUID school : List.copyOf(schoolCounts.get(a).keySet())) {
                        List<Integer> group = jobsAt.get(a).stream().filter(j -> jobs.get(j).schoolId().equals(school)).toList();
                        if (group.isEmpty()) {
                            continue;
                        }
                        for (int b = 0; b < riders.size(); b++) {
                            if (b != a && moveDelta(group, a, b) < -EPS) {
                                apply(group, a, b);
                                moves++;
                                improved = true;
                                break;
                            }
                        }
                    }
                }
                // Swaps between riders whose candidate lists overlap.
                for (int j1 = 0; j1 < jobs.size(); j1++) {
                    if (assign[j1] < 0) {
                        continue;
                    }
                    int a = cand[j1][assign[j1]];
                    for (int b : cand[j1]) {
                        if (b == a) {
                            continue;
                        }
                        for (int j2 : List.copyOf(jobsAt.get(b))) {
                            if (assign[j1] < 0 || cand[j1][assign[j1]] != a) {
                                break;
                            }
                            if (swapDelta(j1, a, j2, b) < -EPS) {
                                apply(List.of(j1), a, b);
                                apply(List.of(j2), b, a);
                                moves++;
                                improved = true;
                                a = b;
                                break;
                            }
                        }
                    }
                }
                if (!improved || (System.nanoTime() - startedNanos) / 1_000_000 > LOCAL_SEARCH_BUDGET_MS) {
                    break;
                }
            }
            return moves;
        }
    }

    private static double round2(double d) {
        return Math.round(d * 100) / 100.0;
    }

    private static long millis(long startedNanos) {
        return (System.nanoTime() - startedNanos) / 1_000_000;
    }
}
