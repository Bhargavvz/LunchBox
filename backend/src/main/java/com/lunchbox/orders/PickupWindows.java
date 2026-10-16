package com.lunchbox.orders;

import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/** Derives an order's pickup window and delivery deadline from the school's delivery window and settings. */
@Component
public class PickupWindows {

    private final PlatformSettings settings;
    private final Clock clock;

    public PickupWindows(PlatformSettings settings, Clock clock) {
        this.settings = settings;
        this.clock = clock;
    }

    public record Window(Instant pickupStart, Instant pickupEnd, Instant deliveryDeadline) {
    }

    public Window forSchool(SchoolInfo school, LocalDate date) {
        Instant deliveryOpens = TimeZones.atIst(date, school.deliveryWindowStart());
        Instant deadline = TimeZones.atIst(date, school.deliveryWindowEnd());
        Instant pickupStart = deliveryOpens.minusSeconds(settings.pickupLeadMinutes() * 60L);
        Instant pickupEnd = pickupStart.plusSeconds(settings.pickupWindowMinutes() * 60L);
        if (pickupEnd.isAfter(deadline)) {
            pickupEnd = deadline;
        }
        return new Window(pickupStart, pickupEnd, deadline);
    }

    /**
     * The first date whose orders are still open for changes: tomorrow if we are before today's cut-off,
     * otherwise the day after tomorrow.
     */
    public LocalDate firstOpenDate() {
        LocalDateTime nowIst = LocalDateTime.now(clock.withZone(TimeZones.IST));
        LocalTime cutoff = settings.orderCutoffTime();
        LocalDate tomorrow = nowIst.toLocalDate().plusDays(1);
        return nowIst.toLocalTime().isBefore(cutoff) ? tomorrow : tomorrow.plusDays(1);
    }

    /** True once today's cut-off has passed, i.e. tomorrow's orders are frozen and may be generated. */
    public boolean pastCutoffToday() {
        LocalTime nowIst = LocalTime.now(clock.withZone(TimeZones.IST));
        return !nowIst.isBefore(settings.orderCutoffTime());
    }
}
