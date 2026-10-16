package com.lunchbox.auth;

import java.time.Instant;

/** The facts we rely on from a verified Firebase ID token. */
public record VerifiedToken(
        String uid,
        String phone,
        String email,
        boolean emailVerified,
        String claimedRole,
        Instant authTime,
        String secondFactor) {

    public boolean hasSecondFactor() {
        return secondFactor != null && !secondFactor.isBlank();
    }
}
