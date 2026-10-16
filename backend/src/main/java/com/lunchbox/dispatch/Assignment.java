package com.lunchbox.dispatch;

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
import java.util.UUID;

@Getter
@Entity
@Table(name = "assignments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Assignment extends BaseEntity {

    public enum Status { ACTIVE, RELEASED }

    @Column(name = "order_id", nullable = false, updatable = false)
    private UUID orderId;

    @Column(name = "partner_id", nullable = false, updatable = false)
    private UUID partnerId;

    @Column(name = "route_id")
    private UUID routeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.ACTIVE;

    @Column(name = "assigned_by", updatable = false)
    private UUID assignedBy;

    @Column(name = "assigned_at", nullable = false, updatable = false)
    private Instant assignedAt;

    @Column(name = "released_at")
    private Instant releasedAt;

    @Column(name = "release_reason")
    private String releaseReason;

    @Version
    private long version;

    Assignment(UUID orderId, UUID partnerId, UUID assignedBy, Instant at) {
        this.orderId = orderId;
        this.partnerId = partnerId;
        this.assignedBy = assignedBy;
        this.assignedAt = at;
    }

    void attachRoute(UUID routeId) {
        this.routeId = routeId;
    }

    void release(String reason, Instant at) {
        this.status = Status.RELEASED;
        this.releaseReason = reason;
        this.releasedAt = at;
    }
}
