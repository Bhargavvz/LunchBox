package com.lunchbox.verification;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "verifications")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Verification extends BaseEntity {

    public enum Type { PICKUP_OTP, PICKUP_QR, HANDOVER_PHOTO }

    public enum Status { PENDING, VERIFIED, FAILED, EXPIRED }

    @Column(name = "order_id", nullable = false, updatable = false)
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "verification_type", nullable = false, updatable = false)
    private Type type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    /** OTP encrypted with PiiCipher (the parent must be able to view it again). */
    @Column(name = "code_ciphertext", columnDefinition = "text")
    private String codeCiphertext;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    @Column(name = "verified_by")
    private UUID verifiedBy;

    @Column(name = "photo_key")
    private String photoKey;

    @Column(columnDefinition = "geometry(Point,4326)")
    private Point location;

    @Column(name = "inside_geofence")
    private Boolean insideGeofence;

    @Column(name = "distance_to_target_m")
    private Integer distanceToTargetM;

    @JdbcTypeCode(SqlTypes.JSON)
    private String metadata;

    static Verification pendingOtp(UUID orderId, String ciphertext, Instant expiresAt) {
        Verification v = new Verification();
        v.orderId = orderId;
        v.type = Type.PICKUP_OTP;
        v.status = Status.PENDING;
        v.codeCiphertext = ciphertext;
        v.expiresAt = expiresAt;
        return v;
    }

    static Verification verified(UUID orderId, Type type, UUID by, Instant at, Point location, Integer distanceM,
                                 Boolean insideGeofence, String photoKey) {
        Verification v = new Verification();
        v.orderId = orderId;
        v.type = type;
        v.status = Status.VERIFIED;
        v.verifiedBy = by;
        v.verifiedAt = at;
        v.location = location;
        v.distanceToTargetM = distanceM;
        v.insideGeofence = insideGeofence;
        v.photoKey = photoKey;
        return v;
    }

    static Verification failed(UUID orderId, Type type, UUID by, Instant at, Point location, Integer distanceM,
                               String metadataJson) {
        Verification v = verified(orderId, type, by, at, location, distanceM, false, null);
        v.status = Status.FAILED;
        v.verifiedAt = null;
        v.metadata = metadataJson;
        return v;
    }

    int recordAttempt() {
        return ++attempts;
    }

    void markVerified(UUID by, Instant at, Point location) {
        this.status = Status.VERIFIED;
        this.verifiedBy = by;
        this.verifiedAt = at;
        this.location = location;
    }

    void lock() {
        this.status = Status.FAILED;
    }

    void expire() {
        if (status == Status.PENDING) {
            this.status = Status.EXPIRED;
        }
    }
}
