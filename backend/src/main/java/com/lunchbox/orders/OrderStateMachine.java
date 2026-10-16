package com.lunchbox.orders;

import com.lunchbox.common.error.ApiException;
import org.springframework.http.HttpStatus;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import static com.lunchbox.orders.OrderStatus.*;

/**
 * The single source of truth for legal order transitions (see docs/state-machine.md).
 *
 * <pre>
 * SCHEDULED → ASSIGNED → PARTNER_EN_ROUTE → PICKED_UP → IN_TRANSIT → AT_SCHOOL → DELIVERED
 * any pre-pickup state → CANCELLED
 * PARTNER_EN_ROUTE → PICKUP_FAILED
 * IN_TRANSIT / AT_SCHOOL → DELIVERY_FAILED
 * ASSIGNED → REASSIGNED → ASSIGNED
 * </pre>
 */
public final class OrderStateMachine {

    private static final Map<OrderStatus, Set<OrderStatus>> TRANSITIONS = new EnumMap<>(OrderStatus.class);
    /** Targets that require a human-readable reason. */
    private static final Set<OrderStatus> REASON_REQUIRED = EnumSet.of(CANCELLED, PICKUP_FAILED, DELIVERY_FAILED, REASSIGNED);

    static {
        TRANSITIONS.put(SCHEDULED, EnumSet.of(ASSIGNED, CANCELLED));
        TRANSITIONS.put(ASSIGNED, EnumSet.of(PARTNER_EN_ROUTE, REASSIGNED, CANCELLED));
        TRANSITIONS.put(REASSIGNED, EnumSet.of(ASSIGNED, CANCELLED));
        TRANSITIONS.put(PARTNER_EN_ROUTE, EnumSet.of(PICKED_UP, PICKUP_FAILED, CANCELLED));
        TRANSITIONS.put(PICKED_UP, EnumSet.of(IN_TRANSIT));
        TRANSITIONS.put(IN_TRANSIT, EnumSet.of(AT_SCHOOL, DELIVERY_FAILED));
        TRANSITIONS.put(AT_SCHOOL, EnumSet.of(DELIVERED, DELIVERY_FAILED));
        TRANSITIONS.put(DELIVERED, EnumSet.noneOf(OrderStatus.class));
        TRANSITIONS.put(CANCELLED, EnumSet.noneOf(OrderStatus.class));
        TRANSITIONS.put(PICKUP_FAILED, EnumSet.noneOf(OrderStatus.class));
        TRANSITIONS.put(DELIVERY_FAILED, EnumSet.noneOf(OrderStatus.class));
    }

    private OrderStateMachine() {
    }

    public static boolean canTransition(OrderStatus from, OrderStatus to) {
        return TRANSITIONS.getOrDefault(from, Set.of()).contains(to);
    }

    public static Set<OrderStatus> allowedFrom(OrderStatus from) {
        return Collections.unmodifiableSet(TRANSITIONS.getOrDefault(from, Set.of()));
    }

    public static void assertTransition(OrderStatus from, OrderStatus to, String reason) {
        if (!canTransition(from, to)) {
            throw new IllegalTransitionException(from, to);
        }
        if (REASON_REQUIRED.contains(to) && (reason == null || reason.isBlank())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "reason_required",
                    "A reason is required to move an order to " + to + ".");
        }
    }

    public static class IllegalTransitionException extends ApiException {
        private final OrderStatus from;
        private final OrderStatus to;

        public IllegalTransitionException(OrderStatus from, OrderStatus to) {
            super(HttpStatus.CONFLICT, "illegal_transition", "This order cannot move from " + from + " to " + to + ".");
            this.from = from;
            this.to = to;
        }

        public OrderStatus from() {
            return from;
        }

        public OrderStatus to() {
            return to;
        }
    }
}
