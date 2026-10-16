package com.lunchbox.common.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

public final class SecurityContext {

    private SecurityContext() {
    }

    public static Optional<CurrentUser> currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof LunchBoxAuthentication lba) {
            return Optional.of(lba.getPrincipal());
        }
        return Optional.empty();
    }
}
