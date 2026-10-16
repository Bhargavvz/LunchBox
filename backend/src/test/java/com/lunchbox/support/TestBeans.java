package com.lunchbox.support;

import com.lunchbox.auth.IdentityProvider;
import com.lunchbox.auth.TokenVerifier;
import com.lunchbox.auth.VerifiedToken;
import com.lunchbox.common.security.Role;
import com.lunchbox.common.storage.StorageService;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Test doubles for the edges we cannot run in a container: Firebase (token verification + admin API) and S3.
 * Tokens have the form {@code test:<uid>:<phone|->:<email|->:<mfa 0|1>}.
 */
@TestConfiguration
public class TestBeans {

    public static final Instant START = Instant.parse("2026-10-18T04:30:00Z"); // Sunday 10:00 IST

    public static String token(String uid, String phone, String email, boolean mfa) {
        return "test:" + uid + ":" + (phone == null ? "-" : phone) + ":" + (email == null ? "-" : email) + ":" + (mfa ? 1 : 0);
    }

    @Bean
    @Primary
    public MutableClock testClock() {
        return new MutableClock(START);
    }

    @Bean
    @Primary
    public TokenVerifier testTokenVerifier(Clock clock) {
        return idToken -> {
            String[] p = idToken.split(":");
            if (p.length != 5 || !"test".equals(p[0])) {
                throw new TokenVerifier.InvalidTokenException("bad test token", null);
            }
            return new VerifiedToken(p[1], "-".equals(p[2]) ? null : p[2], "-".equals(p[3]) ? null : p[3], true, null,
                    clock.instant().minus(Duration.ofMinutes(5)), "1".equals(p[4]) ? "totp" : null);
        };
    }

    @Bean
    @Primary
    public IdentityProvider testIdentityProvider() {
        return new IdentityProvider() {
            final Map<String, Role> claims = new ConcurrentHashMap<>();

            @Override
            public void setClaims(String firebaseUid, Role role, UUID userId, UUID schoolId) {
                claims.put(firebaseUid, role);
            }

            @Override
            public void clearClaims(String firebaseUid) {
                claims.remove(firebaseUid);
            }

            @Override
            public void revokeSessions(String firebaseUid) {
            }

            @Override
            public void deleteUser(String firebaseUid) {
                claims.remove(firebaseUid);
            }

            @Override
            public Optional<IdpUser> findByEmail(String email) {
                return Optional.empty();
            }
        };
    }

    @Bean
    @Primary
    public StorageService testStorage(Clock clock) {
        return new StorageService() {
            @Override
            public PresignedUpload presignUpload(Bucket bucket, String key, String contentType, long maxBytes) {
                return new PresignedUpload("https://s3.test/" + key, key, "PUT", Map.of("Content-Type", contentType),
                        clock.instant().plusSeconds(300));
            }

            @Override
            public String presignDownload(Bucket bucket, String key, Duration ttl) {
                return "https://s3.test/" + key + "?sig=test";
            }

            @Override
            public Optional<ObjectInfo> head(Bucket bucket, String key) {
                return Optional.of(new ObjectInfo(250_000, "image/jpeg"));
            }

            @Override
            public void delete(Bucket bucket, String key) {
            }
        };
    }
}
