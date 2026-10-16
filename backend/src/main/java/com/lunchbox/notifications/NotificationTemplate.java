package com.lunchbox.notifications;

/**
 * Message templates. Text lives in {@code i18n/messages_<lang>.properties} under
 * {@code notification.<key>.title|body}. {@code smsTemplate} is the MSG91 (DLT) fallback, used only for
 * safety-relevant updates when push is not possible.
 */
public enum NotificationTemplate {
    ORDER_EN_ROUTE("order.en_route", null, true),
    PARTNER_ARRIVING("order.partner_arriving", "PARTNER_ARRIVING", true),
    ORDER_PICKED_UP("order.picked_up", "ORDER_PICKED_UP", true),
    ORDER_AT_SCHOOL("order.at_school", null, false),
    ORDER_DELIVERED("order.delivered", "ORDER_DELIVERED", true),
    ORDER_PICKUP_FAILED("order.pickup_failed", "PICKUP_FAILED", true),
    ORDER_DELIVERY_FAILED("order.delivery_failed", "ORDER_DELIVERY_FAILED", true),
    ORDER_CANCELLED("order.cancelled", null, false),
    PARTNER_ROUTE_UPDATED("partner.route_updated", null, true),
    ADMIN_DELIVERY_FAILED("admin.delivery_failed", null, true),
    ADMIN_PARTNER_ISSUE("admin.partner_issue", null, true),
    PAYOUT_PROCESSED("payout.processed", null, false),
    BROADCAST("broadcast", null, false);

    private final String key;
    private final String smsTemplate;
    private final boolean highPriority;

    NotificationTemplate(String key, String smsTemplate, boolean highPriority) {
        this.key = key;
        this.smsTemplate = smsTemplate;
        this.highPriority = highPriority;
    }

    public String key() {
        return key;
    }

    public String smsTemplate() {
        return smsTemplate;
    }

    public boolean highPriority() {
        return highPriority;
    }
}
