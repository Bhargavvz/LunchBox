package com.lunchbox.orders;

import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.orders.web.OrderDtos.CalendarDay;
import com.lunchbox.orders.web.OrderDtos.DayState;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import com.lunchbox.subscriptions.SubscriptionQueries.ChildPlan;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class ChildCalendarServiceTest {

    // Monday 2 November 2026 … Sunday 8 November 2026
    private static final LocalDate MON = LocalDate.of(2026, 11, 2);
    private static final LocalDate SAT = MON.plusDays(5);
    private static final LocalDate SUN = MON.plusDays(6);
    private static final LocalDate FIRST_OPEN = MON;

    private static SchoolInfo school(Set<DayOfWeek> days) {
        return new SchoolInfo(UUID.randomUUID(), "Greenwood", "Road 12", Geo.point(17.41, 78.43), null, 150,
                LocalTime.of(12, 30), LocalTime.of(11, 30), LocalTime.of(12, 15), days, null, true);
    }

    private static ChildPlan plan(Set<DayOfWeek> days, String status) {
        return new ChildPlan(UUID.randomUUID(), "Monthly", status, days, MON.minusDays(10), null,
                TimeZones.atIst(MON.plusDays(30), LocalTime.MIDNIGHT), null);
    }

    private static CalendarDay day(LocalDate d, SchoolInfo s, ChildPlan p) {
        return ChildCalendarService.day(d, s, p, Set.of(), Map.of(), null, FIRST_OPEN);
    }

    @Test
    void saturdayIsAPickupOnlyWhenTheSchoolWorksAndThePlanIncludesIt() {
        Set<DayOfWeek> sixDays = EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.SATURDAY);
        Set<DayOfWeek> fiveDays = EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY);

        assertThat(day(SAT, school(sixDays), plan(sixDays, "ACTIVE")).state()).isEqualTo(DayState.PICKUP);
        assertThat(day(SAT, school(sixDays), plan(fiveDays, "ACTIVE")).state()).isEqualTo(DayState.NOT_A_PLAN_DAY);
        assertThat(day(SAT, school(fiveDays), plan(sixDays, "ACTIVE")).state()).isEqualTo(DayState.NO_SCHOOL);
        assertThat(day(SUN, school(sixDays), plan(sixDays, "ACTIVE")).state()).isEqualTo(DayState.NO_SCHOOL);
    }

    static Stream<Set<DayOfWeek>> everyWorkingDayCombination() {
        // All 127 non-empty sets of weekdays.
        return java.util.stream.IntStream.range(1, 128).mapToObj(mask -> {
            Set<DayOfWeek> s = EnumSet.noneOf(DayOfWeek.class);
            for (DayOfWeek d : DayOfWeek.values()) {
                if ((mask & (1 << (d.getValue() - 1))) != 0) {
                    s.add(d);
                }
            }
            return s;
        });
    }

    @ParameterizedTest
    @MethodSource("everyWorkingDayCombination")
    void forEveryCombinationOfWorkingDaysAPickupFallsExactlyOnWorkingPlanDays(Set<DayOfWeek> working) {
        SchoolInfo s = school(working);
        ChildPlan p = plan(EnumSet.allOf(DayOfWeek.class), "ACTIVE");
        for (int i = 0; i < 7; i++) {
            LocalDate d = MON.plusDays(i);
            DayState expected = working.contains(d.getDayOfWeek()) ? DayState.PICKUP : DayState.NO_SCHOOL;
            assertThat(day(d, s, p).state()).as(d.getDayOfWeek() + " with " + working).isEqualTo(expected);
        }
    }

    @Test
    void holidaysLeaveExistingOrdersAndPaymentAreShown() {
        SchoolInfo s = school(EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY));
        ChildPlan p = plan(EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY), "ACTIVE");

        CalendarDay holiday = ChildCalendarService.day(MON, s, p, Set.of(), Map.of(MON, "Diwali"), null, FIRST_OPEN);
        assertThat(holiday.state()).isEqualTo(DayState.HOLIDAY);
        assertThat(holiday.note()).isEqualTo("Diwali");

        CalendarDay leave = ChildCalendarService.day(MON.plusDays(1), s, p, Set.of(MON.plusDays(1)), Map.of(), null, FIRST_OPEN);
        assertThat(leave.state()).isEqualTo(DayState.LEAVE);
        assertThat(leave.editable()).isTrue();

        CalendarDay closed = ChildCalendarService.day(MON.minusDays(7), s, p, Set.of(), Map.of(), null, FIRST_OPEN);
        assertThat(closed.editable()).isFalse();

        ChildPlan unpaid = plan(p.daysOfWeek(), "HALTED");
        assertThat(day(MON, s, unpaid).state()).isEqualTo(DayState.RENEW_TO_CONTINUE);

        assertThat(day(MON, s, null).state()).isEqualTo(DayState.NO_PLAN);
    }

    @Test
    void daysAfterThePaidPeriodAskForARenewal() {
        SchoolInfo s = school(EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY));
        ChildPlan p = new ChildPlan(UUID.randomUUID(), "Monthly", "ACTIVE", EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY),
                MON.minusDays(20), null, TimeZones.atIst(MON.plusDays(2), LocalTime.MIDNIGHT), null);

        assertThat(day(MON.plusDays(1), s, p).state()).isEqualTo(DayState.PICKUP);
        assertThat(day(MON.plusDays(2), s, p).state()).isEqualTo(DayState.RENEW_TO_CONTINUE);
    }

    @Test
    void anExistingOrderWins() {
        SchoolInfo s = school(EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY));
        Order order = org.mockito.Mockito.mock(Order.class);
        org.mockito.Mockito.when(order.getStatus()).thenReturn(OrderStatus.CANCELLED);
        org.mockito.Mockito.when(order.getCancelReason()).thenReturn("Parent marked leave");
        org.mockito.Mockito.when(order.getId()).thenReturn(UUID.randomUUID());

        CalendarDay d = ChildCalendarService.day(MON, s, null, Set.of(), Map.of(), order, FIRST_OPEN);

        assertThat(d.state()).isEqualTo(DayState.ORDER);
        assertThat(d.orderStatus()).isEqualTo(OrderStatus.CANCELLED);
        assertThat(d.note()).isEqualTo("Parent marked leave");
        assertThat(List.of(d.editable())).containsExactly(false);
    }
}
