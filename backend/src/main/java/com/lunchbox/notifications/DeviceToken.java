package com.lunchbox.notifications;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "device_tokens")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DeviceToken extends BaseEntity {

    public enum Platform { ANDROID, IOS, WEB }

    public enum App { PARENT, PARTNER, ADMIN }

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, unique = true)
    private String token;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Platform platform;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private App app;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    DeviceToken(UUID userId, String token, Platform platform, App app, Instant at) {
        this.userId = userId;
        this.token = token;
        this.platform = platform;
        this.app = app;
        this.lastSeenAt = at;
    }

    /** A token moves with the device: re-registering under another user (shared phone) re-binds it. */
    void rebind(UUID userId, Platform platform, App app, Instant at) {
        this.userId = userId;
        this.platform = platform;
        this.app = app;
        this.lastSeenAt = at;
    }
}
