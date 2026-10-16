package com.lunchbox.orders;

import java.util.Map;
import java.util.UUID;

/** Public write API of the orders module. Every call goes through {@link OrderStateMachine}. */
public interface OrderCommands {

    OrderView transition(UUID orderId, OrderStatus to, String reason, Map<String, Object> metadata);

    /** SCHEDULED or REASSIGNED → ASSIGNED with the given partner. */
    OrderView assignPartner(UUID orderId, UUID partnerId, Map<String, Object> metadata);

    /** ASSIGNED → REASSIGNED (partner released). */
    OrderView releasePartner(UUID orderId, String reason);

    /** Cancels the order if it is still before pickup; returns false when it is already past that point. */
    boolean cancelIfPrePickup(UUID orderId, String reason);
}
