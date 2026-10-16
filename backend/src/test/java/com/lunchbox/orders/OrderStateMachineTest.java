package com.lunchbox.orders;

import com.lunchbox.common.error.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.EnumSet;
import java.util.Set;

import static com.lunchbox.orders.OrderStatus.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OrderStateMachineTest {

    @Test
    void happyPathIsAllowed() {
        OrderStatus[] path = {SCHEDULED, ASSIGNED, PARTNER_EN_ROUTE, PICKED_UP, IN_TRANSIT, AT_SCHOOL, DELIVERED};
        for (int i = 0; i < path.length - 1; i++) {
            assertThat(OrderStateMachine.canTransition(path[i], path[i + 1]))
                    .as("%s -> %s", path[i], path[i + 1]).isTrue();
        }
    }

    @ParameterizedTest
    @EnumSource(value = OrderStatus.class, names = {"SCHEDULED", "ASSIGNED", "REASSIGNED", "PARTNER_EN_ROUTE"})
    void everyPrePickupStateCanBeCancelled(OrderStatus from) {
        assertThat(OrderStateMachine.canTransition(from, CANCELLED)).isTrue();
    }

    @ParameterizedTest
    @EnumSource(value = OrderStatus.class, names = {"PICKED_UP", "IN_TRANSIT", "AT_SCHOOL", "DELIVERED",
            "PICKUP_FAILED", "DELIVERY_FAILED", "CANCELLED"})
    void cannotCancelOnceCollectedOrFinished(OrderStatus from) {
        assertThat(OrderStateMachine.canTransition(from, CANCELLED)).isFalse();
    }

    @Test
    void pickupFailureOnlyFromEnRoute() {
        for (OrderStatus from : OrderStatus.values()) {
            assertThat(OrderStateMachine.canTransition(from, PICKUP_FAILED)).isEqualTo(from == PARTNER_EN_ROUTE);
        }
    }

    @Test
    void deliveryFailureOnlyFromInTransitOrAtSchool() {
        Set<OrderStatus> allowed = EnumSet.of(IN_TRANSIT, AT_SCHOOL);
        for (OrderStatus from : OrderStatus.values()) {
            assertThat(OrderStateMachine.canTransition(from, DELIVERY_FAILED)).isEqualTo(allowed.contains(from));
        }
    }

    @Test
    void reassignmentLoopsBackToAssigned() {
        assertThat(OrderStateMachine.canTransition(ASSIGNED, REASSIGNED)).isTrue();
        assertThat(OrderStateMachine.canTransition(REASSIGNED, ASSIGNED)).isTrue();
        assertThat(OrderStateMachine.canTransition(SCHEDULED, REASSIGNED)).isFalse();
    }

    @ParameterizedTest
    @EnumSource(value = OrderStatus.class, names = {"DELIVERED", "CANCELLED", "PICKUP_FAILED", "DELIVERY_FAILED"})
    void terminalStatesHaveNoExits(OrderStatus terminal) {
        assertThat(OrderStateMachine.allowedFrom(terminal)).isEmpty();
        assertThat(terminal.isTerminal()).isTrue();
    }

    @Test
    void cannotSkipSteps() {
        assertThat(OrderStateMachine.canTransition(SCHEDULED, PICKED_UP)).isFalse();
        assertThat(OrderStateMachine.canTransition(ASSIGNED, DELIVERED)).isFalse();
        assertThat(OrderStateMachine.canTransition(PICKED_UP, AT_SCHOOL)).isFalse();
        assertThat(OrderStateMachine.canTransition(IN_TRANSIT, DELIVERED)).isFalse();
    }

    @Test
    void illegalTransitionThrowsConflict() {
        assertThatThrownBy(() -> OrderStateMachine.assertTransition(DELIVERED, PICKED_UP, null))
                .isInstanceOf(OrderStateMachine.IllegalTransitionException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("illegal_transition");
    }

    @Test
    void failuresAndCancellationsRequireReason() {
        assertThatThrownBy(() -> OrderStateMachine.assertTransition(IN_TRANSIT, DELIVERY_FAILED, " "))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("reason_required");
        assertThatThrownBy(() -> OrderStateMachine.assertTransition(SCHEDULED, CANCELLED, null))
                .isInstanceOf(ApiException.class);
        OrderStateMachine.assertTransition(IN_TRANSIT, DELIVERY_FAILED, "School gate closed");
    }

    @Test
    void everyStatusHasATransitionTableEntry() {
        for (OrderStatus s : OrderStatus.values()) {
            assertThat(OrderStateMachine.allowedFrom(s)).isNotNull();
        }
    }
}
