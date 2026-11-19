package com.lunchbox.tracking;

import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.dispatch.DeliveryPartner;
import com.lunchbox.orders.OrderStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class TrackingDtos {

    private TrackingDtos() {
    }

    /** One GPS fix from the partner app. */
    public record PingInput(
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double lat,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double lng,
            @Min(0) @Max(10000) Double accuracyM,
            @Min(0) @Max(100) Double speedMps,
            @Min(0) @Max(360) Double headingDeg,
            @Min(0) @Max(100) Integer batteryPct,
            @NotNull Instant recordedAt) {
    }

    public record PingBatchRequest(@NotEmpty @Size(max = 200) List<@Valid PingInput> pings) {
    }

    public record IngestResult(int accepted, int rejected, boolean tracking) {
    }

    /** Pushed to /topic/orders.{orderId}. */
    public record TrackingMessage(String type, UUID orderId, OrderStatus status, Double lat, Double lng, Double headingDeg,
                                  Double speedMps, Integer etaSeconds, Instant at) {
    }

    /** Pushed to /topic/admin.live. */
    public record LivePartnerMessage(UUID partnerId, double lat, double lng, Double headingDeg, Double speedMps,
                                     int activeOrders, Instant at) {
    }

    public record PartnerCard(String firstName, DeliveryPartner.VehicleType vehicleType, String vehicleNumber,
                              BigDecimal rating) {
    }

    public record LiveLocation(double lat, double lng, Double headingDeg, Double speedMps, Instant recordedAt) {
    }

    public record TrackingSnapshotResponse(
            UUID orderId,
            OrderStatus status,
            boolean liveTrackingEnabled,
            PartnerCard partner,
            LiveLocation location,
            Integer etaSeconds,
            String destinationType,
            GeoPoint destination,
            /* False when the order's plan does not include live tracking. */
            boolean includedInPlan) {
    }

    /** One rider on shift today, for the operations map. Phone is shown to staff only. */
    public record FleetPartnerResponse(UUID partnerId, String name, String phone, String vehicleType, String vehicleNumber,
                                       FleetService.Availability availability, String shiftStatus,
                                       Instant plannedStart, Instant plannedEnd, LiveLocation location,
                                       int openOrders, CurrentDelivery currentDelivery) {
    }

    public record CurrentDelivery(UUID orderId, com.lunchbox.orders.OrderStatus status, String schoolName,
                                  Instant deliveryDeadline) {
    }

    public record LivePartnerResponse(UUID partnerId, String name, double lat, double lng, Double headingDeg,
                                      Double speedMps, Instant recordedAt, int activeOrders) {
    }
}
