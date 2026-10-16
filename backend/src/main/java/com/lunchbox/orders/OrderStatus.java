package com.lunchbox.orders;

import java.util.EnumSet;
import java.util.Set;

public enum OrderStatus {
    SCHEDULED,
    ASSIGNED,
    REASSIGNED,
    PARTNER_EN_ROUTE,
    PICKED_UP,
    IN_TRANSIT,
    AT_SCHOOL,
    DELIVERED,
    CANCELLED,
    PICKUP_FAILED,
    DELIVERY_FAILED;

    public static final Set<OrderStatus> PRE_PICKUP = EnumSet.of(SCHEDULED, ASSIGNED, REASSIGNED, PARTNER_EN_ROUTE);
    public static final Set<OrderStatus> TERMINAL = EnumSet.of(DELIVERED, CANCELLED, PICKUP_FAILED, DELIVERY_FAILED);
    /** The lunchbox is physically with the partner. */
    public static final Set<OrderStatus> IN_CUSTODY = EnumSet.of(PICKED_UP, IN_TRANSIT, AT_SCHOOL);
    /** States in which the parent may see the partner's live location. */
    public static final Set<OrderStatus> TRACKABLE = EnumSet.of(PARTNER_EN_ROUTE, PICKED_UP, IN_TRANSIT, AT_SCHOOL);

    public boolean isTerminal() {
        return TERMINAL.contains(this);
    }

    public boolean isPrePickup() {
        return PRE_PICKUP.contains(this);
    }
}
