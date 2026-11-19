package com.lunchbox.orders;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.SecurityContext;
import com.lunchbox.orders.OrderEvents.OrderStatusChanged;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The only code path that changes an order's status: validates against the transition table, applies the change,
 * appends {@code order_status_history}, and writes an outbox event (which drives notifications, earnings and
 * tracking) — all in one transaction.
 */
@Slf4j
@Service
public class OrderTransitionService implements OrderCommands {

    private final OrderRepository orders;
    private final OrderStatusHistoryRepository history;
    private final OutboxPublisher outbox;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meters;
    private final com.lunchbox.audit.AuditService audit;
    private final Clock clock;

    public OrderTransitionService(OrderRepository orders, OrderStatusHistoryRepository history, OutboxPublisher outbox,
                                  ObjectMapper objectMapper, MeterRegistry meters, com.lunchbox.audit.AuditService audit,
                                  Clock clock) {
        this.audit = audit;
        this.orders = orders;
        this.history = history;
        this.outbox = outbox;
        this.objectMapper = objectMapper;
        this.meters = meters;
        this.clock = clock;
    }

    @Override
    @Transactional
    public OrderView transition(UUID orderId, OrderStatus to, String reason, Map<String, Object> metadata) {
        Order order = orders.findForUpdate(orderId).orElseThrow(() -> Errors.notFound("Order"));
        return apply(order, to, reason, metadata);
    }

    @Override
    @Transactional
    public OrderView assignPartner(UUID orderId, UUID partnerId, Map<String, Object> metadata) {
        Order order = orders.findForUpdate(orderId).orElseThrow(() -> Errors.notFound("Order"));
        if (order.getStatus() != OrderStatus.SCHEDULED && order.getStatus() != OrderStatus.REASSIGNED) {
            throw new OrderStateMachine.IllegalTransitionException(order.getStatus(), OrderStatus.ASSIGNED);
        }
        order.assignPartner(partnerId);
        return apply(order, OrderStatus.ASSIGNED, null, metadata);
    }

    @Override
    @Transactional
    public OrderView releasePartner(UUID orderId, String reason) {
        Order order = orders.findForUpdate(orderId).orElseThrow(() -> Errors.notFound("Order"));
        return apply(order, OrderStatus.REASSIGNED, reason, Map.of("previousPartnerId", String.valueOf(order.getPartnerId())));
    }

    @Override
    @Transactional
    public boolean cancelIfPrePickup(UUID orderId, String reason) {
        Order order = orders.findForUpdate(orderId).orElseThrow(() -> Errors.notFound("Order"));
        if (!order.getStatus().isPrePickup()) {
            return false;
        }
        apply(order, OrderStatus.CANCELLED, reason, Map.of());
        return true;
    }

    private OrderView apply(Order order, OrderStatus to, String reason, Map<String, Object> metadata) {
        OrderStatus from = order.getStatus();
        OrderStateMachine.assertTransition(from, to, reason);
        Instant now = clock.instant();
        order.applyTransition(to, trim(reason), now);
        orders.saveAndFlush(order);

        Optional<CurrentUser> actor = SecurityContext.currentUser();
        history.save(new OrderStatusHistory(order.getId(), from, to,
                actor.map(CurrentUser::userId).orElse(null),
                actor.map(u -> u.role() == null ? "UNREGISTERED" : u.role().name()).orElse("SYSTEM"),
                trim(reason), toJson(metadata), now));

        if (to == OrderStatus.PICKUP_FAILED || to == OrderStatus.DELIVERY_FAILED) {
            audit.system(com.lunchbox.audit.AuditService.Severity.WARNING,
                    to == OrderStatus.PICKUP_FAILED ? "order.pickup_failed" : "order.delivery_failed", "Order", order.getId(),
                    (to == OrderStatus.PICKUP_FAILED ? "A lunchbox could not be collected: " : "A lunchbox could not be delivered: ")
                            + (reason == null ? "no reason given" : reason) + ".",
                    java.util.Map.of("from", from.name(), "to", to.name()));
        }
        outbox.publish("Order", order.getId(), Messaging.ORDER_STATUS_CHANGED, new OrderStatusChanged(
                order.getId(), order.getParentId(), order.getChildId(), order.getSchoolId(), order.getPartnerId(),
                order.getScheduledDate(), from, to, trim(reason), order.getDeliveryDeadline(), now));

        meters.counter("lunchbox.orders.transitions", "from", from.name(), "to", to.name()).increment();
        log.info("Order {} {} -> {}", order.getId(), from, to);
        return OrderView.of(order);
    }

    private String toJson(Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(metadata);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String trim(String reason) {
        if (reason == null) {
            return null;
        }
        String r = reason.trim();
        return r.length() > 300 ? r.substring(0, 300) : r;
    }
}
