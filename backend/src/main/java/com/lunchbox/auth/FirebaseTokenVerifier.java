package com.lunchbox.auth;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;

@Component
public class FirebaseTokenVerifier implements TokenVerifier {

    private final FirebaseAuth firebaseAuth;

    public FirebaseTokenVerifier(FirebaseAuth firebaseAuth) {
        this.firebaseAuth = firebaseAuth;
    }

    @Override
    public VerifiedToken verify(String idToken) {
        try {
            FirebaseToken token = firebaseAuth.verifyIdToken(idToken);
            Map<String, Object> claims = token.getClaims();
            Object phone = claims.get("phone_number");
            Object role = claims.get("role");
            Object authTime = claims.get("auth_time");
            String secondFactor = null;
            if (claims.get("firebase") instanceof Map<?, ?> firebase) {
                Object sf = firebase.get("sign_in_second_factor");
                secondFactor = sf == null ? null : sf.toString();
            }
            return new VerifiedToken(
                    token.getUid(),
                    phone == null ? null : phone.toString(),
                    token.getEmail(),
                    token.isEmailVerified(),
                    role == null ? null : role.toString(),
                    authTime instanceof Number n ? Instant.ofEpochSecond(n.longValue()) : null,
                    secondFactor);
        } catch (FirebaseAuthException | IllegalArgumentException e) {
            throw new InvalidTokenException("Invalid Firebase ID token", e);
        }
    }
}
