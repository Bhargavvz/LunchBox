package com.lunchbox.dispatch;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.lock.DistributedLock;
import com.lunchbox.dispatch.web.DispatchDtos.AutoAssignResult;
import com.lunchbox.orders.OrderCommands;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AssignmentServiceTest {

    private static final LocalDate DATE = LocalDate.of(2026, 10, 20);
    private static final Instant T0 = Instant.parse("2026-10-20T04:00:00Z");

    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final PartnerShiftRepository shifts = mock(PartnerShiftRepository.class);
    private final DeliveryPartnerRepository partners = mock(DeliveryPartnerRepository.class);
    private final OrderQueries orderQueries = mock(OrderQueries.class);
    private final OrderCommands orderCommands = mock(OrderCommands.class);
    private final RoutePlanningService routePlanning = mock(RoutePlanningService.class);
    private final DistributedLock lock = mock(DistributedLock.class);
    private final PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
    private final AssignmentService service = new AssignmentService(assignments, shifts, partners, orderQueries,
            orderCommands, routePlanning, lock, mock(AuditService.class), new SimpleMeterRegistry(), txManager,
            Clock.fixed(T0, ZoneOffset.UTC));

    private final UUID schoolA = UUID.randomUUID();
    private final UUID schoolB = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        when(txManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(lock.tryAcquire(anyString(), any(Duration.class))).thenReturn(Optional.of("token"));
        when(assignments.findByOrderIdAndStatus(any(), eq(Assignment.Status.ACTIVE))).thenReturn(Optional.empty());
        when(routePlanning.plan(any(), eq(DATE))).thenReturn(Optional.of(UUID.randomUUID()));
    }

    @Test
    void assignsEachOrderToTheNearestEligiblePartner() {
        DeliveryPartner near = partner(12.9700, 77.5900, 5, 5000);
        DeliveryPartner far = partner(13.0200, 77.6400, 5, 15000);
        shiftsFor(near, far);
        OrderView order = order(12.9710, 77.5910, schoolA);
        pending(order);

        AutoAssignResult result = service.autoAssign(DATE);

        assertThat(result.assigned()).isEqualTo(1);
        assertThat(result.routesPlanned()).isEqualTo(1);
        verify(orderCommands).assignPartner(eq(order.id()), eq(near.getId()), anyMap());
        verify(routePlanning).plan(near.getId(), DATE);
    }

    @Test
    void prefersAPartnerAlreadyServingTheSameSchool() {
        DeliveryPartner closer = partner(12.9700, 77.5900, 5, 10000);
        DeliveryPartner sameSchool = partner(12.9727, 77.5905, 5, 10000);
        shiftsFor(closer, sameSchool);
        when(orderQueries.forPartnerAndDate(sameSchool.getId(), DATE))
                .thenReturn(List.of(assigned(sameSchool.getId(), schoolB)));
        // ~144 m from `closer`, ~167 m from `sameSchool`: the 0.5 affinity (≈ 83 m) tips it to `sameSchool`.
        OrderView order = order(12.9712, 77.5905, schoolB);
        pending(order);

        service.autoAssign(DATE);

        verify(orderCommands).assignPartner(eq(order.id()), eq(sameSchool.getId()), anyMap());
    }

    @Test
    void respectsCapacityAndServiceRadius() {
        DeliveryPartner small = partner(12.9700, 77.5900, 1, 5000);
        shiftsFor(small);
        OrderView first = order(12.9705, 77.5905, schoolA);
        OrderView second = order(12.9706, 77.5906, schoolA);
        OrderView outOfRange = order(13.2000, 77.9000, schoolA);
        pending(first, second, outOfRange);

        AutoAssignResult result = service.autoAssign(DATE);

        assertThat(result.considered()).isEqualTo(3);
        assertThat(result.assigned()).isEqualTo(1);
        assertThat(result.unassigned()).isEqualTo(2);
        verify(orderCommands).assignPartner(eq(first.id()), eq(small.getId()), anyMap());
        verify(orderCommands, never()).assignPartner(eq(outOfRange.id()), any(), anyMap());
    }

    @Test
    void skipsPartnersWhoCannotWork() {
        DeliveryPartner unapproved = partner(12.9700, 77.5900, 5, 5000);
        ReflectionTestUtils.setField(unapproved, "kycStatus", DeliveryPartner.KycStatus.IN_REVIEW);
        shiftsFor(unapproved);
        pending(order(12.9705, 77.5905, schoolA));

        assertThat(service.autoAssign(DATE).assigned()).isZero();
        verify(orderCommands, never()).assignPartner(any(), any(), anyMap());
    }

    @Test
    void doesNotAssignWhenAnotherWriterHoldsTheOrderLock() {
        DeliveryPartner p = partner(12.9700, 77.5900, 5, 5000);
        shiftsFor(p);
        OrderView order = order(12.9705, 77.5905, schoolA);
        pending(order);
        when(lock.tryAcquire(eq("assign:order:" + order.id()), any(Duration.class))).thenReturn(Optional.empty());

        assertThat(service.autoAssign(DATE).assigned()).isZero();
        verify(assignments, never()).save(any());
    }

    @Test
    void doesNotDoubleAssignAnOrderWithAnActiveAssignment() {
        DeliveryPartner p = partner(12.9700, 77.5900, 5, 5000);
        shiftsFor(p);
        OrderView order = order(12.9705, 77.5905, schoolA);
        pending(order);
        when(assignments.findByOrderIdAndStatus(order.id(), Assignment.Status.ACTIVE))
                .thenReturn(Optional.of(new Assignment(order.id(), UUID.randomUUID(), null, T0)));

        assertThat(service.autoAssign(DATE).assigned()).isZero();
        verify(orderCommands, never()).assignPartner(any(), any(), anyMap());
    }

    @Test
    void manualAssignRefusesOrdersAlreadyCollected() {
        DeliveryPartner p = partner(12.9700, 77.5900, 5, 5000);
        when(partners.findById(p.getId())).thenReturn(Optional.of(p));
        PartnerShift shift = new PartnerShift(p.getId(), DATE, T0, T0.plusSeconds(4 * 3600));
        when(shifts.findByPartnerIdAndShiftDate(p.getId(), DATE)).thenReturn(Optional.of(shift));
        OrderView pickedUp = withStatus(order(12.9705, 77.5905, schoolA), OrderStatus.PICKED_UP, UUID.randomUUID());
        when(orderQueries.require(pickedUp.id())).thenReturn(pickedUp);

        assertThatThrownBy(() -> service.manualAssign(pickedUp.id(), p.getId(), "Move"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("not_assignable");
    }

    @Test
    void manualAssignRequiresAShiftThatDay() {
        DeliveryPartner p = partner(12.9700, 77.5900, 5, 5000);
        when(partners.findById(p.getId())).thenReturn(Optional.of(p));
        when(shifts.findByPartnerIdAndShiftDate(p.getId(), DATE)).thenReturn(Optional.empty());
        OrderView order = order(12.9705, 77.5905, schoolA);
        when(orderQueries.require(order.id())).thenReturn(order);

        assertThatThrownBy(() -> service.manualAssign(order.id(), p.getId(), null))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("no_shift");
    }

    // ---- fixtures ----

    private DeliveryPartner partner(double lat, double lng, int capacity, int radiusM) {
        DeliveryPartner p = new DeliveryPartner(UUID.randomUUID());
        ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
        p.updateProfile("Ravi", null, DeliveryPartner.VehicleType.SCOOTER, "KA01AB1234", capacity, Geo.point(lat, lng), radiusM);
        p.kycDecision(true, UUID.randomUUID(), null, T0);
        when(partners.findById(p.getId())).thenReturn(Optional.of(p));
        when(orderQueries.forPartnerAndDate(p.getId(), DATE)).thenReturn(List.of());
        return p;
    }

    private void shiftsFor(DeliveryPartner... ps) {
        List<PartnerShift> list = Arrays.stream(ps)
                .map(p -> new PartnerShift(p.getId(), DATE, T0, T0.plusSeconds(4 * 3600))).toList();
        when(shifts.findByShiftDateAndStatusIn(eq(DATE), any())).thenReturn(list);
    }

    private void pending(OrderView... orders) {
        when(orderQueries.forDate(eq(DATE), any())).thenReturn(List.of(orders));
        for (OrderView o : orders) {
            when(orderQueries.require(o.id())).thenReturn(o);
        }
    }

    private OrderView order(double lat, double lng, UUID schoolId) {
        return new OrderView(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), schoolId, UUID.randomUUID(), null,
                DATE, T0.plusSeconds(1800), T0.plusSeconds(4500), T0.plusSeconds(9000), Geo.point(lat, lng),
                OrderStatus.SCHEDULED, null, null, null, null, null, null, 0);
    }

    private OrderView assigned(UUID partnerId, UUID schoolId) {
        return withStatus(order(12.98, 77.60, schoolId), OrderStatus.ASSIGNED, partnerId);
    }

    private static OrderView withStatus(OrderView o, OrderStatus status, UUID partnerId) {
        return new OrderView(o.id(), o.childId(), o.parentId(), o.schoolId(), o.addressId(), o.subscriptionId(),
                o.scheduledDate(), o.pickupWindowStart(), o.pickupWindowEnd(), o.deliveryDeadline(), o.pickupLocation(),
                status, partnerId, null, null, null, null, null, o.version());
    }
}
