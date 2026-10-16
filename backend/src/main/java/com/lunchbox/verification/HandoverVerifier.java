package com.lunchbox.verification;

import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.storage.StorageService.PresignedUpload;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Public API: proves lunchboxes were handed over inside the school geofence, with a photo. */
public interface HandoverVerifier {

    PresignedUpload presignHandoverPhoto(UUID partnerId, LocalDate date);

    /** Records verified handovers for the orders, or throws if the photo is missing or the location is outside. */
    void verifyHandover(UUID partnerId, UUID partnerUserId, UUID schoolId, List<UUID> orderIds, String photoKey,
                        GeoPoint at, LocalDate date);
}
