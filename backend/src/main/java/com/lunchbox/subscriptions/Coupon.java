package com.lunchbox.subscriptions;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** A discount code for plan payments. Money in paise; percent coupons can be capped. */
@Getter
@Entity
@Table(name = "coupons")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Coupon extends BaseEntity {

    public enum Kind { PERCENT, FLAT }

    @Column(nullable = false, unique = true, updatable = false)
    private String code;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Kind kind;

    /** Percent (1–100) or paise. */
    @Column(nullable = false)
    private long amount;

    @Column(name = "max_discount_paise")
    private Long maxDiscountPaise;

    @Column(name = "valid_from")
    private LocalDate validFrom;

    @Column(name = "valid_to")
    private LocalDate validTo;

    @Column(name = "max_redemptions")
    private Integer maxRedemptions;

    @Column(nullable = false)
    private int redeemed;

    /** Empty = every plan. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "plan_ids", nullable = false)
    private List<UUID> planIds = new ArrayList<>();

    @Column(name = "first_subscription_only", nullable = false)
    private boolean firstSubscriptionOnly;

    @Column(nullable = false)
    private boolean active = true;

    @Version
    private long version;

    Coupon(String code) {
        this.code = code;
    }

    void configure(String description, Kind kind, long amount, Long maxDiscountPaise, LocalDate validFrom, LocalDate validTo,
                   Integer maxRedemptions, List<UUID> planIds, boolean firstSubscriptionOnly, boolean active) {
        this.description = description;
        this.kind = kind;
        this.amount = amount;
        this.maxDiscountPaise = maxDiscountPaise;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.maxRedemptions = maxRedemptions;
        this.planIds = planIds == null ? new ArrayList<>() : new ArrayList<>(planIds);
        this.firstSubscriptionOnly = firstSubscriptionOnly;
        this.active = active;
    }

    void redeem() {
        this.redeemed++;
    }

    /** Discount on {@code pricePaise}; never more than the price minus ₹1 (Razorpay's minimum order). */
    long discountOn(long pricePaise) {
        long d = kind == Kind.PERCENT ? pricePaise * amount / 100 : amount;
        if (maxDiscountPaise != null) {
            d = Math.min(d, maxDiscountPaise);
        }
        return Math.max(0, Math.min(d, pricePaise - 100));
    }
}
