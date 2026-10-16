package com.lunchbox.notifications;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
@Table(name = "notifications")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification extends BaseEntity {

    public enum Channel { PUSH, SMS, IN_APP }

    public enum DeliveryStatus { PENDING, SENT, FAILED }

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(nullable = false, updatable = false)
    private String category;

    @Column(nullable = false, updatable = false)
    private String title;

    @Column(nullable = false, updatable = false)
    private String body;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(updatable = false)
    private String data;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Channel channel;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_status", nullable = false)
    private DeliveryStatus deliveryStatus = DeliveryStatus.PENDING;

    @Column(name = "read_at")
    private Instant readAt;

    Notification(UUID userId, String category, String title, String body, String data) {
        this.userId = userId;
        this.category = category;
        this.title = title;
        this.body = body;
        this.data = data;
        this.channel = Channel.IN_APP;
    }

    void delivered(Channel channel) {
        this.channel = channel;
        this.deliveryStatus = DeliveryStatus.SENT;
    }

    void failed() {
        this.deliveryStatus = DeliveryStatus.FAILED;
    }

    void markRead(Instant at) {
        if (readAt == null) {
            readAt = at;
        }
    }
}
