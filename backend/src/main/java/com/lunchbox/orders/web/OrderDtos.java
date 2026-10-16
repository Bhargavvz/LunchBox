package com.lunchbox.orders.web;

import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.orders.OrderStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class OrderDtos {

    private OrderDtos() {
    }

    public record StatusEventResponse(OrderStatus status, Instant occurredAt, String reason) {
    }

    public record OrderResponse(
            UUID id,
            UUID childId,
            String childName,
            UUID schoolId,
            String schoolName,
            LocalDate scheduledDate,
            Instant pickupWindowStart,
            Instant pickupWindowEnd,
            Instant deliveryDeadline,
            OrderStatus status,
            boolean partnerAssigned,
            Instant pickedUpAt,
            Instant deliveredAt,
            String cancelReason,
            String failureReason,
            Instant schoolReceivedAt) {
    }

    public record OrderDetailResponse(OrderResponse order, List<StatusEventResponse> timeline) {
    }

    public record AdminOrderResponse(
            UUID id,
            LocalDate scheduledDate,
            OrderStatus status,
            UUID childId,
            String childName,
            String className,
            UUID parentId,
            UUID schoolId,
            String schoolName,
            UUID partnerId,
            UUID addressId,
            GeoPoint pickupLocation,
            Instant pickupWindowStart,
            Instant pickupWindowEnd,
            Instant deliveryDeadline,
            Instant pickedUpAt,
            Instant deliveredAt,
            String cancelReason,
            String failureReason,
            long version) {
    }

    public record AdminOrderDetailResponse(AdminOrderResponse order, List<StatusEventResponse> timeline) {
    }

    public record CreateManualOrderRequest(@NotNull UUID childId, @NotNull UUID addressId, @NotNull LocalDate date) {
    }

    public record ReasonRequest(@NotBlank @Size(max = 300) String reason) {
    }

    /** What a school admin sees: no addresses or parent details. */
    public record SchoolOrderResponse(UUID id, String childName, String className, String section, OrderStatus status,
                                      Instant deliveredAt, Instant schoolReceivedAt) {
    }
}
