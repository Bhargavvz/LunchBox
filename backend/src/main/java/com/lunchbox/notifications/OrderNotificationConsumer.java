package com.lunchbox.notifications;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.children.ChildDirectory;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.messaging.ProcessedEvents;
import com.lunchbox.common.security.Role;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.dispatch.DispatchTracking.PartnerArriving;
import com.lunchbox.dispatch.PartnerDirectory;
import com.lunchbox.orders.OrderEvents.OrderStatusChanged;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.users.UserDirectory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import com.lunchbox.common.messaging.LiveBroadcaster;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

/** Translates order lifecycle events into parent, partner and ops notifications. */
@Slf4j
@Component
public class OrderNotificationConsumer {

    private final NotificationService notifications;
    private final UserDirectory users;
    private final ChildDirectory children;
    private final PartnerDirectory partners;
    private final ProcessedEvents processed;
    private final LiveBroadcaster stomp;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public OrderNotificationConsumer(NotificationService notifications, UserDirectory users, ChildDirectory children,
                                     PartnerDirectory partners, ProcessedEvents processed, LiveBroadcaster stomp,
                                     ObjectMapper objectMapper, Clock clock) {
        this.notifications = notifications;
        this.users = users;
        this.children = children;
        this.partners = partners;
        this.processed = processed;
        this.stomp = stomp;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public record AdminAlert(String type, UUID orderId, UUID partnerId, String message, java.time.Instant at) {
    }

    @RabbitListener(queues = Messaging.Q_NOTIFICATIONS_ORDER_EVENTS)
    @Transactional
    public void onMessage(Message message) throws IOException {
        String eventId = (String) message.getMessageProperties().getHeaders().get(Messaging.HEADER_EVENT_ID);
        String type = (String) message.getMessageProperties().getHeaders().get(Messaging.HEADER_EVENT_TYPE);
        if (eventId == null || !processed.markFirstDelivery("notifications.order", UUID.fromString(eventId))) {
            return;
        }
        if (Messaging.ORDER_STATUS_CHANGED.equals(type)) {
            onStatusChanged(objectMapper.readValue(message.getBody(), OrderStatusChanged.class));
        } else if (Messaging.PARTNER_ARRIVING.equals(type)) {
            onArriving(objectMapper.readValue(message.getBody(), PartnerArriving.class));
        }
    }

    private void onStatusChanged(OrderStatusChanged e) {
        UUID parentUserId = users.requireParent(e.parentId()).userId();
        String child = children.require(e.childId()).firstName();
        Map<String, String> data = Map.of("orderId", e.orderId().toString(), "status", e.to().name());
        NotificationTemplate template = switch (e.to()) {
            case PARTNER_EN_ROUTE -> NotificationTemplate.ORDER_EN_ROUTE;
            case PICKED_UP -> NotificationTemplate.ORDER_PICKED_UP;
            case AT_SCHOOL -> NotificationTemplate.ORDER_AT_SCHOOL;
            case DELIVERED -> NotificationTemplate.ORDER_DELIVERED;
            case PICKUP_FAILED -> NotificationTemplate.ORDER_PICKUP_FAILED;
            case DELIVERY_FAILED -> NotificationTemplate.ORDER_DELIVERY_FAILED;
            case CANCELLED -> isParentInitiated(e.reason()) ? null : NotificationTemplate.ORDER_CANCELLED;
            default -> null;
        };
        if (template != null) {
            Object[] args = e.to() == OrderStatus.CANCELLED || e.to() == OrderStatus.DELIVERY_FAILED
                    ? new Object[]{child, e.reason() == null ? "" : e.reason()}
                    : new Object[]{child};
            notifications.notify(parentUserId, template, args, data);
        }
        if (e.to() == OrderStatus.DELIVERY_FAILED || e.to() == OrderStatus.PICKUP_FAILED) {
            alertOps(e.to() == OrderStatus.DELIVERY_FAILED ? "DELIVERY_FAILED" : "PICKUP_FAILED", e.orderId(), e.partnerId(),
                    child + ": " + (e.reason() == null ? e.to().name() : e.reason()));
        }
        boolean today = e.scheduledDate().equals(TimeZones.todayIst(clock));
        if (today && e.to() == OrderStatus.ASSIGNED && e.partnerId() != null) {
            UUID partnerUser = partners.require(e.partnerId()).userId();
            notifications.notify(partnerUser, NotificationTemplate.PARTNER_ROUTE_UPDATED, new Object[]{child},
                    Map.of("orderId", e.orderId().toString()));
        }
    }

    private void onArriving(PartnerArriving e) {
        UUID parentUserId = users.requireParent(e.parentId()).userId();
        var partner = partners.require(e.partnerId());
        notifications.notify(parentUserId, NotificationTemplate.PARTNER_ARRIVING, new Object[]{partner.firstName()},
                Map.of("orderId", e.orderId().toString()));
    }

    void alertOps(String type, UUID orderId, UUID partnerId, String message) {
        stomp.send("/topic/admin.alerts", new AdminAlert(type, orderId, partnerId, message, clock.instant()));
        List<UUID> staff = Stream.concat(users.activeUserIdsByRole(Role.OPS_ADMIN).stream(),
                users.activeUserIdsByRole(Role.SUPER_ADMIN).stream()).distinct().toList();
        for (UUID userId : staff) {
            notifications.notify(userId, NotificationTemplate.ADMIN_DELIVERY_FAILED, new Object[]{message},
                    orderId == null ? Map.of() : Map.of("orderId", orderId.toString()));
        }
    }

    private static boolean isParentInitiated(String reason) {
        return reason != null && (reason.startsWith("Parent") || reason.startsWith("Child removed")
                || reason.startsWith("Account deleted"));
    }
}
