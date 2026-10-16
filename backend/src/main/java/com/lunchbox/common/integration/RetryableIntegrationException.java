package com.lunchbox.common.integration;

/** A transient third-party failure (timeout, 5xx, 429) that Resilience4j may retry with backoff and jitter. */
public class RetryableIntegrationException extends RuntimeException {

    public RetryableIntegrationException(String message) {
        super(message);
    }

    public RetryableIntegrationException(String message, Throwable cause) {
        super(message, cause);
    }
}
