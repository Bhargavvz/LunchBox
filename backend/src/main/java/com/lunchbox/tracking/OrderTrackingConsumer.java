package com.lunchbox.tracking;

import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.messaging.ProcessedEvents;
import com.lunchbox.orders.OrderEvents.OrderStatusChanged;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.tracking.LiveLocationStore.OrderMeta;
import com.lunchbox.tracking.TrackingDtos.TrackingMessage;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.handler.annotation.Header;
import com.lunchbox.common.messaging.LiveBroadcaster;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Keeps the Redis "who may watch which partner" index in sync with order status, and pushes every status change to
 * the order's topic so the parent's timeline updates instantly.
 */
@Component
public class OrderTrackingConsumer {

    private final LiveLocationStore store;
    private final OrderQueries orders;
    private final SchoolDirectory schools;
    private final LiveBroadcaster messaging;
    private final ProcessedEvents processed;

    public OrderTrackingConsumer(LiveLocationStore store, OrderQueries orders, SchoolDirectory schools,
                                 LiveBroadcaster messaging, ProcessedEvents processed) {
        this.store = store;
        this.orders = orders;
        this.schools = schools;
        this.messaging = messaging;
        this.processed = processed;
    }

    @RabbitListener(queues = Messaging.Q_TRACKING_ORDER_EVENTS)
    @Transactional
    public void onStatusChanged(OrderStatusChanged event, @Header(Messaging.HEADER_EVENT_ID) String eventId) {
        if (!processed.markFirstDelivery("tracking", UUID.fromString(eventId))) {
            return;
        }
        OrderStatus to = event.to();
        if (OrderStatus.TRACKABLE.contains(to) && event.partnerId() != null) {
            var order = orders.require(event.orderId());
            OrderMeta meta;
            if (to == OrderStatus.PARTNER_EN_ROUTE) {
                meta = new OrderMeta(to.name(), order.pickupLocation().getY(), order.pickupLocation().getX(), "HOME");
            } else {
                var school = schools.require(event.schoolId()).location();
                meta = new OrderMeta(to.name(), school.getY(), school.getX(), "SCHOOL");
            }
            store.addTrackable(event.partnerId(), event.orderId(), meta);
        } else {
            store.removeTrackable(event.orderId());
        }
        messaging.send("/topic/orders." + event.orderId(), new TrackingMessage("status", event.orderId(), to,
                null, null, null, null, null, event.occurredAt()));
    }
}
