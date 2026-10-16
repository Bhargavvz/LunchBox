package com.lunchbox.notifications;

import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.messaging.ProcessedEvents;
import com.lunchbox.common.security.Role;
import com.lunchbox.dispatch.PartnerOperationsService.IssueReported;
import com.lunchbox.users.UserDirectory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.handler.annotation.Header;
import com.lunchbox.common.messaging.LiveBroadcaster;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

/** SOS and partner issues: pushed live to the ops dashboard and to every on-duty ops admin. */
@Component
public class OpsEventConsumer {

    private final NotificationService notifications;
    private final UserDirectory users;
    private final ProcessedEvents processed;
    private final LiveBroadcaster stomp;

    public OpsEventConsumer(NotificationService notifications, UserDirectory users, ProcessedEvents processed,
                            LiveBroadcaster stomp) {
        this.notifications = notifications;
        this.users = users;
        this.processed = processed;
        this.stomp = stomp;
    }

    @RabbitListener(queues = Messaging.Q_NOTIFICATIONS_OPS_EVENTS)
    @Transactional
    public void onIssue(IssueReported issue, @Header(Messaging.HEADER_EVENT_ID) String eventId) {
        if (!processed.markFirstDelivery("notifications.ops", UUID.fromString(eventId))) {
            return;
        }
        String summary = issue.type() + " — " + issue.partnerName()
                + (issue.description() == null ? "" : ": " + issue.description());
        stomp.send("/topic/admin.alerts", new OrderNotificationConsumer.AdminAlert(
                "PARTNER_" + issue.type().name(), issue.orderId(), issue.partnerId(), summary, issue.at()));
        Stream.concat(users.activeUserIdsByRole(Role.OPS_ADMIN).stream(), users.activeUserIdsByRole(Role.SUPER_ADMIN).stream())
                .distinct()
                .forEach(userId -> notifications.notify(userId, NotificationTemplate.ADMIN_PARTNER_ISSUE,
                        new Object[]{summary}, Map.of("issueId", issue.issueId().toString())));
    }
}
