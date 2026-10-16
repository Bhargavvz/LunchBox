package com.lunchbox.tracking;

import com.lunchbox.auth.Authenticator;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.LunchBoxAuthentication;
import com.lunchbox.common.security.Role;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.users.ConsentPurpose;
import com.lunchbox.users.UserDirectory;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Authenticates STOMP CONNECT with the same Firebase rules as HTTP, then authorises every SUBSCRIBE and SEND:
 * a parent may only subscribe to orders they own (and only with live-tracking consent); only staff see the ops
 * topics; only partners may publish locations.
 */
@Component
public class StompAuthInterceptor implements ChannelInterceptor {

    private static final Pattern ORDER_TOPIC = Pattern.compile("^/topic/orders\\.([0-9a-fA-F-]{36})$");

    private final Authenticator authenticator;
    private final OrderQueries orders;
    private final UserDirectory users;
    private final MeterRegistry meters;

    public StompAuthInterceptor(@Lazy Authenticator authenticator, @Lazy OrderQueries orders, @Lazy UserDirectory users,
                                MeterRegistry meters) {
        this.authenticator = authenticator;
        this.orders = orders;
        this.users = users;
        this.meters = meters;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }
        StompCommand command = accessor.getCommand();
        switch (command) {
            case CONNECT, STOMP -> {
                String header = accessor.getFirstNativeHeader("Authorization");
                if (header == null || !header.startsWith("Bearer ")) {
                    throw deny("Missing bearer token");
                }
                try {
                    LunchBoxAuthentication auth = authenticator.authenticate(header.substring(7).trim());
                    if (!auth.getPrincipal().registered()) {
                        throw deny("Registration required");
                    }
                    accessor.setUser(auth);
                } catch (ApiException e) {
                    meters.counter("lunchbox.stomp.rejected", "reason", "auth").increment();
                    throw deny(e.getMessage());
                }
            }
            case SUBSCRIBE -> authorizeSubscribe(user(accessor), accessor.getDestination());
            case SEND -> authorizeSend(user(accessor), accessor.getDestination());
            default -> {
            }
        }
        return message;
    }

    private CurrentUser user(StompHeaderAccessor accessor) {
        Principal p = accessor.getUser();
        if (p instanceof LunchBoxAuthentication lba) {
            return lba.getPrincipal();
        }
        throw deny("Not authenticated");
    }

    private void authorizeSubscribe(CurrentUser user, String destination) {
        if (destination == null) {
            throw deny("Missing destination");
        }
        if (destination.startsWith("/user/queue/")) {
            return;
        }
        if (destination.equals("/topic/admin.live") || destination.equals("/topic/admin.alerts")) {
            if (user.isPlatformStaff()) {
                return;
            }
            throw deny("Staff only");
        }
        Matcher m = ORDER_TOPIC.matcher(destination);
        if (m.matches()) {
            UUID orderId = UUID.fromString(m.group(1));
            if (user.isPlatformStaff()) {
                return;
            }
            if (user.is(Role.PARENT)) {
                UUID parentId = users.requireParentId(user.userId());
                orders.requireOwnedByParent(orderId, parentId);
                if (!users.hasActiveConsent(user.userId(), ConsentPurpose.LIVE_TRACKING)) {
                    throw deny("Live tracking consent required");
                }
                return;
            }
        }
        meters.counter("lunchbox.stomp.rejected", "reason", "subscribe").increment();
        throw deny("Subscription not allowed");
    }

    private void authorizeSend(CurrentUser user, String destination) {
        if ("/app/partner.location".equals(destination) && user.is(Role.PARTNER)) {
            return;
        }
        meters.counter("lunchbox.stomp.rejected", "reason", "send").increment();
        throw deny("Send not allowed");
    }

    private static MessageDeliveryException deny(String reason) {
        return new MessageDeliveryException(reason);
    }
}
