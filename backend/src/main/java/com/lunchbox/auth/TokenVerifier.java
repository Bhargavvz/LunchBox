package com.lunchbox.auth;

/** Verifies a bearer ID token (signature, issuer, audience, expiry). */
public interface TokenVerifier {

    /** @throws InvalidTokenException if the token is not valid */
    VerifiedToken verify(String idToken);

    class InvalidTokenException extends RuntimeException {
        public InvalidTokenException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
