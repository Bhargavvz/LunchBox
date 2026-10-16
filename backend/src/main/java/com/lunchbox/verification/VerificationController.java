package com.lunchbox.verification;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.verification.PickupVerificationService.PickupCodeResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@Tag(name = "Verification")
@RestController
@PreAuthorize(Roles.PARENT)
public class VerificationController {

    private final PickupVerificationService pickup;
    private final HandoverVerificationService handover;

    public VerificationController(PickupVerificationService pickup, HandoverVerificationService handover) {
        this.pickup = pickup;
        this.handover = handover;
    }

    public record PhotoUrlResponse(String url) {
    }

    @GetMapping("/api/v1/orders/{orderId}/pickup-code")
    @Operation(summary = "Today's 6-digit pickup OTP and a signed QR (refresh the QR before qrExpiresAt)")
    public PickupCodeResponse pickupCode(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId) {
        return pickup.pickupCode(user.requireUserId(), orderId);
    }

    @GetMapping("/api/v1/orders/{orderId}/handover-photo")
    @Operation(summary = "Short-lived URL of the school handover photo")
    public PhotoUrlResponse handoverPhoto(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId) {
        return new PhotoUrlResponse(handover.handoverPhotoUrl(user.requireUserId(), orderId));
    }
}
