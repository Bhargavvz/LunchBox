package com.lunchbox.orders;

import com.lunchbox.common.time.TimeZones;
import com.lunchbox.schools.SchoolDirectory.HolidayDeclared;
import com.lunchbox.schools.SchoolDirectory.WorkingDaysChanged;
import com.lunchbox.subscriptions.SubscriptionEvents.LeaveDayAdded;
import com.lunchbox.subscriptions.SubscriptionEvents.SubscriptionEnded;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.List;

/**
 * Reacts to calendar and subscription changes from other modules by cancelling affected orders that have not been
 * picked up yet. Runs synchronously inside the publisher's transaction so both changes commit together.
 */
@Slf4j
@Component
class OrderLifecycleListeners {

    private final OrderRepository orders;
    private final OrderCommands commands;
    private final java.time.Clock clock;

    OrderLifecycleListeners(OrderRepository orders, OrderCommands commands, java.time.Clock clock) {
        this.orders = orders;
        this.commands = commands;
        this.clock = clock;
    }

    @EventListener
    public void onHoliday(HolidayDeclared event) {
        List<Order> affected = orders.findBySchoolIdAndScheduledDateAndStatusIn(event.schoolId(), event.date(),
                EnumSet.copyOf(OrderStatus.PRE_PICKUP));
        affected.forEach(o -> commands.cancelIfPrePickup(o.getId(), "School holiday: " + event.reason()));
        log.info("Holiday at school {} on {} cancelled {} orders", event.schoolId(), event.date(), affected.size());
    }

    @EventListener
    public void onWorkingDaysChanged(WorkingDaysChanged event) {
        if (event.removed().isEmpty()) {
            return;
        }
        List<Order> affected = orders.findBySchoolIdAndScheduledDateGreaterThanEqualAndStatusIn(event.schoolId(),
                        TimeZones.todayIst(clock), EnumSet.copyOf(OrderStatus.PRE_PICKUP)).stream()
                .filter(o -> event.removed().contains(o.getScheduledDate().getDayOfWeek()))
                .toList();
        affected.forEach(o -> commands.cancelIfPrePickup(o.getId(), "School is closed on "
                + o.getScheduledDate().getDayOfWeek().getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH)));
        log.info("School {} closed on {}: cancelled {} orders", event.schoolId(), event.removed(), affected.size());
    }

    @EventListener
    public void onLeave(LeaveDayAdded event) {
        orders.findByChildIdAndScheduledDate(event.childId(), event.date())
                .filter(o -> o.getStatus().isPrePickup())
                .ifPresent(o -> commands.cancelIfPrePickup(o.getId(), "Parent marked leave"));
    }

    @EventListener
    public void onSubscriptionEnded(SubscriptionEnded event) {
        orders.findBySubscriptionIdAndScheduledDateGreaterThanEqualAndStatusIn(event.subscriptionId(), event.from(),
                        EnumSet.copyOf(OrderStatus.PRE_PICKUP))
                .forEach(o -> commands.cancelIfPrePickup(o.getId(), "Subscription ended: " + event.reason()));
    }
}
