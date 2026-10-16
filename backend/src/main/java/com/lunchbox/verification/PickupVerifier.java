package com.lunchbox.verification;

import com.lunchbox.common.geo.GeoPoint;

import java.util.UUID;

/** Public API: proves the partner is collecting the right lunchbox from the right household. */
public interface PickupVerifier {

    enum Method { OTP, QR }

    /**
     * Verifies and records the pickup proof. Throws a 4xx ApiException when the code is wrong, expired or attempts
     * are exhausted. Caller is responsible for authorising that the partner owns the order today.
     */
    void verifyPickup(UUID orderId, UUID partnerUserId, Method method, String code, GeoPoint at);
}
