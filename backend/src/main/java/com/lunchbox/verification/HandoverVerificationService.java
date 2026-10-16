package com.lunchbox.verification;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.persistence.UuidV7;
import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.common.storage.StorageService;
import com.lunchbox.common.storage.StorageService.Bucket;
import com.lunchbox.common.storage.StorageService.PresignedUpload;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import com.lunchbox.users.UserDirectory;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class HandoverVerificationService implements HandoverVerifier {

    static final long MAX_PHOTO_BYTES = 5L * 1024 * 1024;

    private final VerificationRepository verifications;
    private final SchoolDirectory schools;
    private final OrderQueries orders;
    private final UserDirectory users;
    private final StorageService storage;
    private final PlatformSettings settings;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meters;
    private final Clock clock;

    public HandoverVerificationService(VerificationRepository verifications, SchoolDirectory schools, OrderQueries orders,
                                       UserDirectory users, StorageService storage, PlatformSettings settings,
                                       ObjectMapper objectMapper, MeterRegistry meters, Clock clock) {
        this.verifications = verifications;
        this.schools = schools;
        this.orders = orders;
        this.users = users;
        this.storage = storage;
        this.settings = settings;
        this.objectMapper = objectMapper;
        this.meters = meters;
        this.clock = clock;
    }

    @Override
    public PresignedUpload presignHandoverPhoto(UUID partnerId, LocalDate date) {
        String key = keyPrefix(partnerId, date) + UuidV7.generate() + ".jpg";
        return storage.presignUpload(Bucket.HANDOVER, key, "image/jpeg", MAX_PHOTO_BYTES);
    }

    /** Own transaction so a rejected (outside-geofence) attempt stays recorded for anomaly review. */
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, noRollbackFor = ApiException.class)
    public void verifyHandover(UUID partnerId, UUID partnerUserId, UUID schoolId, List<UUID> orderIds, String photoKey,
                               GeoPoint at, LocalDate date) {
        if (photoKey == null || !photoKey.startsWith(keyPrefix(partnerId, date)) || photoKey.contains("..")) {
            throw Errors.badRequest("invalid_photo", "Upload the handover photo using the link provided by the app.");
        }
        StorageService.ObjectInfo photo = storage.head(Bucket.HANDOVER, photoKey)
                .orElseThrow(() -> Errors.unprocessable("photo_missing", "The handover photo has not finished uploading. Try again."));
        if (photo.sizeBytes() > MAX_PHOTO_BYTES || photo.sizeBytes() < 1_000) {
            throw Errors.unprocessable("invalid_photo", "The handover photo is not valid. Please retake it.");
        }
        SchoolInfo school = schools.require(schoolId);
        int radius = school.geofenceRadiusM() != null ? school.geofenceRadiusM() : settings.defaultSchoolGeofenceRadiusM();
        boolean inside = Geo.insideGeofence(school.geofence(), school.location(), radius, at.lat(), at.lng());
        int distance = (int) Math.round(Geo.haversineMeters(school.location().getY(), school.location().getX(), at.lat(), at.lng()));
        Instant now = clock.instant();
        var point = Geo.point(at);
        if (!inside) {
            meters.counter("lunchbox.anomaly.handover_outside_geofence").increment();
            for (UUID orderId : orderIds) {
                verifications.save(Verification.failed(orderId, Verification.Type.HANDOVER_PHOTO, partnerUserId, now,
                        point, distance, json(Map.of("reason", "outside_geofence", "photoKey", photoKey))));
            }
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "outside_geofence",
                    "You need to be at the school gate to hand over (you are about " + distance + " m away).");
        }
        for (UUID orderId : orderIds) {
            verifications.save(Verification.verified(orderId, Verification.Type.HANDOVER_PHOTO, partnerUserId, now, point,
                    distance, true, photoKey));
        }
        meters.counter("lunchbox.verification.handover").increment(orderIds.size());
    }

    /** Parent: a short-lived link to the handover photo of a delivered lunchbox. */
    @Transactional(readOnly = true)
    public String handoverPhotoUrl(UUID parentUserId, UUID orderId) {
        UUID parentId = users.requireParentId(parentUserId);
        OrderView order = orders.requireOwnedByParent(orderId, parentId);
        if (order.status() != OrderStatus.DELIVERED) {
            throw Errors.unprocessable("not_delivered", "The handover photo is available after delivery.");
        }
        Verification v = verifications.findFirstByOrderIdAndTypeAndStatusOrderByCreatedAtDesc(orderId,
                        Verification.Type.HANDOVER_PHOTO, Verification.Status.VERIFIED)
                .orElseThrow(() -> Errors.notFound("Handover photo"));
        return storage.presignDownload(Bucket.HANDOVER, v.getPhotoKey(), Duration.ofMinutes(5));
    }

    static String keyPrefix(UUID partnerId, LocalDate date) {
        return "handover/" + date + "/" + partnerId + "/";
    }

    private String json(Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
