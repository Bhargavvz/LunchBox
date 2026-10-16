package com.lunchbox.common.messaging;

/** RabbitMQ topology names shared by producers (the outbox) and consumers. */
public final class Messaging {

    public static final String EVENTS_EXCHANGE = "lunchbox.events";
    public static final String DEAD_LETTER_EXCHANGE = "lunchbox.dlx";

    public static final String HEADER_EVENT_ID = "x-event-id";
    public static final String HEADER_EVENT_TYPE = "x-event-type";

    // Event routing keys
    public static final String ORDER_STATUS_CHANGED = "order.status_changed";
    public static final String PARTNER_ARRIVING = "order.partner_arriving";
    public static final String ROUTE_COMPLETED = "route.completed";
    public static final String SHIFT_ENDED = "shift.ended";
    public static final String SHIFT_NO_SHOW = "shift.no_show";
    public static final String PARTNER_ISSUE_REPORTED = "partner.issue_reported";
    public static final String BROADCAST_REQUESTED = "broadcast.requested";
    public static final String PAYOUT_REQUESTED = "payout.requested";

    // Consumer queues
    public static final String Q_NOTIFICATIONS_ORDER_EVENTS = "notifications.order-events";
    public static final String Q_NOTIFICATIONS_OPS_EVENTS = "notifications.ops-events";
    public static final String Q_EARNINGS_EVENTS = "payouts.earnings-events";
    public static final String Q_TRACKING_ORDER_EVENTS = "tracking.order-events";
    public static final String JOB_BROADCAST = "jobs.broadcast";
    public static final String JOB_PAYOUT = "jobs.payout";

    private Messaging() {
    }
}
