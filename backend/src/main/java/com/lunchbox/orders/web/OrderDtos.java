package com.lunchbox.orders.web;

import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.orders.OrderStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class OrderDtos {

    /** What happens on a day of a child's calendar. */
    public enum DayState {
        /** An order exists for the day; see its status. */
        ORDER,
        /** A pickup will be scheduled (the order is created after the cut-off the evening before). */
        PICKUP,
        LEAVE,
        HOLIDAY,
        /** The school does not work on this weekday. */
        NO_SCHOOL,
        /** The child has no plan. */
        NO_PLAN,
        BEFORE_START,
        PLAN_ENDED,
        /** A school day the plan does not cover. */
        NOT_A_PLAN_DAY,
        /** Covered by the plan but not paid for yet (renew or finish the payment). */
        RENEW_TO_CONTINUE
    }

    /** {@code editable}: the parent can still mark or remove leave for this day. */
    public record CalendarDay(LocalDate date, DayState state, UUID orderId, OrderStatus orderStatus, String note,
                              boolean editable) {
    }

    public record ChildCalendarResponse(UUID childId, UUID schoolId, String schoolName, LocalDate firstBookableDate,
                                        java.time.LocalTime pickupWindowStart, java.time.LocalTime pickupWindowEnd,
                                        java.time.LocalTime deliveryDeadline, java.util.Set<java.time.DayOfWeek> schoolDays,
                                        String planName, String planStatus, java.util.Set<java.time.DayOfWeek> planDays,
                                        List<CalendarDay> days) {
    }

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
            Instant schoolReceivedAt,
            Integer ratingStars,
            String ratingComment,
            boolean canRate,
            String boxCode) {
    }

    public record RateOrderRequest(@NotNull @Min(1) @Max(5) Integer stars, @Size(max = 500) String comment) {
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
