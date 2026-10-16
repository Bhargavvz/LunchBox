package com.lunchbox.common.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

public class LunchBoxAuthentication extends AbstractAuthenticationToken {

    private final CurrentUser principal;

    public LunchBoxAuthentication(CurrentUser principal) {
        super(authorities(principal));
        this.principal = principal;
        setAuthenticated(true);
    }

    private static List<GrantedAuthority> authorities(CurrentUser user) {
        if (!user.registered()) {
            return List.of(new SimpleGrantedAuthority("ROLE_UNREGISTERED"));
        }
        return List.of(new SimpleGrantedAuthority(user.role().authority()));
    }

    @Override
    public Object getCredentials() {
        return "";
    }

    @Override
    public CurrentUser getPrincipal() {
        return principal;
    }

    @Override
    public String getName() {
        return principal.firebaseUid();
    }
}
