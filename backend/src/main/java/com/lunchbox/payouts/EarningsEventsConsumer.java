package com.lunchbox.payouts;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.messaging.ProcessedEvents;
import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.common.settings.PlatformSettings.PayRates;
import com.lunchbox.dispatch.RouteProgressService.RouteCompleted;
import com.lunchbox.dispatch.ShiftService.ShiftEnded;
import com.lunchbox.dispatch.ShiftService.ShiftNoShow;
import com.lunchbox.orders.OrderEvents.OrderStatusChanged;
import com.lunchbox.orders.OrderStatus;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.UUID;

/**
 * Earnings = base (per worked day) + per delivery + per km + on-time incentive − penalties (no-show; manual ones are
 * added by ops). Rates are read at event time from admin settings.
 */
@Component
public class EarningsEventsConsumer {

    private final EarningsLedger ledger;
    private final PlatformSettings settings;
    private final ProcessedEvents processed;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meters;

    public EarningsEventsConsumer(EarningsLedger ledger, PlatformSettings settings, ProcessedEvents processed,
                                  ObjectMapper objectMapper, MeterRegistry meters) {
        this.ledger = ledger;
        this.settings = settings;
        this.processed = processed;
        this.objectMapper = objectMapper;
        this.meters = meters;
    }

    @RabbitListener(queues = Messaging.Q_EARNINGS_EVENTS)
    @Transactional
    public void onMessage(Message message) throws IOException {
        String eventId = (String) message.getMessageProperties().getHeaders().get(Messaging.HEADER_EVENT_ID);
        String type = (String) message.getMessageProperties().getHeaders().get(Messaging.HEADER_EVENT_TYPE);
        if (eventId == null || !processed.markFirstDelivery("earnings", UUID.fromString(eventId))) {
            return;
        }
        PayRates rates = settings.payRates();
        switch (type) {
            case Messaging.ORDER_STATUS_CHANGED -> {
                OrderStatusChanged e = objectMapper.readValue(message.getBody(), OrderStatusChanged.class);
                if (e.to() == OrderStatus.DELIVERED && e.partnerId() != null) {
                    ledger.append(new EarningsLedger.Entry(e.partnerId(), LedgerEntry.Type.DELIVERY, rates.perDeliveryPaise(),
                            e.scheduledDate(), e.orderId(), null, null, "Delivery", null, "DELIVERY:" + e.orderId()));
                    if (e.deliveryDeadline() != null && !e.occurredAt().isAfter(e.deliveryDeadline())) {
                        ledger.append(new EarningsLedger.Entry(e.partnerId(), LedgerEntry.Type.INCENTIVE, rates.onTimeBonusPaise(),
                                e.scheduledDate(), e.orderId(), null, null, "On-time bonus", null, "ONTIME:" + e.orderId()));
                    }
                    meters.counter("lunchbox.earnings.delivery").increment();
                }
            }
            case Messaging.ROUTE_COMPLETED -> {
                RouteCompleted e = objectMapper.readValue(message.getBody(), RouteCompleted.class);
                long amount = Math.round(e.distanceMeters() / 1000.0 * rates.perKmPaise());
                ledger.append(new EarningsLedger.Entry(e.partnerId(), LedgerEntry.Type.DISTANCE, amount, e.date(), null,
                        e.routeId(), null, String.format("Distance %.1f km", e.distanceMeters() / 1000.0), null,
                        "DISTANCE:" + e.routeId()));
            }
            case Messaging.SHIFT_ENDED -> {
                ShiftEnded e = objectMapper.readValue(message.getBody(), ShiftEnded.class);
                if (e.deliveredCount() > 0) {
                    ledger.append(new EarningsLedger.Entry(e.partnerId(), LedgerEntry.Type.BASE_DAY, rates.baseDayPaise(),
                            e.date(), null, null, null, "Daily base pay", null, "BASE_DAY:" + e.partnerId() + ":" + e.date()));
                }
            }
            case Messaging.SHIFT_NO_SHOW -> {
                ShiftNoShow e = objectMapper.readValue(message.getBody(), ShiftNoShow.class);
                ledger.append(new EarningsLedger.Entry(e.partnerId(), LedgerEntry.Type.PENALTY, -Math.abs(rates.noShowPenaltyPaise()),
                        e.date(), null, null, null, "No-show penalty", null, "NOSHOW:" + e.shiftId()));
            }
            default -> {
                // Not an earnings-relevant event.
            }
        }
    }
}
