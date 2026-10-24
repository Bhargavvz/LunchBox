package com.lunchbox.dispatch;

import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.messaging.ProcessedEvents;
import com.lunchbox.orders.OrderEvents.OrderRated;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Folds parent ratings into the partner's running average (exactly once per event). */
@Component
public class RatingEventsConsumer {

    private final PartnerService partners;
    private final ProcessedEvents processed;

    public RatingEventsConsumer(PartnerService partners, ProcessedEvents processed) {
        this.partners = partners;
        this.processed = processed;
    }

    @RabbitListener(queues = Messaging.Q_DISPATCH_RATINGS)
    @Transactional
    public void onRated(OrderRated event, @Header(Messaging.HEADER_EVENT_ID) String eventId) {
        if (!processed.markFirstDelivery("dispatch-ratings", UUID.fromString(eventId))) {
            return;
        }
        partners.recordRating(event.partnerId(), event.stars());
    }
}
