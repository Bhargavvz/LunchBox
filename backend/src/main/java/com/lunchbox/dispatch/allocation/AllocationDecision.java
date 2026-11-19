package com.lunchbox.dispatch.allocation;

import com.lunchbox.common.persistence.UuidV7;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Who got an order and why, or why nobody did. Append-only. */
@Getter
@Entity
@Table(name = "allocation_decisions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AllocationDecision {

    public enum Outcome { ASSIGNED, UNASSIGNED, CONFLICT, MANUAL, DECLINED, RELEASED }

    @Id
    private UUID id;

    @Column(name = "run_id")
    private UUID runId;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Column(name = "partner_id")
    private UUID partnerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Outcome outcome;

    @Column(name = "reason_code")
    private String reasonCode;

    @Column(nullable = false)
    private String reason;

    @JdbcTypeCode(SqlTypes.JSON)
    private String breakdown;

    @Column(name = "eligible_riders")
    private Integer eligibleRiders;

    @Column(name = "runner_up_partner_id")
    private UUID runnerUpPartnerId;

    @Column(name = "runner_up_cost")
    private BigDecimal runnerUpCost;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    AllocationDecision(UUID runId, UUID orderId, UUID partnerId, Outcome outcome, String reasonCode, String reason,
                       String breakdown, Integer eligibleRiders, UUID runnerUpPartnerId, Double runnerUpCost,
                       UUID actorUserId, Instant createdAt) {
        this.id = UuidV7.generate();
        this.runId = runId;
        this.orderId = orderId;
        this.partnerId = partnerId;
        this.outcome = outcome;
        this.reasonCode = reasonCode;
        this.reason = reason.length() > 500 ? reason.substring(0, 500) : reason;
        this.breakdown = breakdown;
        this.eligibleRiders = eligibleRiders;
        this.runnerUpPartnerId = runnerUpPartnerId;
        this.runnerUpCost = runnerUpCost == null ? null : BigDecimal.valueOf(runnerUpCost);
        this.actorUserId = actorUserId;
        this.createdAt = createdAt;
    }
}
