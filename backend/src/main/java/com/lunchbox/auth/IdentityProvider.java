package com.lunchbox.auth;

import com.lunchbox.common.security.Role;

import java.util.Optional;
import java.util.UUID;

/** Operations on the identity provider (Firebase Auth). */
public interface IdentityProvider {

    /** Writes the LunchBox role and user id into the user's custom claims. Clients must refresh their ID token. */
    void setClaims(String firebaseUid, Role role, UUID userId, UUID schoolId);

    void clearClaims(String firebaseUid);

    /** Revokes refresh tokens so the user is signed out everywhere within the ID-token lifetime. */
    void revokeSessions(String firebaseUid);

    void deleteUser(String firebaseUid);

    Optional<IdpUser> findByEmail(String email);

    record IdpUser(String uid, String email, boolean emailVerified) {
    }
}
