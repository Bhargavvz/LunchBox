package com.lunchbox.dispatch.web;

import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.web.Validation;
import com.lunchbox.dispatch.DeliveryPartner;
import com.lunchbox.dispatch.KycDocument;
import com.lunchbox.dispatch.PartnerIssue;
import com.lunchbox.dispatch.PartnerShift;
import com.lunchbox.dispatch.Route;
import com.lunchbox.dispatch.RouteStop;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.verification.PickupVerifier;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public final class DispatchDtos {

    private DispatchDtos() {
    }

    // ---- Admin: partners ----

    public record CreatePartnerRequest(
            @NotBlank @Pattern(regexp = Validation.INDIAN_MOBILE) String phone,
            @Valid @NotNull PartnerProfileRequest profile) {
    }

    public record PartnerProfileRequest(
            @NotBlank @Pattern(regexp = Validation.PERSON_NAME) String firstName,
            @Pattern(regexp = Validation.PERSON_NAME) String lastName,
            @NotNull DeliveryPartner.VehicleType vehicleType,
            @Pattern(regexp = Validation.VEHICLE_NUMBER) String vehicleNumber,
            @Min(1) @Max(40) int capacity,
            @NotNull @Valid GeoPoint homeZone,
            @Min(500) @Max(30000) int serviceRadiusM) {
    }

    public record AdminPartnerResponse(
            UUID id,
            UUID userId,
            String firstName,
            String lastName,
            String phone,
            DeliveryPartner.VehicleType vehicleType,
            String vehicleNumber,
            int capacity,
            GeoPoint homeZone,
            int serviceRadiusM,
            DeliveryPartner.KycStatus kycStatus,
            String kycNotes,
            BigDecimal rating,
            int ratingCount,
            boolean active,
            boolean payoutAccountLinked,
            Instant createdAt) {
    }

    public record BankAccountRequest(
            @NotBlank @Size(max = 120) String accountHolder,
            @NotBlank @Pattern(regexp = "^\\d{9,18}$") String accountNumber,
            @NotBlank @Pattern(regexp = Validation.IFSC) String ifsc) {
    }

    public record UploadUrlRequest(@NotNull KycDocument.DocType docType,
                                   @NotBlank @Pattern(regexp = "^(image/jpeg|image/png|application/pdf)$") String contentType) {
    }

    public record UploadUrlResponse(String url, String key, String method, java.util.Map<String, String> headers,
                                    Instant expiresAt) {
    }

    public record KycDocumentRequest(
            @NotNull KycDocument.DocType docType,
            @NotBlank @Size(max = 300) String s3Key,
            @Size(max = 40) @Pattern(regexp = "^[A-Za-z0-9 -]*$") String documentNumber,
            @Past LocalDate dateOfBirth) {
    }

    public record KycDocumentResponse(UUID id, KycDocument.DocType docType, KycDocument.Status status,
                                      String documentNumberMasked, String viewUrl, Instant createdAt) {
    }

    public record KycDecisionRequest(boolean approved, @Size(max = 500) String notes) {
    }

    public record ShiftRequest(@NotNull LocalDate date, @NotNull LocalTime plannedStart, @NotNull LocalTime plannedEnd) {
    }

    public record ShiftResponse(UUID id, UUID partnerId, LocalDate date, Instant plannedStart, Instant plannedEnd,
                                Instant startedAt, Instant endedAt, PartnerShift.Status status) {
    }

    public record AssignRequest(@NotNull UUID partnerId, @Size(max = 300) String reason) {
    }

    public record AutoAssignResult(LocalDate date, int considered, int assigned, int unassigned, int routesPlanned) {
    }

    public record AdminRouteResponse(UUID routeId, UUID partnerId, String partnerName, LocalDate date, Route.Status status,
                                     String optimizer, int totalDistanceM, int totalDurationS, List<AdminStopResponse> stops) {
    }

    public record AdminStopResponse(UUID stopId, int sequence, RouteStop.Type type, RouteStop.Status status, UUID orderId,
                                    UUID schoolId, GeoPoint location, Instant plannedEta, Instant arrivedAt,
                                    Instant completedAt) {
    }

    public record IssueResponse(UUID id, UUID partnerId, String partnerName, UUID orderId, PartnerIssue.Type type,
                                String description, GeoPoint location, PartnerIssue.Status status, Instant createdAt,
                                Instant resolvedAt, String resolutionNote) {
    }

    public record ResolveIssueRequest(@NotBlank @Size(max = 500) String note) {
    }

    // ---- Partner app ----

    public record PartnerMeResponse(UUID partnerId, String firstName, String lastName, DeliveryPartner.VehicleType vehicleType,
                                    String vehicleNumber, int capacity, BigDecimal rating, ShiftResponse todayShift) {
    }

    public record LocationRequest(@NotNull @Valid GeoPoint location) {
    }

    public record PickupStopDetails(
            UUID orderId,
            OrderStatus orderStatus,
            String parentFirstName,
            String maskedPhone,
            String address,
            String landmark,
            String instructions,
            String childFirstName,
            String className,
            Instant pickupWindowStart,
            Instant pickupWindowEnd) {
    }

    public record DropStopDetails(
            UUID schoolId,
            String schoolName,
            String address,
            String handoverInstructions,
            Instant deadline,
            List<UUID> orderIds) {
    }

    public record StopView(
            UUID stopId,
            int sequence,
            RouteStop.Type type,
            RouteStop.Status status,
            GeoPoint location,
            Instant plannedEta,
            Instant arrivedAt,
            Instant completedAt,
            PickupStopDetails pickup,
            DropStopDetails drop) {
    }

    public record TodayRouteResponse(UUID routeId, LocalDate date, Route.Status status, int totalDistanceM,
                                     int totalDurationS, List<StopView> stops) {
    }

    public record PickupConfirmRequest(@NotNull PickupVerifier.Method method,
                                       @NotBlank @Size(max = 200) String code,
                                       @NotNull @Valid GeoPoint location) {
    }

    public record FailureRequest(@NotBlank @Size(max = 300) String reason, @Valid GeoPoint location) {
    }

    public record HandoverRequest(@NotBlank @Size(max = 300) String photoKey, @NotNull @Valid GeoPoint location) {
    }

    public record IssueRequest(@NotNull PartnerIssue.Type type, @Size(max = 1000) String description, UUID orderId,
                               @Valid GeoPoint location) {
    }

    public record CallResponse(String status, String message) {
    }
}
