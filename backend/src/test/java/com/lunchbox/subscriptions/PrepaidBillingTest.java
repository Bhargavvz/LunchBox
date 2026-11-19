package com.lunchbox.subscriptions;

import com.lunchbox.addresses.AddressDirectory;
import com.lunchbox.audit.AuditService;
import com.lunchbox.children.ChildDirectory;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.orders.PickupWindows;
import com.lunchbox.payments.FakePaymentGateway;
import com.lunchbox.payments.PaymentRecorder;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.subscriptions.SubscriptionEvents.RenewalDue;
import com.lunchbox.subscriptions.SubscriptionEvents.SubscriptionEnded;
import com.lunchbox.support.MutableClock;
import com.lunchbox.users.UserDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** ADR-0018: prepaid periods paid through Razorpay Orders. */
class PrepaidBillingTest {

    // 2026-11-15 10:00 IST
    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-15T04:30:00Z"));
    private final SubscriptionRepository subscriptions = mock(SubscriptionRepository.class);
    private final PlanRepository plans = mock(PlanRepository.class);
    private final UserDirectory users = mock(UserDirectory.class);
    private final ChildDirectory children = mock(ChildDirectory.class);
    private final PaymentRecorder payments = mock(PaymentRecorder.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final FakePaymentGateway gateway = new FakePaymentGateway();
    private final UUID parentUserId = UUID.randomUUID();
    private final UUID parentId = UUID.randomUUID();
    private final UUID childId = UUID.randomUUID();
    private SubscriptionService service;
    private Plan monthly;

    @BeforeEach
    void setUp() {
        service = new SubscriptionService(subscriptions, plans, mock(LeaveDayRepository.class), children,
                mock(AddressDirectory.class), mock(SchoolDirectory.class), users, gateway, payments,
                mock(PickupWindows.class), mock(PlanFeatures.class), mock(CouponService.class), mock(AuditService.class),
                events, clock, "prepaid");
        monthly = new Plan("WEEKDAY_MONTHLY", "Weekday lunch", null, 150_000, Plan.BillingPeriod.MONTHLY, 6);
        when(users.requireParentId(parentUserId)).thenReturn(parentId);
        when(plans.findById(any())).thenReturn(Optional.of(monthly));
        when(children.require(childId)).thenReturn(new ChildDirectory.ChildInfo(childId, parentId, UUID.randomUUID(),
                "Aarav", "Rao", "4", "B", false));
    }

    private Subscription subscription(LocalDate start) {
        return new Subscription(parentId, childId, UUID.randomUUID(), UUID.randomUUID(), EnumSet.of(DayOfWeek.MONDAY), start);
    }

    private static Instant istMidnight(String date) {
        return TimeZones.atIst(LocalDate.parse(date), LocalTime.MIDNIGHT);
    }

    @Test
    void firstPaymentCoversOnePeriodFromTheStartDate() {
        Subscription sub = subscription(LocalDate.parse("2026-11-20"));
        assertThat(SubscriptionService.nextPeriodEnd(sub, monthly, clock)).isEqualTo(istMidnight("2026-12-20"));
    }

    @Test
    void aStartDateInThePastCountsFromToday() {
        Subscription sub = subscription(LocalDate.parse("2026-11-01"));
        assertThat(SubscriptionService.nextPeriodEnd(sub, monthly, clock)).isEqualTo(istMidnight("2026-12-15"));
    }

    @Test
    void renewingEarlyExtendsTheCurrentPeriodWithoutLosingDays() {
        Subscription sub = subscription(LocalDate.parse("2026-10-20"));
        sub.activate(istMidnight("2026-11-20"));
        assertThat(SubscriptionService.nextPeriodEnd(sub, monthly, clock)).isEqualTo(istMidnight("2026-12-20"));
    }

    @Test
    void quarterlyPlansBuyThreeMonths() {
        Plan quarterly = new Plan("Q", "Quarterly", null, 400_000, Plan.BillingPeriod.QUARTERLY, 6);
        Subscription sub = subscription(LocalDate.parse("2026-11-20"));
        assertThat(SubscriptionService.nextPeriodEnd(sub, quarterly, clock)).isEqualTo(istMidnight("2027-02-20"));
    }

    @Test
    void aVerifiedOrderPaymentActivatesThePlanAndRecordsThePayment() {
        Subscription sub = subscription(LocalDate.parse("2026-11-20"));
        sub.awaitOrder("order_fake_1", 150_000, null);
        UUID id = UUID.randomUUID();
        when(subscriptions.findByIdAndParentId(id, parentId)).thenReturn(Optional.of(sub));

        service.verifyCheckout(parentUserId, id, "pay_1", FakePaymentGateway.signOrder("order_fake_1", "pay_1"));

        assertThat(sub.getStatus()).isEqualTo(Subscription.Status.ACTIVE);
        assertThat(sub.getCurrentPeriodEnd()).isEqualTo(istMidnight("2026-12-20"));
        assertThat(sub.getRazorpayOrderId()).isNull();
        verify(payments).recordCaptured(eq(parentId), any(), eq("pay_1"), any(), eq(150_000L), any(), eq("Weekday lunch"), any());
    }

    @Test
    void aForgedSignatureIsRejectedAndNothingIsRecorded() {
        Subscription sub = subscription(LocalDate.parse("2026-11-20"));
        sub.awaitOrder("order_fake_1", 150_000, null);
        UUID id = UUID.randomUUID();
        when(subscriptions.findByIdAndParentId(id, parentId)).thenReturn(Optional.of(sub));

        assertThatThrownBy(() -> service.verifyCheckout(parentUserId, id, "pay_1", "forged"))
                .isInstanceOf(ApiException.class);
        assertThat(sub.getStatus()).isEqualTo(Subscription.Status.PENDING_PAYMENT);
        verify(payments, never()).recordCaptured(any(), any(), any(), any(), anyLong(), any(), any(), any());
    }

    @Test
    void theWebhookActivatesAPlanWhoseAppNeverConfirmedThePayment() {
        Subscription sub = subscription(LocalDate.parse("2026-11-20"));
        sub.awaitOrder("order_fake_2", 150_000, null);
        when(subscriptions.findByRazorpayOrderId("order_fake_2")).thenReturn(Optional.of(sub));

        service.onOrderPaid("order_fake_2", "pay_2", 150_000, "upi", clock.instant());

        assertThat(sub.getStatus()).isEqualTo(Subscription.Status.ACTIVE);
        assertThat(sub.getCurrentPeriodEnd()).isEqualTo(istMidnight("2026-12-20"));
        verify(payments).recordCaptured(eq(parentId), any(), eq("pay_2"), any(), eq(150_000L), eq("upi"), any(), any());
    }

    @Test
    void theWebhookIgnoresAnAmountThatDoesNotMatchThePlan() {
        Subscription sub = subscription(LocalDate.parse("2026-11-20"));
        sub.awaitOrder("order_fake_3", 150_000, null);
        when(subscriptions.findByRazorpayOrderId("order_fake_3")).thenReturn(Optional.of(sub));

        service.onOrderPaid("order_fake_3", "pay_3", 100, "upi", clock.instant());

        assertThat(sub.getStatus()).isEqualTo(Subscription.Status.PENDING_PAYMENT);
        verify(payments, never()).recordCaptured(any(), any(), any(), any(), anyLong(), any(), any(), any());
    }

    @Test
    void renewingIsRefusedEarlierThanSevenDaysBeforeTheEnd() {
        Subscription sub = subscription(LocalDate.parse("2026-11-01"));
        sub.activate(istMidnight("2026-12-15"));
        UUID id = UUID.randomUUID();
        when(subscriptions.findByIdAndParentId(id, parentId)).thenReturn(Optional.of(sub));

        assertThatThrownBy(() -> service.renew(parentUserId, id, null)).isInstanceOf(ApiException.class);
    }

    @Test
    void theSweepLapsesEndedPeriodsAndRemindsOnceBeforeTheEnd() {
        Subscription ended = subscription(LocalDate.parse("2026-10-01"));
        ended.activate(clock.instant().minus(Duration.ofHours(1)));
        Subscription endingSoon = subscription(LocalDate.parse("2026-10-01"));
        endingSoon.activate(clock.instant().plus(Duration.ofDays(2)));
        when(subscriptions.findPrepaidEndingBefore(any())).thenReturn(List.of(ended, endingSoon));

        assertThat(service.sweepPrepaid()).isEqualTo(2);
        assertThat(ended.getStatus()).isEqualTo(Subscription.Status.HALTED);
        assertThat(endingSoon.getStatus()).isEqualTo(Subscription.Status.ACTIVE);
        verify(events).publishEvent(any(SubscriptionEnded.class));
        verify(events).publishEvent(any(RenewalDue.class));

        // A second sweep in the same period does not remind again.
        when(subscriptions.findPrepaidEndingBefore(any())).thenReturn(List.of(endingSoon));
        assertThat(service.sweepPrepaid()).isZero();
    }
}
