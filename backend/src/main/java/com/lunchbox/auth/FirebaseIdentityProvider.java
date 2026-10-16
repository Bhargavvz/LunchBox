package com.lunchbox.auth;

import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import com.lunchbox.common.integration.RetryableIntegrationException;
import com.lunchbox.common.security.Role;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Component
public class FirebaseIdentityProvider implements IdentityProvider {

    private final FirebaseAuth firebaseAuth;

    public FirebaseIdentityProvider(FirebaseAuth firebaseAuth) {
        this.firebaseAuth = firebaseAuth;
    }

    @Override
    public void setClaims(String firebaseUid, Role role, UUID userId, UUID schoolId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", role.name());
        claims.put("lbUid", userId.toString());
        if (schoolId != null) {
            claims.put("schoolId", schoolId.toString());
        }
        call(() -> firebaseAuth.setCustomUserClaims(firebaseUid, claims));
    }

    @Override
    public void clearClaims(String firebaseUid) {
        call(() -> firebaseAuth.setCustomUserClaims(firebaseUid, Map.of()));
    }

    @Override
    public void revokeSessions(String firebaseUid) {
        call(() -> firebaseAuth.revokeRefreshTokens(firebaseUid));
    }

    @Override
    public void deleteUser(String firebaseUid) {
        try {
            firebaseAuth.deleteUser(firebaseUid);
        } catch (FirebaseAuthException e) {
            if (e.getAuthErrorCode() != AuthErrorCode.USER_NOT_FOUND) {
                throw new RetryableIntegrationException("Firebase deleteUser failed", e);
            }
        }
    }

    @Override
    public Optional<IdpUser> findByEmail(String email) {
        try {
            UserRecord record = firebaseAuth.getUserByEmail(email);
            return Optional.of(new IdpUser(record.getUid(), record.getEmail(), record.isEmailVerified()));
        } catch (FirebaseAuthException e) {
            if (e.getAuthErrorCode() == AuthErrorCode.USER_NOT_FOUND) {
                return Optional.empty();
            }
            throw new RetryableIntegrationException("Firebase lookup failed", e);
        }
    }

    private interface FirebaseCall {
        void run() throws FirebaseAuthException;
    }

    private static void call(FirebaseCall c) {
        try {
            c.run();
        } catch (FirebaseAuthException e) {
            throw new RetryableIntegrationException("Firebase call failed: " + e.getAuthErrorCode(), e);
        }
    }
}
