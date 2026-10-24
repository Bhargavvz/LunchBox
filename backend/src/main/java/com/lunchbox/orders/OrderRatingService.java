package com.lunchbox.orders;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.orders.OrderEvents.OrderRated;
import com.lunchbox.orders.web.OrderDtos.OrderDetailResponse;
import com.lunchbox.orders.web.OrderDtos.RateOrderRequest;
import com.lunchbox.users.UserDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Parents rate a delivered order once, within {@link #RATING_WINDOW} of delivery. The dispatch module folds the
 * rating into the partner's average when it receives {@link OrderRated}.
 */
@Service
public class OrderRatingService {

    static final Duration RATING_WINDOW = Duration.ofDays(7);

    private final OrderRepository orders;
    private final OrderQueryService queries;
    private final UserDirectory users;
    private final OutboxPublisher outbox;
    private final AuditService audit;
    private final Clock clock;

    public OrderRatingService(OrderRepository orders, OrderQueryService queries, UserDirectory users,
                              OutboxPublisher outbox, AuditService audit, Clock clock) {
        this.orders = orders;
        this.queries = queries;
        this.users = users;
        this.outbox = outbox;
        this.audit = audit;
        this.clock = clock;
    }

    static boolean canRate(Order order, Instant now) {
        return order.getStatus() == OrderStatus.DELIVERED && order.getRatedAt() == null && order.getPartnerId() != null
                && order.getDeliveredAt() != null && now.isBefore(order.getDeliveredAt().plus(RATING_WINDOW));
    }

    @Transactional
    public OrderDetailResponse rate(UUID parentUserId, UUID orderId, RateOrderRequest request) {
        UUID parentId = users.requireParentId(parentUserId);
        Order order = orders.findForUpdate(orderId).filter(o -> o.getParentId().equals(parentId))
                .orElseThrow(() -> Errors.notFound("Order"));
        if (order.getStatus() != OrderStatus.DELIVERED) {
            throw Errors.unprocessable("not_delivered", "You can rate a delivery once the lunchbox has reached school.");
        }
        if (order.getRatedAt() != null) {
            throw Errors.conflict("already_rated", "You have already rated this delivery.");
        }
        Instant now = clock.instant();
        if (!canRate(order, now)) {
            throw Errors.unprocessable("rating_window_closed", "Deliveries can only be rated within 7 days.");
        }
        String comment = request.comment() == null || request.comment().isBlank() ? null : request.comment().trim();
        order.rate(request.stars(), comment, now);
        outbox.publish("Order", orderId, Messaging.RATING_SUBMITTED,
                new OrderRated(orderId, order.getPartnerId(), request.stars(), now));
        audit.record("order.rated", "Order", orderId, null, Map.of("stars", request.stars()));
        return queries.detailForParent(parentUserId, orderId);
    }
}
