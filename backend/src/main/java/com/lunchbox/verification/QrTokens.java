package com.lunchbox.verification;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.crypto.Hmac;
import org.springframework.stereotype.Component;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

/**
 * Short-lived signed pickup QR: {@code LB1.<orderId>.<expEpochSeconds>.<nonce>.<hmac>} where
 * hmac = base64url(HMAC-SHA256(key, "LB1|orderId|exp|nonce")). The parent app refreshes it before expiry.
 */
@Component
public class QrTokens {

    public static final Duration TTL = Duration.ofSeconds(120);
    private static final String VERSION = "LB1";

    private final byte[] key;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public QrTokens(LunchBoxProperties properties, Clock clock) {
        this.key = Base64.getDecoder().decode(properties.security().qrSigningKey());
        if (key.length < 32) {
            throw new IllegalStateException("lunchbox.security.qr-signing-key must be at least 32 bytes");
        }
        this.clock = clock;
    }

    public record Issued(String token, Instant expiresAt) {
    }

    public Issued issue(UUID orderId) {
        Instant exp = clock.instant().plus(TTL);
        byte[] nonceBytes = new byte[8];
        random.nextBytes(nonceBytes);
        String nonce = HexFormat.of().formatHex(nonceBytes);
        String payload = VERSION + "|" + orderId + "|" + exp.getEpochSecond() + "|" + nonce;
        String sig = Base64.getUrlEncoder().withoutPadding().encodeToString(Hmac.sha256(key, payload));
        return new Issued(VERSION + "." + orderId + "." + exp.getEpochSecond() + "." + nonce + "." + sig, exp);
    }

    /** @return the order id the token was issued for, if signature and expiry are valid. */
    public Optional<UUID> verify(String token) {
        if (token == null) {
            return Optional.empty();
        }
        String[] parts = token.trim().split("\\.");
        if (parts.length != 5 || !VERSION.equals(parts[0])) {
            return Optional.empty();
        }
        try {
            UUID orderId = UUID.fromString(parts[1]);
            long exp = Long.parseLong(parts[2]);
            if (Instant.ofEpochSecond(exp).isBefore(clock.instant())) {
                return Optional.empty();
            }
            String payload = VERSION + "|" + orderId + "|" + exp + "|" + parts[3];
            byte[] expected = Hmac.sha256(key, payload);
            byte[] actual = Base64.getUrlDecoder().decode(parts[4]);
            return MessageDigest.isEqual(expected, actual) ? Optional.of(orderId) : Optional.empty();
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
