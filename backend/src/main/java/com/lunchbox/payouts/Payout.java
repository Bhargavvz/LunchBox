package com.lunchbox.payouts;

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

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Getter
@Entity
@Table(name = "payouts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Payout extends BaseEntity {

    public enum Status { PENDING, PROCESSING, PROCESSED, FAILED, REVERSED }

    @Column(name = "partner_id", nullable = false, updatable = false)
    private UUID partnerId;

    @Column(name = "period_start", nullable = false, updatable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false, updatable = false)
    private LocalDate periodEnd;

    @Column(name = "amount_paise", nullable = false, updatable = false)
    private long amountPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Column(name = "provider_payout_id")
    private String providerPayoutId;

    private String utr;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "processed_at")
    private Instant processedAt;

    @Version
    private long version;

    Payout(UUID partnerId, LocalDate periodStart, LocalDate periodEnd, long amountPaise) {
        this.partnerId = partnerId;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
        this.amountPaise = amountPaise;
    }

    void submitted(String providerPayoutId) {
        this.providerPayoutId = providerPayoutId;
        if (status == Status.PENDING) {
            status = Status.PROCESSING;
        }
    }

    boolean processed(String utr, Instant at) {
        if (status == Status.PROCESSED) {
            return false;
        }
        this.status = Status.PROCESSED;
        this.utr = utr;
        this.processedAt = at;
        return true;
    }

    /** @return true if this call moved the payout into a failed state (ledger must be credited back once). */
    boolean failed(Status target, String reason) {
        if (status == Status.FAILED || status == Status.REVERSED) {
            return false;
        }
        this.status = target;
        this.failureReason = reason;
        return true;
    }
}
