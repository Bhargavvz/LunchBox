package com.lunchbox.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.error.GlobalExceptionHandler;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** Authenticates {@code Authorization: Bearer <Firebase ID token>} on every API request. */
public class FirebaseAuthenticationFilter extends OncePerRequestFilter {

    private static final String PREFIX = "Bearer ";

    private final Authenticator authenticator;
    private final ObjectMapper objectMapper;

    public FirebaseAuthenticationFilter(Authenticator authenticator, ObjectMapper objectMapper) {
        this.authenticator = authenticator;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/v1/webhooks/") || path.startsWith("/actuator/");
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(PREFIX)) {
            chain.doFilter(request, response);
            return;
        }
        try {
            var authentication = authenticator.authenticate(header.substring(PREFIX.length()).trim());
            SecurityContextHolder.getContext().setAuthentication(authentication);
            if (authentication.getPrincipal().userId() != null) {
                MDC.put("userId", authentication.getPrincipal().userId().toString());
            }
        } catch (ApiException e) {
            SecurityContextHolder.clearContext();
            response.setStatus(e.getStatus().value());
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            objectMapper.writeValue(response.getOutputStream(),
                    GlobalExceptionHandler.problem(e.getStatus(), e.getCode(), e.getMessage()));
            return;
        }
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove("userId");
        }
    }
}
