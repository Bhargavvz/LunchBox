package com.lunchbox.orders;

import com.lunchbox.common.persistence.UuidV7Id;
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

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "order_status_history")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderStatusHistory {

    @Id
    @UuidV7Id
    private UUID id;

    @Column(name = "order_id", nullable = false, updatable = false)
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", updatable = false)
    private OrderStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, updatable = false)
    private OrderStatus toStatus;

    @Column(name = "actor_user_id", updatable = false)
    private UUID actorUserId;

    @Column(name = "actor_role", updatable = false)
    private String actorRole;

    @Column(updatable = false)
    private String reason;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(updatable = false)
    private String metadata;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    OrderStatusHistory(UUID orderId, OrderStatus from, OrderStatus to, UUID actorUserId, String actorRole, String reason,
                       String metadata, Instant occurredAt) {
        this.orderId = orderId;
        this.fromStatus = from;
        this.toStatus = to;
        this.actorUserId = actorUserId;
        this.actorRole = actorRole;
        this.reason = reason;
        this.metadata = metadata;
        this.occurredAt = occurredAt;
    }
}
