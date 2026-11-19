package com.lunchbox.subscriptions;

import com.lunchbox.common.persistence.UuidV7;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "coupon_redemptions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CouponRedemption {

    @Id
    private UUID id;

    @Column(name = "coupon_id", nullable = false)
    private UUID couponId;

    @Column(name = "parent_id", nullable = false)
    private UUID parentId;

    @Column(name = "subscription_id", nullable = false)
    private UUID subscriptionId;

    @Column(name = "discount_paise", nullable = false)
    private long discountPaise;

    @Column(name = "redeemed_at", nullable = false)
    private Instant redeemedAt;

    CouponRedemption(UUID couponId, UUID parentId, UUID subscriptionId, long discountPaise, Instant at) {
        this.id = UuidV7.generate();
        this.couponId = couponId;
        this.parentId = parentId;
        this.subscriptionId = subscriptionId;
        this.discountPaise = discountPaise;
        this.redeemedAt = at;
    }
}
