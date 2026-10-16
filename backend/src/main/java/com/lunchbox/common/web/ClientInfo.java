package com.lunchbox.common.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Optional;

/**
 * Client metadata. {@code server.forward-headers-strategy=framework} makes {@link HttpServletRequest#getRemoteAddr()}
 * honour X-Forwarded-For from the ALB, so we never parse that header ourselves.
 */
public final class ClientInfo {

    private ClientInfo() {
    }

    public static String ip(HttpServletRequest request) {
        return request.getRemoteAddr();
    }

    public static Optional<HttpServletRequest> currentRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            return Optional.of(attrs.getRequest());
        }
        return Optional.empty();
    }

    public static String currentIp() {
        return currentRequest().map(ClientInfo::ip).orElse(null);
    }

    public static String currentUserAgent() {
        return currentRequest().map(r -> {
            String ua = r.getHeader("User-Agent");
            return ua == null ? null : ua.substring(0, Math.min(ua.length(), 255));
        }).orElse(null);
    }
}
