package com.lunchbox.common.persistence;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * RFC 9562 UUID version 7: 48-bit Unix epoch milliseconds followed by random bits.
 * Time-ordered keys keep B-tree indexes compact and make inserts append-mostly.
 */
public final class UuidV7 {

    private static final SecureRandom RANDOM = new SecureRandom();

    private UuidV7() {
    }

    public static UUID generate() {
        return generate(System.currentTimeMillis());
    }

    static UUID generate(long epochMillis) {
        long randA = RANDOM.nextInt() & 0x0FFFL;
        long msb = (epochMillis << 16) | 0x7000L | randA;
        long lsb = (RANDOM.nextLong() & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
        return new UUID(msb, lsb);
    }

    public static long timestampMillis(UUID uuid) {
        if (uuid.version() != 7) {
            throw new IllegalArgumentException("Not a UUIDv7: " + uuid);
        }
        return uuid.getMostSignificantBits() >>> 16;
    }
}
