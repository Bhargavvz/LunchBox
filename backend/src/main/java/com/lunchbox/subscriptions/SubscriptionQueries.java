package com.lunchbox.subscriptions;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Public read API of the subscriptions module. */
public interface SubscriptionQueries {

    /** Active subscriptions whose date range covers {@code date} and that include its weekday. */
    List<ScheduleEntry> schedulesFor(LocalDate date);

    Set<UUID> childrenOnLeave(LocalDate date);

    /** The subscriptions whose plan includes priority delivery (assigned first when riders are short). */
    Set<UUID> priorityDeliverySubscriptions(Collection<UUID> subscriptionIds);

    /** Whether the order's plan includes live tracking (true when unknown or not set). */
    boolean liveTrackingIncluded(UUID subscriptionId);

    /** The child's current (live) plan, if any. */
    Optional<ChildPlan> currentPlan(UUID childId);

    /** Leave days marked for the child in [from, to]. */
    Set<LocalDate> leaveDays(UUID childId, LocalDate from, LocalDate to);

    record ChildPlan(UUID subscriptionId, String planName, String status, Set<DayOfWeek> daysOfWeek, LocalDate startDate,
                     LocalDate endDate, java.time.Instant paidUntil, java.time.Instant trialEndsAt) {
    }

    record ScheduleEntry(UUID subscriptionId, UUID childId, UUID parentId, UUID addressId, Set<DayOfWeek> daysOfWeek) {
    }
}
