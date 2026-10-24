package com.lunchbox.orders;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Domain events published by the orders module through the transactional outbox. */
public final class OrderEvents {

    private OrderEvents() {
    }

    /** Routing key {@code order.status_changed}. */
    public record OrderStatusChanged(
            UUID orderId,
            UUID parentId,
            UUID childId,
            UUID schoolId,
            UUID partnerId,
            LocalDate scheduledDate,
            OrderStatus from,
            OrderStatus to,
            String reason,
            Instant deliveryDeadline,
            Instant occurredAt) {
    }

    /** Routing key {@code rating.submitted}: a parent rated a delivered order. */
    public record OrderRated(UUID orderId, UUID partnerId, int stars, Instant occurredAt) {
    }
}
