package com.lunchbox.tracking;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.LunchBoxAuthentication;
import com.lunchbox.common.security.Roles;
import com.lunchbox.tracking.TrackingDtos.IngestResult;
import com.lunchbox.tracking.TrackingDtos.LivePartnerResponse;
import com.lunchbox.tracking.TrackingDtos.PingBatchRequest;
import com.lunchbox.tracking.TrackingDtos.PingInput;
import com.lunchbox.tracking.TrackingDtos.TrackingSnapshotResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

@Slf4j
@Tag(name = "Tracking")
@RestController
@Validated
public class TrackingController {

    private final TrackingService tracking;

    public TrackingController(TrackingService tracking) {
        this.tracking = tracking;
    }

    /** STOMP: partner app sends single fixes to /app/partner.location while the socket is up. */
    @MessageMapping("partner.location")
    public void stompLocation(@Payload @Valid PingInput ping, Principal principal) {
        if (principal instanceof LunchBoxAuthentication auth && auth.getPrincipal().userId() != null) {
            try {
                tracking.ingest(auth.getPrincipal().userId(), List.of(ping));
            } catch (RuntimeException e) {
                log.debug("Dropped STOMP ping: {}", e.getMessage());
            }
        }
    }

    @PostMapping("/api/v1/partner/locations")
    @PreAuthorize(Roles.PARTNER)
    @Operation(summary = "Batch of location fixes (background task / reconnect flush)")
    public IngestResult batch(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody PingBatchRequest request) {
        return tracking.ingest(user.requireUserId(), request.pings());
    }

    @GetMapping("/api/v1/orders/{orderId}/tracking")
    @PreAuthorize(Roles.PARENT)
    @Operation(summary = "Current tracking snapshot; subscribe to /topic/orders.{orderId} for live updates")
    public TrackingSnapshotResponse snapshot(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId) {
        return tracking.snapshot(user.requireUserId(), orderId);
    }

    @GetMapping("/api/v1/admin/tracking/live")
    @PreAuthorize(Roles.ADMIN_READ)
    public List<LivePartnerResponse> live() {
        return tracking.livePartners();
    }

    @GetMapping("/api/v1/admin/tracking/nearby")
    @PreAuthorize(Roles.ADMIN_READ)
    public List<LivePartnerResponse> nearby(@RequestParam double lat, @RequestParam double lng,
                                            @RequestParam(defaultValue = "3000") double radiusM) {
        return tracking.nearby(lat, lng, radiusM);
    }
}
