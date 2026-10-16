package com.lunchbox.dispatch.web;

import com.lunchbox.common.idempotency.IdempotencyService;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.dispatch.PartnerDirectory;
import com.lunchbox.dispatch.PartnerOperationsService;
import com.lunchbox.dispatch.ShiftService;
import com.lunchbox.dispatch.calls.MaskedCallService;
import com.lunchbox.dispatch.web.DispatchDtos.CallResponse;
import com.lunchbox.dispatch.web.DispatchDtos.FailureRequest;
import com.lunchbox.dispatch.web.DispatchDtos.HandoverRequest;
import com.lunchbox.dispatch.web.DispatchDtos.IssueRequest;
import com.lunchbox.dispatch.web.DispatchDtos.LocationRequest;
import com.lunchbox.dispatch.web.DispatchDtos.PartnerMeResponse;
import com.lunchbox.dispatch.web.DispatchDtos.PickupConfirmRequest;
import com.lunchbox.dispatch.web.DispatchDtos.ShiftResponse;
import com.lunchbox.dispatch.web.DispatchDtos.TodayRouteResponse;
import com.lunchbox.dispatch.web.DispatchDtos.UploadUrlResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Partner app API. State-changing calls accept {@code Idempotency-Key} so the app's offline queue can safely replay
 * actions after reconnecting.
 */
@Tag(name = "Partner app")
@RestController
@RequestMapping("/api/v1/partner")
@PreAuthorize(Roles.PARTNER)
public class PartnerAppController {

    private final PartnerOperationsService operations;
    private final ShiftService shifts;
    private final PartnerDirectory partners;
    private final MaskedCallService calls;
    private final IdempotencyService idempotency;

    public PartnerAppController(PartnerOperationsService operations, ShiftService shifts, PartnerDirectory partners,
                                MaskedCallService calls, IdempotencyService idempotency) {
        this.operations = operations;
        this.shifts = shifts;
        this.partners = partners;
        this.calls = calls;
        this.idempotency = idempotency;
    }

    @GetMapping("/me")
    public PartnerMeResponse me(@AuthenticationPrincipal CurrentUser user) {
        return operations.me(user.requireUserId());
    }

    @PostMapping("/shift/start")
    public ShiftResponse startShift(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody LocationRequest request) {
        return shifts.start(partners.requireWorkingPartner(user.requireUserId()).id(), request.location());
    }

    @PostMapping("/shift/end")
    public ShiftResponse endShift(@AuthenticationPrincipal CurrentUser user) {
        return shifts.end(partners.requireWorkingPartner(user.requireUserId()).id());
    }

    @GetMapping("/route/today")
    public TodayRouteResponse today(@AuthenticationPrincipal CurrentUser user) {
        return operations.todayRoute(user.requireUserId());
    }

    @PostMapping("/route/start")
    public TodayRouteResponse startRoute(@AuthenticationPrincipal CurrentUser user) {
        return operations.startRoute(user.requireUserId());
    }

    @PostMapping("/stops/{stopId}/arrive")
    public TodayRouteResponse arrive(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID stopId,
                                     @Valid @RequestBody LocationRequest request) {
        return operations.arrive(user.requireUserId(), stopId, request.location());
    }

    @PostMapping("/orders/{orderId}/pickup")
    @Operation(summary = "Confirm pickup with the parent's OTP or by scanning their QR")
    public TodayRouteResponse pickup(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId,
                                     @RequestHeader(value = IdempotencyService.HEADER, required = false) String key,
                                     @Valid @RequestBody PickupConfirmRequest request) {
        return idempotency.execute(key, user.requireUserId(), "partner.pickup", Map.of("orderId", orderId, "req", request),
                TodayRouteResponse.class, () -> operations.confirmPickup(user.requireUserId(), orderId, request));
    }

    @PostMapping("/orders/{orderId}/pickup-failed")
    @Operation(summary = "Parent unavailable after the wait timer")
    public TodayRouteResponse pickupFailed(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId,
                                           @RequestHeader(value = IdempotencyService.HEADER, required = false) String key,
                                           @Valid @RequestBody FailureRequest request) {
        return idempotency.execute(key, user.requireUserId(), "partner.pickup_failed", Map.of("orderId", orderId, "req", request),
                TodayRouteResponse.class, () -> operations.pickupFailed(user.requireUserId(), orderId, request));
    }

    @PostMapping("/handover/upload-url")
    @Operation(summary = "Pre-signed S3 URL for the school handover photo (JPEG, ≤5 MB)")
    public UploadUrlResponse handoverUploadUrl(@AuthenticationPrincipal CurrentUser user) {
        var upload = operations.handoverPhotoUpload(user.requireUserId());
        return new UploadUrlResponse(upload.url(), upload.key(), upload.method(), upload.headers(), upload.expiresAt());
    }

    @PostMapping("/schools/{schoolId}/handover")
    @Operation(summary = "Hand over every lunchbox for this school (photo + GPS inside the school geofence)")
    public TodayRouteResponse handover(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID schoolId,
                                       @RequestHeader(value = IdempotencyService.HEADER, required = false) String key,
                                       @Valid @RequestBody HandoverRequest request) {
        return idempotency.execute(key, user.requireUserId(), "partner.handover", Map.of("schoolId", schoolId, "req", request),
                TodayRouteResponse.class, () -> operations.handover(user.requireUserId(), schoolId, request));
    }

    @PostMapping("/orders/{orderId}/delivery-failed")
    public TodayRouteResponse deliveryFailed(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId,
                                             @RequestHeader(value = IdempotencyService.HEADER, required = false) String key,
                                             @Valid @RequestBody FailureRequest request) {
        return idempotency.execute(key, user.requireUserId(), "partner.delivery_failed", Map.of("orderId", orderId, "req", request),
                TodayRouteResponse.class, () -> operations.deliveryFailed(user.requireUserId(), orderId, request));
    }

    @PostMapping("/orders/{orderId}/call")
    @Operation(summary = "Call the parent through a masked number")
    public CallResponse callParent(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId) {
        calls.partnerCallsParent(user.requireUserId(), orderId);
        return new CallResponse("RINGING", "Your phone will ring first; then we connect you to the parent.");
    }

    public record IssueCreatedResponse(UUID issueId) {
    }

    @PostMapping("/issues")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Report an issue or raise an SOS")
    public IssueCreatedResponse reportIssue(@AuthenticationPrincipal CurrentUser user,
                                            @RequestHeader(value = IdempotencyService.HEADER, required = false) String key,
                                            @Valid @RequestBody IssueRequest request) {
        return idempotency.execute(key, user.requireUserId(), "partner.issue", request, IssueCreatedResponse.class,
                () -> new IssueCreatedResponse(operations.reportIssue(user.requireUserId(), request)));
    }
}
