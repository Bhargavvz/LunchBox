package com.lunchbox.common.ratelimit;

/** Token-bucket policies: {@code capacity} tokens refilled evenly over {@code periodSeconds}. */
public enum RateLimitPolicy {
    /** Registration and session bootstrap, keyed by client IP. */
    AUTH(10, 60),
    /** Unauthenticated public lookups, keyed by client IP. */
    PUBLIC(60, 60),
    /** Default for authenticated API calls, keyed by user. */
    AUTHENTICATED(300, 60),
    /** Pickup OTP / QR verification attempts, keyed by partner + order. */
    PICKUP_VERIFY(5, 600),
    /** Masked-call initiation, keyed by partner. */
    MASKED_CALL(10, 600),
    /** Location pings, keyed by partner (pings are already throttled client-side). */
    LOCATION(120, 60);

    private final int capacity;
    private final int periodSeconds;

    RateLimitPolicy(int capacity, int periodSeconds) {
        this.capacity = capacity;
        this.periodSeconds = periodSeconds;
    }

    public int capacity() {
        return capacity;
    }

    public double refillPerMilli() {
        return (double) capacity / (periodSeconds * 1000.0);
    }
}
