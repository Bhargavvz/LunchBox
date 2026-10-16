package com.lunchbox.dispatch;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.lock.DistributedLock;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.SecurityContext;
import com.lunchbox.dispatch.web.DispatchDtos.AutoAssignResult;
import com.lunchbox.orders.OrderCommands;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
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
import java.time.LocalDate;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Greedy nearest-available assignment. Orders are taken in pickup-window order; each goes to the eligible partner
 * (scheduled shift, KYC approved, spare capacity, within service radius) with the lowest score, where score is the
 * Haversine distance from the partner's start point to the home, halved when the partner already serves that school
 * (keeps school runs together). A Redis lock per order plus the partial unique index on active assignments guarantee
 * an order is never double-assigned even when ops staff assign manually at the same time.
 */
@Slf4j
@Service
public class AssignmentService {

    private static final Duration LOCK_TTL = Duration.ofSeconds(15);
    private static final double SAME_SCHOOL_AFFINITY = 0.5;

    private final AssignmentRepository assignments;
    private final PartnerShiftRepository shifts;
    private final DeliveryPartnerRepository partners;
    private final OrderQueries orderQueries;
    private final OrderCommands orderCommands;
    private final RoutePlanningService routePlanning;
    private final DistributedLock lock;
    private final AuditService audit;
    private final MeterRegistry meters;
    private final TransactionTemplate tx;
    private final Clock clock;

    public AssignmentService(AssignmentRepository assignments, PartnerShiftRepository shifts,
                             DeliveryPartnerRepository partners, OrderQueries orderQueries, OrderCommands orderCommands,
                             RoutePlanningService routePlanning, DistributedLock lock, AuditService audit,
                             MeterRegistry meters, PlatformTransactionManager txManager, Clock clock) {
        this.assignments = assignments;
        this.shifts = shifts;
        this.partners = partners;
        this.orderQueries = orderQueries;
        this.orderCommands = orderCommands;
        this.routePlanning = routePlanning;
        this.lock = lock;
        this.audit = audit;
        this.meters = meters;
        this.tx = new TransactionTemplate(txManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
    }

    private record Candidate(DeliveryPartner partner, Point start) {
    }

    public AutoAssignResult autoAssign(LocalDate date) {
        List<OrderView> pending = orderQueries.forDate(date, EnumSet.of(OrderStatus.SCHEDULED, OrderStatus.REASSIGNED))
                .stream().sorted(Comparator.comparing(OrderView::pickupWindowStart)).toList();
        if (pending.isEmpty()) {
            return new AutoAssignResult(date, 0, 0, 0, 0);
        }
        List<Candidate> candidates = shifts.findByShiftDateAndStatusIn(date,
                        EnumSet.of(PartnerShift.Status.SCHEDULED, PartnerShift.Status.ACTIVE)).stream()
                .map(s -> partners.findById(s.getPartnerId()).filter(DeliveryPartner::canWork)
                        .map(p -> new Candidate(p, s.getStartLocation() != null ? s.getStartLocation() : p.getHomeZone())))
                .flatMap(Optional::stream)
                .toList();

        Map<UUID, Integer> load = new HashMap<>();
        Map<UUID, Set<UUID>> schoolsServed = new HashMap<>();
        for (Candidate c : candidates) {
            List<OrderView> current = orderQueries.forPartnerAndDate(c.partner().getId(), date).stream()
                    .filter(o -> !o.status().isTerminal()).toList();
            load.put(c.partner().getId(), current.size());
            schoolsServed.put(c.partner().getId(), new HashSet<>(current.stream().map(OrderView::schoolId).toList()));
        }

        int assigned = 0;
        Set<UUID> touched = new HashSet<>();
        for (OrderView order : pending) {
            Optional<Candidate> best = candidates.stream()
                    .filter(c -> load.get(c.partner().getId()) < c.partner().getCapacity())
                    .filter(c -> Geo.haversineMeters(c.start(), order.pickupLocation()) <= c.partner().getServiceRadiusM())
                    .min(Comparator.comparingDouble(c -> score(c, order, schoolsServed)));
            if (best.isEmpty()) {
                continue;
            }
            UUID partnerId = best.get().partner().getId();
            boolean ok = tryAssign(order.id(), partnerId, null, "auto");
            if (ok) {
                assigned++;
                load.merge(partnerId, 1, Integer::sum);
                schoolsServed.get(partnerId).add(order.schoolId());
                touched.add(partnerId);
            }
        }
        int routes = 0;
        for (UUID partnerId : touched) {
            try {
                if (tx.execute(s -> routePlanning.plan(partnerId, date)).isPresent()) {
                    routes++;
                }
            } catch (RuntimeException e) {
                log.error("Route planning failed for partner {} on {}", partnerId, date, e);
            }
        }
        int unassigned = pending.size() - assigned;
        meters.counter("lunchbox.dispatch.assigned").increment(assigned);
        if (unassigned > 0) {
            meters.counter("lunchbox.dispatch.unassigned").increment(unassigned);
            log.warn("{} orders for {} could not be assigned (no eligible partner capacity)", unassigned, date);
        }
        return new AutoAssignResult(date, pending.size(), assigned, unassigned, routes);
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
        if (order.status() == OrderStatus.ASSIGNED) {
            tx.executeWithoutResult(s -> release(orderId, reason == null ? "Reassigned by operations" : reason));
        } else if (order.status() != OrderStatus.SCHEDULED && order.status() != OrderStatus.REASSIGNED) {
            throw Errors.conflict("not_assignable", "Only orders that have not left with a partner can be reassigned.");
        }
        if (!tryAssign(orderId, partnerId, SecurityContext.currentUser().map(CurrentUser::userId).orElse(null), "manual")) {
            throw Errors.conflict("assignment_conflict", "The order was changed by someone else. Refresh and retry.");
        }
        tx.executeWithoutResult(s -> {
            audit.record("order.assigned", "Order", orderId, previous == null ? null : Map.of("partnerId", previous),
                    Map.of("partnerId", partnerId, "reason", reason == null ? "" : reason));
            routePlanning.plan(partnerId, order.scheduledDate());
            if (previous != null) {
                routePlanning.plan(previous, order.scheduledDate());
            }
        });
    }

    /** Releases a partner's not-yet-collected orders (no-show, emergency) so they can be reassigned. */
    @Transactional
    public List<UUID> releaseOpenOrders(UUID partnerId, LocalDate date, String reason) {
        List<UUID> released = orderQueries.forPartnerAndDate(partnerId, date).stream()
                .filter(o -> o.status() == OrderStatus.ASSIGNED)
                .map(OrderView::id).toList();
        released.forEach(id -> release(id, reason));
        routePlanning.plan(partnerId, date);
        return released;
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

    private static double score(Candidate c, OrderView order, Map<UUID, Set<UUID>> schoolsServed) {
        double d = Geo.haversineMeters(c.start(), order.pickupLocation());
        boolean sameSchool = schoolsServed.getOrDefault(c.partner().getId(), Set.of()).contains(order.schoolId());
        return sameSchool ? d * SAME_SCHOOL_AFFINITY : d;
    }
}
