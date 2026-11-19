package com.lunchbox.subscriptions;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.subscriptions.web.SubscriptionDtos.CouponRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.CouponResponse;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Discount codes: admin management, checking a code for a parent's checkout, and redeeming it once paid. */
@Service
public class CouponService {

    private final CouponRepository coupons;
    private final CouponRedemptionRepository redemptions;
    private final SubscriptionRepository subscriptions;
    private final AuditService audit;
    private final Clock clock;

    public CouponService(CouponRepository coupons, CouponRedemptionRepository redemptions,
                         SubscriptionRepository subscriptions, AuditService audit, Clock clock) {
        this.coupons = coupons;
        this.redemptions = redemptions;
        this.subscriptions = subscriptions;
        this.audit = audit;
        this.clock = clock;
    }

    /** A coupon applied to a price. */
    public record Applied(UUID couponId, String code, long discountPaise) {
    }

    @Transactional(readOnly = true)
    public List<CouponResponse> list() {
        return coupons.findAllByOrderByCreatedAtDesc().stream().map(CouponService::toResponse).toList();
    }

    @Transactional
    public CouponResponse create(CouponRequest r) {
        String code = normalise(r.code());
        if (coupons.existsByCodeIgnoreCase(code)) {
            throw Errors.conflict("duplicate_code", "A coupon with this code already exists.");
        }
        Coupon c = new Coupon(code);
        apply(c, r);
        try {
            c = coupons.saveAndFlush(c);
        } catch (DataIntegrityViolationException e) {
            throw Errors.conflict("duplicate_code", "A coupon with this code already exists.");
        }
        CouponResponse out = toResponse(c);
        audit.record("coupon.created", "Coupon", c.getId(), null, out);
        return out;
    }

    @Transactional
    public CouponResponse update(UUID id, CouponRequest r) {
        Coupon c = coupons.findById(id).orElseThrow(() -> Errors.notFound("Coupon"));
        if (!c.getCode().equalsIgnoreCase(normalise(r.code()))) {
            throw Errors.badRequest("code_immutable", "A coupon's code cannot change. Create a new coupon instead.");
        }
        CouponResponse before = toResponse(c);
        apply(c, r);
        if (c.getMaxRedemptions() != null && c.getMaxRedemptions() < c.getRedeemed()) {
            throw Errors.badRequest("limit_below_used", "The limit cannot be lower than the " + c.getRedeemed() + " times already used.");
        }
        CouponResponse after = toResponse(c);
        audit.record("coupon.updated", "Coupon", id, before, after);
        return after;
    }

    /**
     * Checks a code for a parent buying {@code plan} and returns the discount. Throws a 422 with a message the parent
     * can act on when the code cannot be used.
     */
    @Transactional(readOnly = true)
    public Applied check(String rawCode, Plan plan, UUID parentId) {
        Coupon c = coupons.findByCodeIgnoreCase(normalise(rawCode))
                .orElseThrow(() -> Errors.unprocessable("coupon_invalid", "This coupon code is not valid."));
        LocalDate today = TimeZones.todayIst(clock);
        if (!c.isActive()) {
            throw Errors.unprocessable("coupon_invalid", "This coupon code is not valid.");
        }
        if (c.getValidFrom() != null && today.isBefore(c.getValidFrom())) {
            throw Errors.unprocessable("coupon_not_started", "This coupon can be used from " + c.getValidFrom() + ".");
        }
        if (c.getValidTo() != null && today.isAfter(c.getValidTo())) {
            throw Errors.unprocessable("coupon_expired", "This coupon has expired.");
        }
        if (c.getMaxRedemptions() != null && c.getRedeemed() >= c.getMaxRedemptions()) {
            throw Errors.unprocessable("coupon_used_up", "This coupon has been fully used.");
        }
        if (!c.getPlanIds().isEmpty() && !c.getPlanIds().contains(plan.getId())) {
            throw Errors.unprocessable("coupon_wrong_plan", "This coupon does not apply to " + plan.getName() + ".");
        }
        if (redemptions.existsByCouponIdAndParentId(c.getId(), parentId)) {
            throw Errors.unprocessable("coupon_already_used", "You have already used this coupon.");
        }
        if (c.isFirstSubscriptionOnly() && subscriptions.findByParentIdOrderByCreatedAtDesc(parentId).stream()
                .anyMatch(s -> s.getPeriodsPaid() > 0)) {
            throw Errors.unprocessable("coupon_first_only", "This coupon is for a first plan only.");
        }
        long discount = c.discountOn(plan.getPricePaise());
        if (discount <= 0) {
            throw Errors.unprocessable("coupon_no_discount", "This coupon gives no discount on this plan.");
        }
        return new Applied(c.getId(), c.getCode(), discount);
    }

    /** Records the redemption once the discounted payment is confirmed. Idempotent per (coupon, parent). */
    @Transactional
    public void redeem(UUID couponId, UUID parentId, UUID subscriptionId, long discountPaise) {
        if (couponId == null || redemptions.existsByCouponIdAndParentId(couponId, parentId)) {
            return;
        }
        coupons.findById(couponId).ifPresent(c -> {
            c.redeem();
            redemptions.save(new CouponRedemption(couponId, parentId, subscriptionId, discountPaise, clock.instant()));
            audit.record("coupon.redeemed", "Coupon", couponId, null,
                    java.util.Map.of("subscriptionId", subscriptionId, "discountPaise", discountPaise));
        });
    }

    private static void apply(Coupon c, CouponRequest r) {
        if (r.kind() == Coupon.Kind.PERCENT && (r.amount() < 1 || r.amount() > 100)) {
            throw Errors.badRequest("invalid_amount", "A percentage must be from 1 to 100.");
        }
        if (r.validFrom() != null && r.validTo() != null && r.validTo().isBefore(r.validFrom())) {
            throw Errors.badRequest("invalid_dates", "The end date must be on or after the start date.");
        }
        c.configure(r.description() == null || r.description().isBlank() ? null : r.description().trim(), r.kind(), r.amount(),
                r.maxDiscountPaise(), r.validFrom(), r.validTo(), r.maxRedemptions(),
                r.planIds() == null ? List.of() : r.planIds(), r.firstSubscriptionOnly(), r.active());
    }

    static String normalise(String code) {
        return code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
    }

    static CouponResponse toResponse(Coupon c) {
        return new CouponResponse(c.getId(), c.getCode(), c.getDescription(), c.getKind(), c.getAmount(), c.getMaxDiscountPaise(),
                c.getValidFrom(), c.getValidTo(), c.getMaxRedemptions(), c.getRedeemed(), List.copyOf(c.getPlanIds()),
                c.isFirstSubscriptionOnly(), c.isActive(), c.getCreatedAt());
    }
}
