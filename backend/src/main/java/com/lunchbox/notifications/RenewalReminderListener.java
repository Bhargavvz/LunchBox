package com.lunchbox.notifications;

import com.lunchbox.children.ChildDirectory;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.subscriptions.SubscriptionEvents.RenewalDue;
import com.lunchbox.users.UserDirectory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

/** Reminds a parent, a few days ahead, that a prepaid lunch plan is about to end (ADR-0018). */
@Component
public class RenewalReminderListener {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.forLanguageTag("en-IN"));

    private final NotificationService notifications;
    private final UserDirectory users;
    private final ChildDirectory children;

    public RenewalReminderListener(NotificationService notifications, UserDirectory users, ChildDirectory children) {
        this.notifications = notifications;
        this.users = users;
        this.children = children;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onRenewalDue(RenewalDue event) {
        UserDirectory.ParentInfo parent = users.requireParent(event.parentId());
        String child = children.require(event.childId()).firstName();
        // The period end is IST midnight, so the last paid day is the day before.
        String lastDay = DAY.format(TimeZones.dateIst(event.periodEnd()).minusDays(1));
        notifications.notify(parent.userId(), NotificationTemplate.PLAN_RENEWAL_DUE, new Object[]{child, lastDay},
                Map.of("subscriptionId", event.subscriptionId().toString(), "screen", "children"));
    }
}
