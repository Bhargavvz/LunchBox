package com.lunchbox.orders;

import com.lunchbox.children.ChildDirectory;
import com.lunchbox.children.ChildDirectory.ChildInfo;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.orders.web.OrderDtos.CalendarDay;
import com.lunchbox.orders.web.OrderDtos.ChildCalendarResponse;
import com.lunchbox.orders.web.OrderDtos.DayState;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import com.lunchbox.subscriptions.SubscriptionQueries;
import com.lunchbox.subscriptions.SubscriptionQueries.ChildPlan;
import com.lunchbox.users.UserDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * A child's pickup calendar, worked out by the same rules that create orders (school working days and holidays, the
 * plan's days and dates, leave, paid period), so what the parent sees is what will happen. Days that already have an
 * order show that order's status.
 */
@Service
public class ChildCalendarService {

    private static final int MAX_DAYS = 62;

    private final UserDirectory users;
    private final ChildDirectory children;
    private final SchoolDirectory schools;
    private final SubscriptionQueries subscriptions;
    private final OrderRepository orders;
    private final PickupWindows windows;

    public ChildCalendarService(UserDirectory users, ChildDirectory children, SchoolDirectory schools,
                                SubscriptionQueries subscriptions, OrderRepository orders, PickupWindows windows) {
        this.users = users;
        this.children = children;
        this.schools = schools;
        this.subscriptions = subscriptions;
        this.orders = orders;
        this.windows = windows;
    }

    @Transactional(readOnly = true)
    public ChildCalendarResponse calendar(UUID parentUserId, UUID childId, LocalDate from, LocalDate to) {
        if (to.isBefore(from) || from.plusDays(MAX_DAYS).isBefore(to)) {
            throw Errors.badRequest("invalid_range", "Choose a range of at most " + MAX_DAYS + " days.");
        }
        UUID parentId = users.requireParentId(parentUserId);
        ChildInfo child = children.requireOwned(childId, parentId);
        SchoolInfo school = schools.require(child.schoolId());
        Optional<ChildPlan> plan = subscriptions.currentPlan(childId);
        Set<LocalDate> leave = subscriptions.leaveDays(childId, from, to);
        Map<LocalDate, String> holidays = schools.holidaysBetween(school.id(), from, to).stream()
                .collect(Collectors.toMap(SchoolDirectory.Holiday::date, SchoolDirectory.Holiday::reason, (a, b) -> a));
        Map<LocalDate, Order> existing = orders.findByChildIdAndScheduledDateBetween(childId, from, to).stream()
                .collect(Collectors.toMap(Order::getScheduledDate, Function.identity(), (a, b) -> a));
        LocalDate firstOpen = windows.firstOpenDate();
        PickupWindows.DailyWindow daily = windows.daily(school.deliveryWindowStart(), school.deliveryWindowEnd());

        List<CalendarDay> days = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            days.add(day(d, school, plan.orElse(null), leave, holidays, existing.get(d), firstOpen));
        }
        return new ChildCalendarResponse(childId, school.id(), school.name(), firstOpen, daily.pickupStart(),
                daily.pickupEnd(), school.deliveryWindowEnd(), school.workingDays(),
                plan.map(p -> p.planName()).orElse(null), plan.map(p -> p.status()).orElse(null),
                plan.map(ChildPlan::daysOfWeek).orElse(Set.of()), days);
    }

    static CalendarDay day(LocalDate d, SchoolInfo school, ChildPlan plan, Set<LocalDate> leave,
                           Map<LocalDate, String> holidays, Order order, LocalDate firstOpen) {
        boolean open = !d.isBefore(firstOpen);
        if (order != null) {
            String note = order.getStatus() == OrderStatus.CANCELLED ? order.getCancelReason() : null;
            return new CalendarDay(d, DayState.ORDER, order.getId(), order.getStatus(), note, false);
        }
        if (holidays.containsKey(d)) {
            return new CalendarDay(d, DayState.HOLIDAY, null, null, holidays.get(d), false);
        }
        if (!school.active() || !school.workingDays().contains(d.getDayOfWeek())) {
            return new CalendarDay(d, DayState.NO_SCHOOL, null, null, null, false);
        }
        if (plan == null) {
            return new CalendarDay(d, DayState.NO_PLAN, null, null, null, false);
        }
        if (d.isBefore(plan.startDate())) {
            return new CalendarDay(d, DayState.BEFORE_START, null, null, null, false);
        }
        if (plan.endDate() != null && d.isAfter(plan.endDate())) {
            return new CalendarDay(d, DayState.PLAN_ENDED, null, null, null, false);
        }
        if (!plan.daysOfWeek().contains(d.getDayOfWeek())) {
            return new CalendarDay(d, DayState.NOT_A_PLAN_DAY, null, null, null, false);
        }
        if (leave.contains(d)) {
            return new CalendarDay(d, DayState.LEAVE, null, null, null, open);
        }
        Instant dayStart = TimeZones.atIst(d, LocalTime.MIDNIGHT);
        boolean unpaid = "PENDING_PAYMENT".equals(plan.status()) || "HALTED".equals(plan.status())
                || (plan.paidUntil() != null && !plan.paidUntil().isAfter(dayStart));
        if (unpaid) {
            return new CalendarDay(d, DayState.RENEW_TO_CONTINUE, null, null, null, open);
        }
        return new CalendarDay(d, DayState.PICKUP, null, null, null, open);
    }
}
