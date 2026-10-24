package com.lunchbox.orders;

import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import com.lunchbox.support.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PickupWindowsTest {

    private final PlatformSettings settings = mock(PlatformSettings.class);
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-19T10:00:00Z"));
    private final PickupWindows windows = new PickupWindows(settings, clock);

    @BeforeEach
    void setUp() {
        when(settings.orderCutoffTime()).thenReturn(LocalTime.of(21, 0));
        when(settings.pickupLeadMinutes()).thenReturn(90);
        when(settings.pickupWindowMinutes()).thenReturn(45);
    }

    @Test
    void beforeCutoffTomorrowIsStillOpen() {
        clock.set(Instant.parse("2026-10-19T15:29:59Z")); // 20:59:59 IST
        assertThat(windows.firstOpenDate()).isEqualTo(LocalDate.of(2026, 10, 20));
        assertThat(windows.pastCutoffToday()).isFalse();
    }

    @Test
    void atCutoffTomorrowFreezes() {
        clock.set(Instant.parse("2026-10-19T15:30:00Z")); // 21:00 IST
        assertThat(windows.firstOpenDate()).isEqualTo(LocalDate.of(2026, 10, 21));
        assertThat(windows.pastCutoffToday()).isTrue();
    }

    @Test
    void cutoffUsesTheIndianDateNotUtc() {
        clock.set(Instant.parse("2026-10-19T19:00:00Z")); // 00:30 IST on the 20th
        assertThat(windows.firstOpenDate()).isEqualTo(LocalDate.of(2026, 10, 21));
        assertThat(windows.pastCutoffToday()).isFalse();
    }

    @Test
    void pickupWindowEndsBeforeTheDeliveryDeadline() {
        SchoolInfo school = school(LocalTime.of(12, 0), LocalTime.of(12, 30));
        PickupWindows.Window w = windows.forSchool(school, LocalDate.of(2026, 10, 20));

        assertThat(w.deliveryDeadline()).isEqualTo(Instant.parse("2026-10-20T07:00:00Z")); // 12:30 IST
        assertThat(w.pickupStart()).isEqualTo(Instant.parse("2026-10-20T05:00:00Z"));     // 12:00 − 90 min
        assertThat(w.pickupEnd()).isEqualTo(Instant.parse("2026-10-20T05:45:00Z"));
    }

    @Test
    void pickupEndIsClampedToTheDeadline() {
        when(settings.pickupLeadMinutes()).thenReturn(10);
        when(settings.pickupWindowMinutes()).thenReturn(120);
        SchoolInfo school = school(LocalTime.of(12, 0), LocalTime.of(12, 30));
        PickupWindows.Window w = windows.forSchool(school, LocalDate.of(2026, 10, 20));

        assertThat(w.pickupEnd()).isEqualTo(w.deliveryDeadline());
    }

    private static SchoolInfo school(LocalTime from, LocalTime to) {
        return new SchoolInfo(UUID.randomUUID(), "School", "Road", null, null, 150, LocalTime.of(13, 0), from, to,
                EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY), null, true);
    }
}
