package com.lunchbox.subscriptions;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Public read API of the subscriptions module. */
public interface SubscriptionQueries {

    /** Active subscriptions whose date range covers {@code date} and that include its weekday. */
    List<ScheduleEntry> schedulesFor(LocalDate date);

    Set<UUID> childrenOnLeave(LocalDate date);

    record ScheduleEntry(UUID subscriptionId, UUID childId, UUID parentId, UUID addressId, Set<DayOfWeek> daysOfWeek) {
    }
}
