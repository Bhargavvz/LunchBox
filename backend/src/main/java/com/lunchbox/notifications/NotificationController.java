package com.lunchbox.notifications;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.notifications.BroadcastService.BroadcastRequest;
import com.lunchbox.notifications.BroadcastService.BroadcastResponse;
import com.lunchbox.notifications.NotificationService.NotificationResponse;
import com.lunchbox.notifications.NotificationService.RegisterDeviceRequest;
import com.lunchbox.notifications.NotificationService.UnreadCountResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@Tag(name = "Notifications")
@RestController
public class NotificationController {

    private final NotificationService notifications;
    private final BroadcastService broadcasts;

    public NotificationController(NotificationService notifications, BroadcastService broadcasts) {
        this.notifications = notifications;
        this.broadcasts = broadcasts;
    }

    @GetMapping("/api/v1/notifications")
    @PreAuthorize(Roles.REGISTERED)
    public PageResponse<NotificationResponse> list(@AuthenticationPrincipal CurrentUser user,
                                                   @RequestParam(required = false) Integer page,
                                                   @RequestParam(required = false) Integer size) {
        return notifications.list(user.requireUserId(), page, size);
    }

    @GetMapping("/api/v1/notifications/unread-count")
    @PreAuthorize(Roles.REGISTERED)
    public UnreadCountResponse unread(@AuthenticationPrincipal CurrentUser user) {
        return notifications.unread(user.requireUserId());
    }

    @PostMapping("/api/v1/notifications/{notificationId}/read")
    @PreAuthorize(Roles.REGISTERED)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID notificationId) {
        notifications.markRead(user.requireUserId(), notificationId);
    }

    @PostMapping("/api/v1/notifications/read-all")
    @PreAuthorize(Roles.REGISTERED)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markAllRead(@AuthenticationPrincipal CurrentUser user) {
        notifications.markAllRead(user.requireUserId());
    }

    @PostMapping("/api/v1/devices")
    @PreAuthorize(Roles.REGISTERED)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void registerDevice(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody RegisterDeviceRequest request) {
        notifications.registerDevice(user.requireUserId(), request);
    }

    @DeleteMapping("/api/v1/devices/{token}")
    @PreAuthorize(Roles.REGISTERED)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unregisterDevice(@AuthenticationPrincipal CurrentUser user, @PathVariable String token) {
        notifications.unregisterDevice(user.requireUserId(), token);
    }

    @GetMapping("/api/v1/admin/broadcasts")
    @PreAuthorize(Roles.ADMIN_READ)
    public List<BroadcastResponse> broadcasts() {
        return broadcasts.recent();
    }

    @PostMapping("/api/v1/admin/broadcasts")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public BroadcastResponse broadcast(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody BroadcastRequest request) {
        return broadcasts.create(request, user);
    }
}
