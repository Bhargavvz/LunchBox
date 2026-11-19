package com.lunchbox.subscriptions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.subscriptions.PlanFeatureDefinition.ValueType;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CouponAndFeatureRulesTest {

    private static final Instant NOW = Instant.parse("2026-11-20T06:00:00Z");
    private final ObjectMapper json = new ObjectMapper();
    private final CouponRepository coupons = mock(CouponRepository.class);
    private final CouponRedemptionRepository redemptions = mock(CouponRedemptionRepository.class);
    private final SubscriptionRepository subscriptions = mock(SubscriptionRepository.class);
    private final CouponService service = new CouponService(coupons, redemptions, subscriptions, mock(AuditService.class),
            Clock.fixed(NOW, ZoneOffset.UTC));
    private final Plan plan = plan();
    private final UUID parent = UUID.randomUUID();

    private static Plan plan() {
        Plan p = new Plan("MONTHLY", "Monthly", null, 249900, Plan.BillingPeriod.MONTHLY, 5);
        ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
        return p;
    }

    private Coupon coupon(Coupon.Kind kind, long amount) {
        Coupon c = new Coupon("SAVE");
        ReflectionTestUtils.setField(c, "id", UUID.randomUUID());
        c.configure(null, kind, amount, null, null, null, null, List.of(), false, true);
        when(coupons.findByCodeIgnoreCase("SAVE")).thenReturn(Optional.of(c));
        return c;
    }

    @Test
    void percentAndFlatDiscountsAreCappedAndLeaveTheRazorpayMinimum() {
        Coupon tenPercent = coupon(Coupon.Kind.PERCENT, 10);
        assertThat(tenPercent.discountOn(249900)).isEqualTo(24990);
        tenPercent.configure(null, Coupon.Kind.PERCENT, 10, 20000L, null, null, null, List.of(), false, true);
        assertThat(tenPercent.discountOn(249900)).isEqualTo(20000);
        Coupon huge = coupon(Coupon.Kind.FLAT, 10_000_000);
        assertThat(huge.discountOn(249900)).isEqualTo(249800); // ₹1 always remains to pay
    }

    @Test
    void aValidCodeIsCaseInsensitiveAndPriced() {
        coupon(Coupon.Kind.FLAT, 50000);
        CouponService.Applied applied = service.check(" save ", plan, parent);
        assertThat(applied.discountPaise()).isEqualTo(50000);
        assertThat(applied.code()).isEqualTo("SAVE");
    }

    @Test
    void refusesExpiredUsedUpWrongPlanAlreadyUsedAndFirstPlanOnlyCodes() {
        Coupon c = coupon(Coupon.Kind.PERCENT, 10);
        c.configure(null, Coupon.Kind.PERCENT, 10, null, null, LocalDate.of(2026, 11, 1), null, List.of(), false, true);
        assertCode("coupon_expired");

        c.configure(null, Coupon.Kind.PERCENT, 10, null, LocalDate.of(2026, 12, 1), null, null, List.of(), false, true);
        assertCode("coupon_not_started");

        c.configure(null, Coupon.Kind.PERCENT, 10, null, null, null, 1, List.of(), false, true);
        ReflectionTestUtils.setField(c, "redeemed", 1);
        assertCode("coupon_used_up");

        c.configure(null, Coupon.Kind.PERCENT, 10, null, null, null, null, List.of(UUID.randomUUID()), false, true);
        assertCode("coupon_wrong_plan");

        c.configure(null, Coupon.Kind.PERCENT, 10, null, null, null, null, List.of(), false, false);
        assertCode("coupon_invalid");

        c.configure(null, Coupon.Kind.PERCENT, 10, null, null, null, null, List.of(), false, true);
        when(redemptions.existsByCouponIdAndParentId(c.getId(), parent)).thenReturn(true);
        assertCode("coupon_already_used");

        when(redemptions.existsByCouponIdAndParentId(c.getId(), parent)).thenReturn(false);
        c.configure(null, Coupon.Kind.PERCENT, 10, null, null, null, null, List.of(), true, true);
        Subscription paid = mock(Subscription.class);
        when(paid.getPeriodsPaid()).thenReturn(1);
        when(subscriptions.findByParentIdOrderByCreatedAtDesc(parent)).thenReturn(List.of(paid));
        assertCode("coupon_first_only");
    }

    @Test
    void unknownCodesAreRefused() {
        when(coupons.findByCodeIgnoreCase(any())).thenReturn(Optional.empty());
        assertCode("coupon_invalid");
    }

    @Test
    void featureValuesAreCheckedByType() throws Exception {
        assertThat(PlanFeatures.check(ValueType.BOOLEAN, json.readTree("true"))).isNull();
        assertThat(PlanFeatures.check(ValueType.BOOLEAN, json.readTree("\"yes\""))).isNotNull();
        assertThat(PlanFeatures.check(ValueType.INTEGER, json.readTree("2"))).isNull();
        assertThat(PlanFeatures.check(ValueType.INTEGER, json.readTree("-1"))).isNotNull();
        assertThat(PlanFeatures.check(ValueType.DAYS, json.readTree("[\"MONDAY\",\"SATURDAY\"]"))).isNull();
        assertThat(PlanFeatures.check(ValueType.DAYS, json.readTree("[\"MONDAY\",\"MONDAY\"]"))).isNotNull();
        assertThat(PlanFeatures.check(ValueType.DAYS, json.readTree("[\"FUNDAY\"]"))).isNotNull();
        assertThat(PlanFeatures.check(ValueType.DAYS, json.readTree("[]"))).isNotNull();
        assertThat(PlanFeatures.check(ValueType.TEXT, json.readTree("\"Full refund within 7 days\""))).isNull();
        assertThat(PlanFeatures.check(ValueType.MONEY, json.readTree("9900"))).isNull();
        assertThat(PlanFeatures.check(ValueType.MONEY, json.readTree("99.5"))).isNotNull();
    }

    private void assertCode(String code) {
        assertThatThrownBy(() -> service.check("SAVE", plan, parent)).isInstanceOf(ApiException.class).extracting("code")
                .isEqualTo(code);
    }
}
