package com.lunchbox.orders;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.orders.OrderEvents.OrderRated;
import com.lunchbox.orders.web.OrderDtos.RateOrderRequest;
import com.lunchbox.support.MutableClock;
import com.lunchbox.users.UserDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrderRatingServiceTest {

    private static final Instant DELIVERED_AT = Instant.parse("2026-10-20T06:50:00Z");

    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderQueryService queries = mock(OrderQueryService.class);
    private final UserDirectory users = mock(UserDirectory.class);
    private final OutboxPublisher outbox = mock(OutboxPublisher.class);
    private final MutableClock clock = new MutableClock(DELIVERED_AT.plus(Duration.ofHours(2)));
    private final OrderRatingService service = new OrderRatingService(orders, queries, users, outbox,
            mock(AuditService.class), clock);

    private final UUID parentUser = UUID.randomUUID();
    private final UUID parentId = UUID.randomUUID();
    private final UUID partnerId = UUID.randomUUID();
    private Order order;

    @BeforeEach
    void setUp() {
        when(users.requireParentId(parentUser)).thenReturn(parentId);
        order = Order.manual(UUID.randomUUID(), parentId, UUID.randomUUID(), UUID.randomUUID(), null,
                LocalDate.of(2026, 10, 20), DELIVERED_AT.minusSeconds(7200), DELIVERED_AT.minusSeconds(4800),
                DELIVERED_AT.plusSeconds(600), Geo.point(12.97, 77.59));
        ReflectionTestUtils.setField(order, "id", UUID.randomUUID());
        order.assignPartner(partnerId);
        order.applyTransition(OrderStatus.DELIVERED, null, DELIVERED_AT);
        when(orders.findForUpdate(order.getId())).thenReturn(Optional.of(order));
    }

    @Test
    void ratesADeliveredOrderAndPublishesTheEvent() {
        service.rate(parentUser, order.getId(), new RateOrderRequest(5, "  Right on time  "));

        assertThat(order.getRatingStars()).isEqualTo(5);
        assertThat(order.getRatingComment()).isEqualTo("Right on time");
        verify(outbox).publish("Order", order.getId(), Messaging.RATING_SUBMITTED,
                new OrderRated(order.getId(), partnerId, 5, clock.instant()));
    }

    @Test
    void anotherParentsOrderLooksLikeItDoesNotExist() {
        UUID otherUser = UUID.randomUUID();
        when(users.requireParentId(otherUser)).thenReturn(UUID.randomUUID());

        assertThatThrownBy(() -> service.rate(otherUser, order.getId(), new RateOrderRequest(1, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("not_found");
        assertThat(order.getRatingStars()).isNull();
    }

    @Test
    void onlyDeliveredOrdersCanBeRated() {
        Order pending = Order.manual(UUID.randomUUID(), parentId, UUID.randomUUID(), UUID.randomUUID(), null,
                LocalDate.of(2026, 10, 21), DELIVERED_AT, DELIVERED_AT.plusSeconds(1800), DELIVERED_AT.plusSeconds(3600),
                Geo.point(12.97, 77.59));
        ReflectionTestUtils.setField(pending, "id", UUID.randomUUID());
        when(orders.findForUpdate(pending.getId())).thenReturn(Optional.of(pending));

        assertThatThrownBy(() -> service.rate(parentUser, pending.getId(), new RateOrderRequest(4, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("not_delivered");
    }

    @Test
    void aSecondRatingIsAConflict() {
        service.rate(parentUser, order.getId(), new RateOrderRequest(4, null));

        assertThatThrownBy(() -> service.rate(parentUser, order.getId(), new RateOrderRequest(1, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("already_rated");
        assertThat(order.getRatingStars()).isEqualTo(4);
    }

    @Test
    void theWindowClosesSevenDaysAfterDelivery() {
        clock.set(DELIVERED_AT.plus(OrderRatingService.RATING_WINDOW));

        assertThatThrownBy(() -> service.rate(parentUser, order.getId(), new RateOrderRequest(3, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("rating_window_closed");
        verify(outbox, never()).publish(anyString(), any(), anyString(), any());
        assertThat(OrderRatingService.canRate(order, DELIVERED_AT.plus(Duration.ofDays(6)))).isTrue();
    }
}
