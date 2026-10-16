package com.lunchbox.common.integration;

/** A permanent third-party rejection (4xx validation, auth) — retrying will not help. */
public class NonRetryableIntegrationException extends RuntimeException {

    public NonRetryableIntegrationException(String message) {
        super(message);
    }

    public NonRetryableIntegrationException(String message, Throwable cause) {
        super(message, cause);
    }
}
