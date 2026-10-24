package com.lunchbox.orders;

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
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Getter
@Entity(name = "DeliveryOrder") // "Order" is a reserved word in JPQL
@Table(name = "orders")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Order extends BaseEntity {

    public enum Source { SUBSCRIPTION, MANUAL }

    @Column(name = "child_id", nullable = false, updatable = false)
    private UUID childId;

    @Column(name = "parent_id", nullable = false, updatable = false)
    private UUID parentId;

    @Column(name = "school_id", nullable = false, updatable = false)
    private UUID schoolId;

    @Column(name = "address_id", nullable = false, updatable = false)
    private UUID addressId;

    @Column(name = "subscription_id", updatable = false)
    private UUID subscriptionId;

    @Column(name = "scheduled_date", nullable = false, updatable = false)
    private LocalDate scheduledDate;

    @Column(name = "pickup_window_start", nullable = false)
    private Instant pickupWindowStart;

    @Column(name = "pickup_window_end", nullable = false)
    private Instant pickupWindowEnd;

    @Column(name = "delivery_deadline", nullable = false)
    private Instant deliveryDeadline;

    @Column(name = "pickup_location", nullable = false, updatable = false, columnDefinition = "geometry(Point,4326)")
    private Point pickupLocation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status;

    @Column(name = "partner_id")
    private UUID partnerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Source source;

    @Column(name = "cancel_reason")
    private String cancelReason;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "picked_up_at")
    private Instant pickedUpAt;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "school_received_at")
    private Instant schoolReceivedAt;

    @Column(name = "school_received_by")
    private UUID schoolReceivedBy;

    @Column(name = "rating_stars")
    private Integer ratingStars;

    @Column(name = "rating_comment")
    private String ratingComment;

    @Column(name = "rated_at")
    private Instant ratedAt;

    @Version
    private long version;

    static Order manual(UUID childId, UUID parentId, UUID schoolId, UUID addressId, UUID subscriptionId,
                        LocalDate date, Instant pickupStart, Instant pickupEnd, Instant deadline, Point pickupLocation) {
        Order o = new Order();
        o.childId = childId;
        o.parentId = parentId;
        o.schoolId = schoolId;
        o.addressId = addressId;
        o.subscriptionId = subscriptionId;
        o.scheduledDate = date;
        o.pickupWindowStart = pickupStart;
        o.pickupWindowEnd = pickupEnd;
        o.deliveryDeadline = deadline;
        o.pickupLocation = pickupLocation;
        o.status = OrderStatus.SCHEDULED;
        o.source = Source.MANUAL;
        return o;
    }

    /** Only {@link OrderTransitionService} calls this, after the state machine has approved the move. */
    void applyTransition(OrderStatus to, String reason, Instant at) {
        switch (to) {
            case CANCELLED -> cancelReason = reason;
            case PICKUP_FAILED, DELIVERY_FAILED -> failureReason = reason;
            case PICKED_UP -> pickedUpAt = at;
            case DELIVERED -> deliveredAt = at;
            case REASSIGNED -> partnerId = null;
            default -> {
            }
        }
        this.status = to;
    }

    void assignPartner(UUID partnerId) {
        this.partnerId = partnerId;
    }

    void confirmSchoolReceipt(UUID userId, Instant at) {
        this.schoolReceivedBy = userId;
        this.schoolReceivedAt = at;
    }

    void rate(int stars, String comment, Instant at) {
        this.ratingStars = stars;
        this.ratingComment = comment;
        this.ratedAt = at;
    }
}
