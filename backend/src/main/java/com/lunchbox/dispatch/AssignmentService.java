package com.lunchbox.dispatch;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.lock.DistributedLock;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.SecurityContext;
import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.dispatch.allocation.AllocationDecision.Outcome;
import com.lunchbox.dispatch.allocation.AllocationEngine;
import com.lunchbox.dispatch.allocation.AllocationLog;
import com.lunchbox.dispatch.allocation.AllocationModel;
import com.lunchbox.dispatch.allocation.AllocationModel.Job;
import com.lunchbox.dispatch.allocation.AllocationModel.Presence;
import com.lunchbox.dispatch.allocation.AllocationModel.Rider;
import com.lunchbox.dispatch.allocation.AllocationRun.Trigger;
import com.lunchbox.dispatch.allocation.AllocationWeights;
import com.lunchbox.dispatch.allocation.TravelTimeProvider;
import com.lunchbox.dispatch.web.DispatchDtos.AutoAssignResult;
import com.lunchbox.orders.OrderCommands;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import com.lunchbox.serviceareas.ServiceAreaDirectory;
import com.lunchbox.subscriptions.SubscriptionQueries;
import com.lunchbox.tracking.LiveLocationStore;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.Point;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Gives orders to riders. The choice itself is made by {@link AllocationEngine} (min-cost assignment over distance,
 * school batching, workload, rating and reliability, ADR-0023); this service gathers the day's riders and orders,
 * applies the result with a Redis lock per order plus the partial unique index on active assignments (so an order is
 * never double-assigned, even against a concurrent manual assignment), records every decision, re-plans routes and
 * raises an ops alert when orders are left without a rider.
 */
@Slf4j
@Service
public class AssignmentService {

    private static final Duration LOCK_TTL = Duration.ofSeconds(15);
    private static final int RELIABILITY_DAYS = 30;
    /** Reliability of a rider with no shift history yet. */
    private static final double NEW_RIDER_RELIABILITY = 0.9;
    private static final double DECLINE_PENALTY = 0.05;

    private final AssignmentRepository assignments;
    private final PartnerShiftRepository shifts;
    private final DeliveryPartnerRepository partners;
    private final OrderQueries orderQueries;
    private final OrderCommands orderCommands;
    private final RoutePlanningService routePlanning;
    private final DistributedLock lock;
    private final AuditService audit;
    private final AllocationLog allocationLog;
    private final TravelTimeProvider travel;
    private final PlatformSettings settings;
    private final LiveLocationStore liveLocations;
    private final ServiceAreaDirectory zones;
    private final SubscriptionQueries subscriptions;
    private final OutboxPublisher outbox;
    private final MeterRegistry meters;
    private final TransactionTemplate tx;
    private final Clock clock;

