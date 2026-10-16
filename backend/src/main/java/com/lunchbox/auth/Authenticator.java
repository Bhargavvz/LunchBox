package com.lunchbox.auth;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.LunchBoxAuthentication;
import com.lunchbox.users.UserStatus;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;

/**
 * Shared by the HTTP filter and the STOMP CONNECT interceptor so both paths enforce identical rules:
 * valid Firebase token, account not suspended, and for staff: MFA present and session younger than the max age.
 */
@Component
public class Authenticator {

    private final TokenVerifier verifier;
    private final PrincipalResolver resolver;
    private final LunchBoxProperties.Security security;
    private final Clock clock;

    public Authenticator(TokenVerifier verifier, PrincipalResolver resolver, LunchBoxProperties properties, Clock clock) {
        this.verifier = verifier;
        this.resolver = resolver;
        this.security = properties.security();
        this.clock = clock;
    }

    public LunchBoxAuthentication authenticate(String bearerToken) {
        VerifiedToken token;
        try {
            token = verifier.verify(bearerToken);
        } catch (TokenVerifier.InvalidTokenException e) {
            throw Errors.unauthorized("Your session is invalid or has expired. Please sign in again.");
        }
        PrincipalResolver.Resolved resolved = resolver.resolve(token);
        CurrentUser user = resolved.user();
        if (resolved.principal() != null) {
            UserStatus status = resolved.principal().status();
            if (status == UserStatus.SUSPENDED || status == UserStatus.DELETED) {
                throw Errors.forbidden("This account is not active. Contact LunchBox support.");
            }
        }
        if (user.isAdmin()) {
            enforceStaffSession(token);
        }
        LunchBoxAuthentication authentication = new LunchBoxAuthentication(user);
        authentication.setDetails(token);
        return authentication;
    }

    private void enforceStaffSession(VerifiedToken token) throws ApiException {
        if (security.requireAdminMfa() && !token.hasSecondFactor()) {
            throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN, "mfa_required",
                    "Multi-factor authentication is required for admin access.");
        }
        Instant authTime = token.authTime();
        if (authTime == null || authTime.plus(security.adminSessionMaxAge()).isBefore(clock.instant())) {
            throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "session_expired",
                    "Your admin session has expired. Please sign in again.");
        }
    }
}
