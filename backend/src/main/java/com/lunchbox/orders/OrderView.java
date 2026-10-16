package com.lunchbox.orders;

import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Read model of an order shared with other modules (entities never leave the orders module). */
public record OrderView(
        UUID id,
        UUID childId,
        UUID parentId,
        UUID schoolId,
        UUID addressId,
        UUID subscriptionId,
        LocalDate scheduledDate,
        Instant pickupWindowStart,
        Instant pickupWindowEnd,
        Instant deliveryDeadline,
        Point pickupLocation,
        OrderStatus status,
        UUID partnerId,
        Instant pickedUpAt,
        Instant deliveredAt,
        String cancelReason,
        String failureReason,
        Instant schoolReceivedAt,
        long version) {

    static OrderView of(Order o) {
        return new OrderView(o.getId(), o.getChildId(), o.getParentId(), o.getSchoolId(), o.getAddressId(),
                o.getSubscriptionId(), o.getScheduledDate(), o.getPickupWindowStart(), o.getPickupWindowEnd(),
                o.getDeliveryDeadline(), o.getPickupLocation(), o.getStatus(), o.getPartnerId(), o.getPickedUpAt(),
                o.getDeliveredAt(), o.getCancelReason(), o.getFailureReason(), o.getSchoolReceivedAt(), o.getVersion());
    }
}