    public AssignmentService(AssignmentRepository assignments, PartnerShiftRepository shifts,
                             DeliveryPartnerRepository partners, OrderQueries orderQueries, OrderCommands orderCommands,
                             RoutePlanningService routePlanning, DistributedLock lock, AuditService audit,
                             AllocationLog allocationLog, TravelTimeProvider travel, PlatformSettings settings,
                             LiveLocationStore liveLocations, ServiceAreaDirectory zones,
                             SubscriptionQueries subscriptions, OutboxPublisher outbox, MeterRegistry meters,
                             PlatformTransactionManager txManager, Clock clock) {
        this.assignments = assignments;
        this.shifts = shifts;
        this.partners = partners;
        this.orderQueries = orderQueries;
        this.orderCommands = orderCommands;
        this.routePlanning = routePlanning;
        this.lock = lock;
        this.audit = audit;
        this.allocationLog = allocationLog;
        this.travel = travel;
        this.settings = settings;
        this.liveLocations = liveLocations;
        this.zones = zones;
        this.subscriptions = subscriptions;
        this.outbox = outbox;
        this.meters = meters;
        this.tx = new TransactionTemplate(txManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
    }

    /** A dispatch problem ops should look at (orders without a rider, a rider gone silent mid-route). */
    public record DispatchAlert(String kind, LocalDate date, UUID partnerId, String summary, Instant at) {
    }

    public AllocationWeights weights() {
        try {
            return AllocationWeights.from(settings.raw("allocation.weights"));
        } catch (RuntimeException e) {
            log.warn("Allocation weights unavailable, using defaults: {}", e.getMessage());
            return AllocationWeights.DEFAULTS;
        }
    }

    public AutoAssignResult autoAssign(LocalDate date) {
        return autoAssign(date, Trigger.SCHEDULED, null);
    }

    public AutoAssignResult autoAssign(LocalDate date, Trigger trigger, UUID actorUserId) {
        LocalDate today = TimeZones.todayIst(clock);
        if (date.isBefore(today)) {
            throw Errors.badRequest("past_date", "Orders for a past day cannot be assigned.");
        }
        List<OrderView> pending = orderQueries.forDate(date, EnumSet.of(OrderStatus.SCHEDULED, OrderStatus.REASSIGNED))
                .stream().sorted(Comparator.comparing(OrderView::pickupWindowStart).thenComparing(OrderView::id)).toList();
        if (pending.isEmpty()) {
            return new AutoAssignResult(date, 0, 0, 0, 0, null);
        }
        AllocationWeights weights = weights();
        Instant now = date.equals(today) ? clock.instant() : null;
        Instant startedAt = clock.instant();
        List<Rider> riders = riders(date, now, weights, pending.stream().map(OrderView::id).toList());
        Set<UUID> priority = subscriptions.priorityDeliverySubscriptions(
                pending.stream().map(OrderView::subscriptionId).filter(Objects::nonNull).collect(Collectors.toSet()));
        List<Job> jobs = pending.stream().map(o -> new Job(o.id(), o.schoolId(), o.pickupLocation(), o.pickupWindowStart(),
                o.pickupWindowEnd(), o.deliveryDeadline(), o.subscriptionId() != null && priority.contains(o.subscriptionId())))
                .toList();

        AllocationModel.Result result = AllocationEngine.allocate(jobs, riders, weights, travel, now);
        Map<UUID, Rider> riderById = riders.stream().collect(Collectors.toMap(Rider::partnerId, Function.identity()));
        Map<UUID, AllocationLog.LatestOutcome> previous = allocationLog.latestOutcomes(pending.stream().map(OrderView::id).toList());

        // Only runs that changed something (or that a person asked for) are logged; a quiet re-run leaves no row.
        List<AllocationModel.Unassigned> newlyUnassigned = result.unassigned().stream()
                .filter(u -> !previous.containsKey(u.orderId())
                        || previous.get(u.orderId()).outcome() != Outcome.UNASSIGNED
                        || !u.reason().name().equals(previous.get(u.orderId()).reasonCode()))
                .toList();
        boolean logRun = trigger != Trigger.SCHEDULED || !result.assignments().isEmpty() || !newlyUnassigned.isEmpty();
        UUID runId = logRun ? allocationLog.startRun(date, trigger, actorUserId, weights, startedAt) : null;

        int assigned = 0;
        Set<UUID> touched = new HashSet<>();
        for (AllocationModel.Assignment a : result.assignments()) {
            if (tryAssign(a.orderId(), a.partnerId(), actorUserId, trigger == Trigger.MANUAL ? "auto-manual" : "auto")) {
                assigned++;
                touched.add(a.partnerId());
                allocationLog.record(runId, a.orderId(), a.partnerId(), Outcome.ASSIGNED, "LOWEST_COST",
                        explain(a, riderById), a.breakdown(), a.eligibleRiders(), a.runnerUpPartnerId(), a.runnerUpCost(),
                        actorUserId);
            } else if (runId != null) {
                allocationLog.record(runId, a.orderId(), a.partnerId(), Outcome.CONFLICT, "CHANGED_ELSEWHERE",
                        "The order changed while the run was in progress (for example, ops assigned it by hand). "
                                + "Nothing was overwritten; the next run will look at it again.",
                        a.breakdown(), a.eligibleRiders(), null, null, actorUserId);
            }
        }
        for (AllocationModel.Unassigned u : newlyUnassigned) {
            allocationLog.record(runId, u.orderId(), null, Outcome.UNASSIGNED, u.reason().name(),
                    u.reason().explanation(), null, 0, null, null, actorUserId);
        }

        int routes = 0;
        for (UUID partnerId : touched) {
            try {
                if (tx.execute(s -> routePlanning.plan(partnerId, date)).isPresent()) {
                    routes++;
                }
            } catch (RuntimeException e) {
                log.error("Route planning failed for partner {} on {}", partnerId, date, e);
                audit.system(AuditService.Severity.ERROR, "route.planning_failed", "Partner", partnerId,
                        "The route for a rider on " + date + " could not be planned; their stops keep the previous order "
                                + "until the next run.", Map.of("error", String.valueOf(e.getMessage())));
            }
        }
        int unassigned = pending.size() - assigned;
        if (runId != null) {
            allocationLog.finishRun(runId, pending.size(), assigned, unassigned, riders.size(), result);
            audit.system(AuditService.Severity.INFO, "allocation.run", "AllocationRun", runId,
                    "Rider allocation for " + date + ": " + assigned + " of " + pending.size() + " orders assigned to "
                            + touched.size() + " of " + riders.size() + " riders (" + trigger.name().toLowerCase(Locale.ROOT) + ").",
                    Map.of("trigger", trigger.name(), "considered", pending.size(), "assigned", assigned,
                            "unassigned", unassigned, "riders", riders.size(), "solveMs", result.solveMillis(),
                            "travel", result.travelSource()));
        }
        meters.counter("lunchbox.dispatch.assigned").increment(assigned);
        if (unassigned > 0) {
            meters.counter("lunchbox.dispatch.unassigned").increment(unassigned);
            log.warn("{} orders for {} could not be assigned", unassigned, date);
            alertUnassigned(date, result.unassigned());
        }
        return new AutoAssignResult(date, pending.size(), assigned, unassigned, routes, runId);
    }

    /** The day's riders as the engine sees them: start point, load, schools, zone, presence, rating, reliability. */
    private List<Rider> riders(LocalDate date, Instant now, AllocationWeights weights, List<UUID> pendingOrderIds) {
        List<PartnerShift> dayShifts = shifts.findByShiftDateAndStatusIn(date,
                EnumSet.of(PartnerShift.Status.SCHEDULED, PartnerShift.Status.ACTIVE));
        Map<UUID, DeliveryPartner> working = partners.findByIdIn(dayShifts.stream().map(PartnerShift::getPartnerId).toList())
                .stream().filter(DeliveryPartner::canWork)
                .collect(Collectors.toMap(DeliveryPartner::getId, Function.identity()));
        Map<UUID, Set<UUID>> declinedByOrder = allocationLog.declinedBy(pendingOrderIds);
        Map<UUID, Set<UUID>> declinedByPartner = new HashMap<>();
        declinedByOrder.forEach((orderId, ps) -> ps.forEach(p -> declinedByPartner.computeIfAbsent(p, k -> new HashSet<>()).add(orderId)));
        Map<UUID, Double> reliability = reliability(working.keySet(), date);

        List<Rider> out = new ArrayList<>();
        for (PartnerShift shift : dayShifts) {
            DeliveryPartner p = working.get(shift.getPartnerId());
            if (p == null) {
                continue;
            }
            List<OrderView> held = orderQueries.forPartnerAndDate(p.getId(), date).stream()
                    .filter(o -> !o.status().isTerminal()).toList();
            Point start = shift.getStartLocation() != null ? shift.getStartLocation() : p.getHomeZone();
            Presence presence = Presence.NOT_STARTED;
            if (shift.getStatus() == PartnerShift.Status.ACTIVE) {
                Optional<LiveLocationStore.Fix> fix = liveLocations.last(p.getId());
                boolean fresh = now != null && fix.isPresent()
                        && fix.get().recordedAt().isAfter(now.minus(Duration.ofMinutes(weights.offlineAfterMinutes())));
                presence = now == null || fresh ? Presence.ONLINE : Presence.OFFLINE;
                if (fresh) {
                    start = Geo.point(fix.get().lat(), fix.get().lng());
                }
            }
            out.add(new Rider(p.getId(), displayName(p), start, p.getCapacity(), held.size(),
                    held.stream().map(OrderView::schoolId).collect(Collectors.toSet()), p.getServiceRadiusM(),
                    zones.activeBoundary(p.getServiceAreaId()).orElse(null), shift.getPlannedStart(), shift.getPlannedEnd(),
                    presence, p.getRating() == null || p.getRatingCount() == 0 ? null : p.getRating().doubleValue(),
                    reliability.getOrDefault(p.getId(), NEW_RIDER_RELIABILITY),
                    declinedByPartner.getOrDefault(p.getId(), Set.of())));
        }
        return out;
    }

    /**
     * Share of the last 30 days' finished shifts the rider turned up for, minus 0.05 per declined order in that time.
     * Riders with no finished shift yet count as 0.9.
     */
    private Map<UUID, Double> reliability(Set<UUID> partnerIds, LocalDate date) {
        if (partnerIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, long[]> counts = new HashMap<>(); // {attended, noShow}
        for (PartnerShiftRepository.ShiftCount c : shifts.countByStatus(partnerIds, date.minusDays(RELIABILITY_DAYS), date)) {
            long[] a = counts.computeIfAbsent(c.getPartnerId(), k -> new long[2]);
            if (c.getStatus() == PartnerShift.Status.NO_SHOW) {
                a[1] += c.getTotal();
            } else if (c.getStatus() == PartnerShift.Status.ENDED || c.getStatus() == PartnerShift.Status.ACTIVE) {
                a[0] += c.getTotal();
            }
        }
        Map<UUID, Long> declines = allocationLog.declineCounts(partnerIds,
                TimeZones.atIst(date.minusDays(RELIABILITY_DAYS), java.time.LocalTime.MIDNIGHT));
        Map<UUID, Double> out = new HashMap<>();
        for (UUID id : partnerIds) {
            long[] a = counts.getOrDefault(id, new long[2]);
            double base = a[0] + a[1] == 0 ? NEW_RIDER_RELIABILITY : (double) a[0] / (a[0] + a[1]);
            out.put(id, Math.max(0, Math.min(1, base - DECLINE_PENALTY * declines.getOrDefault(id, 0L))));
        }
        return out;
    }

    private static String explain(AllocationModel.Assignment a, Map<UUID, Rider> riders) {
        AllocationModel.Breakdown b = a.breakdown();
        Rider r = riders.get(a.partnerId());
        StringBuilder s = new StringBuilder(String.format(Locale.ROOT, "Best of %d eligible rider%s: %.1f km to the home (%s, ~%d min)",
                a.eligibleRiders(), a.eligibleRiders() == 1 ? "" : "s", b.distanceKm(), b.roadDistance() ? "road" : "estimated",
                b.travelMinutes()));
        s.append(b.newSchoolCost() == 0 ? ", already going to this school" : ", adds a school to the run");
        if (r != null && r.rating() != null) {
            s.append(String.format(Locale.ROOT, ", rated %.1f", r.rating()));
        }
        if (r != null) {
            s.append(String.format(Locale.ROOT, ", reliability %d%%", Math.round(r.reliability() * 100)));
        }
        s.append(String.format(Locale.ROOT, ". Cost %.2f", b.total()));
        if (a.runnerUpCost() != null) {
            s.append(String.format(Locale.ROOT, " vs %.2f for the next best", a.runnerUpCost()));
        }
        return s.append('.').toString();
    }

    private void alertUnassigned(LocalDate date, List<AllocationModel.Unassigned> unassigned) {
        if (unassigned.isEmpty() || !liveLocations.once("alert:unassigned:" + date + ":" + unassigned.size(), Duration.ofHours(1))) {
            return;
        }
        Map<AllocationModel.Reason, Long> byReason = unassigned.stream()
                .collect(Collectors.groupingBy(AllocationModel.Unassigned::reason, Collectors.counting()));
        String why = byReason.entrySet().stream().sorted(Map.Entry.<AllocationModel.Reason, Long>comparingByValue().reversed())
                .map(e -> e.getValue() + " " + e.getKey().explanation().toLowerCase(Locale.ROOT).replaceAll("\\.$", ""))
                .collect(Collectors.joining("; "));
        String summary = unassigned.size() + " order" + (unassigned.size() == 1 ? "" : "s") + " for " + date
                + " have no rider: " + why;
        audit.system(AuditService.Severity.WARNING, "allocation.unassigned", "OrderBatch", date, summary,
                byReason.entrySet().stream().collect(Collectors.toMap(e -> e.getKey().name(), Map.Entry::getValue)));
        tx.executeWithoutResult(s -> outbox.publish("Dispatch", UUID.nameUUIDFromBytes(("unassigned:" + date).getBytes()),
                Messaging.DISPATCH_ALERT, new DispatchAlert("UNASSIGNED_ORDERS", date, null, summary, clock.instant())));
    }

    /**
     * Ops: assign or move an order to a specific partner, then re-plan the affected routes. Deliberately not one
     * transaction: the release must commit before the (separately locked) assignment so the row lock is free.
     */
    public void manualAssign(UUID orderId, UUID partnerId, String reason) {
        OrderView order = orderQueries.require(orderId);
        DeliveryPartner partner = partners.findById(partnerId).orElseThrow(() -> Errors.notFound("Partner"));
        if (!partner.canWork()) {
            throw Errors.unprocessable("partner_not_eligible", "This partner cannot take deliveries.");
        }
        if (shifts.findByPartnerIdAndShiftDate(partnerId, order.scheduledDate()).filter(PartnerShift::isAvailable).isEmpty()) {
            throw Errors.unprocessable("no_shift", "This partner has no shift on " + order.scheduledDate() + ".");
        }
        UUID previous = order.partnerId();
        if (partnerId.equals(previous)) {
            return;
        }
        String why = reason == null || reason.isBlank() ? "Assigned by operations" : reason.trim();
        if (order.status() == OrderStatus.ASSIGNED) {
            tx.executeWithoutResult(s -> release(orderId, "Reassigned by operations: " + why));
        } else if (order.status() != OrderStatus.SCHEDULED && order.status() != OrderStatus.REASSIGNED) {
            throw Errors.conflict("not_assignable", "Only orders that have not left with a partner can be reassigned.");
        }
        UUID actor = SecurityContext.currentUser().map(CurrentUser::userId).orElse(null);
        if (!tryAssign(orderId, partnerId, actor, "manual")) {
            throw Errors.conflict("assignment_conflict", "The order was changed by someone else. Refresh and retry.");
        }
        allocationLog.record(null, orderId, partnerId, Outcome.MANUAL, "OPS_OVERRIDE",
                previous == null ? why : why + " (moved from " + partners.findById(previous).map(AssignmentService::displayName).orElse("another rider") + ")",
                null, null, null, null, actor);
        tx.executeWithoutResult(s -> {
            audit.record("order.assigned", "Order", orderId, previous == null ? null : Map.of("partnerId", previous),
                    Map.of("partnerId", partnerId, "reason", why));
            routePlanning.plan(partnerId, order.scheduledDate());
            if (previous != null) {
                routePlanning.plan(previous, order.scheduledDate());
            }
        });
    }

    /**
     * A rider says they cannot take an order they have not set off for yet. It goes back to the pool, is never offered
     * to them again, and the day is re-allocated straight away.
     */
    public AutoAssignResult decline(UUID partnerId, UUID orderId, String reason) {
        OrderView order = orderQueries.require(orderId);
        if (!partnerId.equals(order.partnerId())) {
            throw Errors.notFound("Order");
        }
        if (order.status() != OrderStatus.ASSIGNED) {
            throw Errors.conflict("cannot_decline", "Only orders you have not started for can be declined. Report an issue instead.");
        }
        String why = reason == null || reason.isBlank() ? "No reason given" : reason.trim();
        tx.executeWithoutResult(s -> {
            release(orderId, "Declined by rider: " + why);
            routePlanning.plan(partnerId, order.scheduledDate());
            audit.record("order.declined", "Order", orderId, Map.of("partnerId", partnerId), Map.of("reason", why));
        });
        allocationLog.record(null, orderId, partnerId, Outcome.DECLINED, "RIDER_DECLINED", "Declined by the rider: " + why,
                null, null, null, null, null);
        return autoAssign(order.scheduledDate(), Trigger.DECLINE, null);
    }

    /** Releases a partner's not-yet-collected orders (no-show, offline, emergency) so they can be reassigned. */
    @Transactional
    public List<UUID> releaseOpenOrders(UUID partnerId, LocalDate date, String reason) {
        List<UUID> released = orderQueries.forPartnerAndDate(partnerId, date).stream()
                .filter(o -> o.status() == OrderStatus.ASSIGNED)
                .map(OrderView::id).toList();
        released.forEach(id -> {
            release(id, reason);
            allocationLog.record(null, id, partnerId, Outcome.RELEASED, "RELEASED", reason, null, null, null, null, null);
        });
        routePlanning.plan(partnerId, date);
        return released;
    }

    /**
     * Same-day watch: a rider whose shift is running but whose phone has not reported a location for the offline
     * threshold loses the orders they have not set off for (re-allocated at once); for boxes already on the way, ops
     * get an alert to call the rider, because a collected lunchbox cannot be handed to someone else.
     */
    public void handleOfflineRiders() {
        LocalDate today = TimeZones.todayIst(clock);
        AllocationWeights weights = weights();
        Instant threshold = clock.instant().minus(Duration.ofMinutes(weights.offlineAfterMinutes()));
        boolean releasedAny = false;
        for (PartnerShift shift : shifts.findByShiftDateAndStatusIn(today, EnumSet.of(PartnerShift.Status.ACTIVE))) {
            Optional<LiveLocationStore.Fix> fix = liveLocations.last(shift.getPartnerId());
            Instant lastSeen = fix.map(LiveLocationStore.Fix::recordedAt).orElse(shift.getStartedAt());
            if (lastSeen == null || lastSeen.isAfter(threshold)) {
                continue;
            }
            long minutes = Duration.between(lastSeen, clock.instant()).toMinutes();
            List<OrderView> held = orderQueries.forPartnerAndDate(shift.getPartnerId(), today);
            if (held.stream().anyMatch(o -> o.status() == OrderStatus.ASSIGNED)) {
                try {
                    List<UUID> released = tx.execute(s -> releaseOpenOrders(shift.getPartnerId(), today,
                            "Rider offline for " + minutes + " min"));
                    releasedAny |= released != null && !released.isEmpty();
                } catch (RuntimeException e) {
                    log.error("Releasing orders of offline partner {} failed", shift.getPartnerId(), e);
                }
            }
            long onTheWay = held.stream().filter(o -> o.status() == OrderStatus.PARTNER_EN_ROUTE
                    || o.status() == OrderStatus.PICKED_UP || o.status() == OrderStatus.IN_TRANSIT
                    || o.status() == OrderStatus.AT_SCHOOL).count();
            if (onTheWay > 0 && liveLocations.once("alert:offline:" + shift.getPartnerId() + ":" + today, Duration.ofMinutes(15))) {
                String name = partners.findById(shift.getPartnerId()).map(AssignmentService::displayName).orElse("A rider");
                String summary = name + " has not sent a location for " + minutes + " min with " + onTheWay
                        + " lunchbox" + (onTheWay == 1 ? "" : "es") + " on the way. Call the rider.";
                audit.system(AuditService.Severity.WARNING, "allocation.rider_offline", "Partner", shift.getPartnerId(), summary,
                        Map.of("minutesSilent", minutes, "boxesOnTheWay", onTheWay));
                tx.executeWithoutResult(s -> outbox.publish("Dispatch", shift.getPartnerId(), Messaging.DISPATCH_ALERT,
                        new DispatchAlert("RIDER_OFFLINE", today, shift.getPartnerId(), summary, clock.instant())));
            }
        }
        if (releasedAny) {
            autoAssign(today, Trigger.OFFLINE, null);
        }
    }

    private void release(UUID orderId, String reason) {
        assignments.findByOrderIdAndStatus(orderId, Assignment.Status.ACTIVE)
                .ifPresent(a -> a.release(reason, clock.instant()));
        assignments.flush();
        orderCommands.releasePartner(orderId, reason);
    }

    private boolean tryAssign(UUID orderId, UUID partnerId, UUID actorUserId, String mode) {
        Optional<String> token = lock.tryAcquire("assign:order:" + orderId, LOCK_TTL);
        if (token.isEmpty()) {
            return false;
        }
        try {
            Boolean result = tx.execute(status -> {
                OrderView fresh = orderQueries.require(orderId);
                if (fresh.status() != OrderStatus.SCHEDULED && fresh.status() != OrderStatus.REASSIGNED) {
                    return false;
                }
                if (assignments.findByOrderIdAndStatus(orderId, Assignment.Status.ACTIVE).isPresent()) {
                    return false;
                }
                assignments.save(new Assignment(orderId, partnerId, actorUserId, clock.instant()));
                orderCommands.assignPartner(orderId, partnerId, Map.of("mode", mode));
                return true;
            });
            return Boolean.TRUE.equals(result);
        } catch (RuntimeException e) {
            log.warn("Assignment of order {} to partner {} failed: {}", orderId, partnerId, e.getMessage());
            return false;
        } finally {
            lock.release("assign:order:" + orderId, token.get());
        }
    }

    private static String displayName(DeliveryPartner p) {
        return p.getLastName() == null ? p.getFirstName() : p.getFirstName() + " " + p.getLastName();
    }
}
