package com.lunchbox.common.error;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * Base class for errors that are safe to show to API clients. The message is user-facing;
 * never put internal details (SQL, stack traces, third-party payloads) into it.
 */
@Getter
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
