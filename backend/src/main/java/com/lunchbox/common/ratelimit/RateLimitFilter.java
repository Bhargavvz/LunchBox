package com.lunchbox.common.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.error.GlobalExceptionHandler;
import com.lunchbox.common.error.TooManyRequestsException;
import com.lunchbox.common.security.SecurityContext;
import com.lunchbox.common.web.ClientInfo;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** Applies coarse per-IP / per-user token buckets. Registered inside the security chain after authentication. */
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimiter limiter;
    private final ObjectMapper objectMapper;

    public RateLimitFilter(RateLimiter limiter, ObjectMapper objectMapper) {
        this.limiter = limiter;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.startsWith("/api/") || path.startsWith("/api/v1/webhooks/");
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI();
        try {
            if (path.startsWith("/api/v1/auth/")) {
                limiter.consume(RateLimitPolicy.AUTH, ClientInfo.ip(request));
            }
            var user = SecurityContext.currentUser();
            if (user.isPresent()) {
                limiter.consume(RateLimitPolicy.AUTHENTICATED, user.get().firebaseUid());
            } else {
                limiter.consume(RateLimitPolicy.PUBLIC, ClientInfo.ip(request));
            }
        } catch (TooManyRequestsException e) {
            ProblemDetail pd = GlobalExceptionHandler.problem(e.getStatus(), e.getCode(), e.getMessage());
            response.setStatus(e.getStatus().value());
            response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(e.getRetryAfterSeconds()));
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            objectMapper.writeValue(response.getOutputStream(), pd);
            return;
        }
        chain.doFilter(request, response);
    }
}
