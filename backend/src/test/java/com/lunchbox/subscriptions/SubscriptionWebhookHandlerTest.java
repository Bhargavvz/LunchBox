package com.lunchbox.subscriptions;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class SubscriptionWebhookHandlerTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final long PERIOD_END = 1_792_800_000L;

    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final SubscriptionWebhookHandler handler = new SubscriptionWebhookHandler(subscriptions);

    private static JsonNode payload(String paymentJson) throws Exception {
        String payment = paymentJson == null ? "" : ",\"payment\":{\"entity\":" + paymentJson + "}";
        return JSON.readTree("{\"subscription\":{\"entity\":{\"id\":\"sub_1\",\"current_end\":" + PERIOD_END + "}}"
                + payment + "}");
    }

    @Test
    void onlyClaimsSubscriptionEvents() {
        assertThat(handler.supports("subscription.charged")).isTrue();
        assertThat(handler.supports("payment.captured")).isFalse();
        assertThat(handler.supports(null)).isFalse();
    }

    @Test
    void activationEventsActivateWithThePeriodEnd() throws Exception {
        for (String event : new String[]{"subscription.authenticated", "subscription.activated", "subscription.resumed"}) {
            handler.handle(event, payload(null));
        }
        verify(subscriptions, times(3)).onProviderActivated("sub_1", Instant.ofEpochSecond(PERIOD_END));
    }

    @Test
    void chargeRecordsThePaymentInPaise() throws Exception {
        handler.handle("subscription.charged", payload(
                "{\"id\":\"pay_1\",\"invoice_id\":\"inv_1\",\"amount\":149900,\"method\":\"upi\",\"created_at\":1792700000}"));

        verify(subscriptions).onProviderCharged("sub_1", Instant.ofEpochSecond(PERIOD_END), "pay_1", "inv_1", 149_900L,
                "upi", Instant.ofEpochSecond(1_792_700_000L));
    }

    @Test
    void haltedPausedAndPendingStopDeliveries() throws Exception {
        handler.handle("subscription.halted", payload(null));
        handler.handle("subscription.paused", payload(null));
        handler.handle("subscription.pending", payload(null));
        verify(subscriptions, times(3)).onProviderHalted("sub_1");
    }

    @Test
    void cancelledAndCompletedEndTheSubscription() throws Exception {
        handler.handle("subscription.cancelled", payload(null));
        handler.handle("subscription.completed", payload(null));
        verify(subscriptions).onProviderEnded("sub_1", false);
        verify(subscriptions).onProviderEnded("sub_1", true);
    }

    @Test
    void ignoresEventsWithNoLocalEffect() throws Exception {
        handler.handle("subscription.updated", payload(null));
        verifyNoInteractions(subscriptions);
    }
}
