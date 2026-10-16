package com.lunchbox.subscriptions;

import com.lunchbox.common.persistence.BaseEntity;
import com.lunchbox.common.persistence.DaysOfWeekConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

@Getter
@Entity
@Table(name = "subscriptions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Subscription extends BaseEntity {

    public enum Status { PENDING_PAYMENT, ACTIVE, PAUSED, HALTED, CANCELLED, EXPIRED }

    public static final Set<Status> LIVE = EnumSet.of(Status.PENDING_PAYMENT, Status.ACTIVE, Status.PAUSED, Status.HALTED);

    @Column(name = "parent_id", nullable = false, updatable = false)
    private UUID parentId;

    @Column(name = "child_id", nullable = false, updatable = false)
    private UUID childId;

    @Column(name = "plan_id", nullable = false, updatable = false)
    private UUID planId;

    @Column(name = "address_id", nullable = false)
    private UUID addressId;

    @Convert(converter = DaysOfWeekConverter.class)
    @Column(name = "days_of_week", nullable = false)
    private Set<DayOfWeek> daysOfWeek;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "razorpay_subscription_id")
    private String razorpaySubscriptionId;

    @Column(name = "checkout_short_url")
    private String checkoutShortUrl;

    @Column(name = "current_period_end")
    private Instant currentPeriodEnd;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancel_reason")
    private String cancelReason;

    @Version
    private long version;

    Subscription(UUID parentId, UUID childId, UUID planId, UUID addressId, Set<DayOfWeek> daysOfWeek, LocalDate startDate) {
        this.parentId = parentId;
        this.childId = childId;
        this.planId = planId;
        this.addressId = addressId;
        this.daysOfWeek = EnumSet.copyOf(daysOfWeek);
        this.startDate = startDate;
        this.status = Status.PENDING_PAYMENT;
    }

    void linkProvider(String providerSubscriptionId, String shortUrl) {
        this.razorpaySubscriptionId = providerSubscriptionId;
        this.checkoutShortUrl = shortUrl;
    }

    void activate(Instant periodEnd) {
        if (status == Status.PENDING_PAYMENT || status == Status.HALTED || status == Status.PAUSED || status == Status.ACTIVE) {
            this.status = Status.ACTIVE;
        }
        if (periodEnd != null) {
            this.currentPeriodEnd = periodEnd;
        }
    }

    void halt() {
        if (status == Status.ACTIVE || status == Status.PENDING_PAYMENT) {
            this.status = Status.HALTED;
        }
    }

    void cancel(String reason, Instant at) {
        this.status = Status.CANCELLED;
        this.cancelReason = reason;
        this.cancelledAt = at;
    }

    void expire(LocalDate endDate) {
        this.status = Status.EXPIRED;
        this.endDate = endDate;
    }

    void changeSchedule(UUID addressId, Set<DayOfWeek> days) {
        this.addressId = addressId;
        this.daysOfWeek = EnumSet.copyOf(days);
    }

    public boolean isLive() {
        return LIVE.contains(status);
    }
}
