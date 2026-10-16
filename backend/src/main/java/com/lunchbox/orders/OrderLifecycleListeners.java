package com.lunchbox.orders;

import com.lunchbox.schools.SchoolDirectory.HolidayDeclared;
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

    OrderLifecycleListeners(OrderRepository orders, OrderCommands commands) {
        this.orders = orders;
        this.commands = commands;
    }

    @EventListener
    public void onHoliday(HolidayDeclared event) {
        List<Order> affected = orders.findBySchoolIdAndScheduledDateAndStatusIn(event.schoolId(), event.date(),
                EnumSet.copyOf(OrderStatus.PRE_PICKUP));
        affected.forEach(o -> commands.cancelIfPrePickup(o.getId(), "School holiday: " + event.reason()));
        log.info("Holiday at school {} on {} cancelled {} orders", event.schoolId(), event.date(), affected.size());
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
