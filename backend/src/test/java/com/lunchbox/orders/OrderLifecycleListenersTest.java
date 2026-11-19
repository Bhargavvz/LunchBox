package com.lunchbox.orders;

import com.lunchbox.schools.SchoolDirectory.WorkingDaysChanged;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OrderLifecycleListenersTest {

    private static final Instant NOW = Instant.parse("2026-11-02T04:00:00Z"); // Monday 09:30 IST
    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderCommands commands = mock(OrderCommands.class);
    private final OrderLifecycleListeners listeners = new OrderLifecycleListeners(orders, commands,
            Clock.fixed(NOW, ZoneOffset.UTC));
    private final UUID school = UUID.randomUUID();

    @Test
    void removingSaturdayCancelsUpcomingSaturdayOrdersOnly() {
        Order saturday = order(LocalDate.of(2026, 11, 7));
        Order friday = order(LocalDate.of(2026, 11, 6));
        when(orders.findBySchoolIdAndScheduledDateGreaterThanEqualAndStatusIn(eq(school), eq(LocalDate.of(2026, 11, 2)), any()))
                .thenReturn(List.of(saturday, friday));

        listeners.onWorkingDaysChanged(new WorkingDaysChanged(school, EnumSet.of(DayOfWeek.SATURDAY), Set.of()));

        verify(commands).cancelIfPrePickup(saturday.getId(), "School is closed on Saturday");
        verify(commands, never()).cancelIfPrePickup(eq(friday.getId()), anyString());
    }

    @Test
    void addingADayCancelsNothing() {
        listeners.onWorkingDaysChanged(new WorkingDaysChanged(school, Set.of(), EnumSet.of(DayOfWeek.SATURDAY)));

        verifyNoInteractions(orders, commands);
    }

    private static Order order(LocalDate date) {
        Order o = mock(Order.class);
        when(o.getId()).thenReturn(UUID.randomUUID());
        when(o.getScheduledDate()).thenReturn(date);
        return o;
    }
}
