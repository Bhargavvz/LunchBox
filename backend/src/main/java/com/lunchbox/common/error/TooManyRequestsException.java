package com.lunchbox.common.error;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class TooManyRequestsException extends ApiException {

    private final long retryAfterSeconds;

    public TooManyRequestsException(long retryAfterSeconds) {
        super(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", "Too many requests. Please try again shortly.");
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
