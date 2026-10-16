package com.lunchbox.common.time;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

/** Everything is stored in UTC; business rules (cut-offs, school days) are evaluated in India time. */
public final class TimeZones {

    public static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private TimeZones() {
    }

    public static LocalDate todayIst(Clock clock) {
        return LocalDate.now(clock.withZone(IST));
    }

    public static Instant atIst(LocalDate date, LocalTime time) {
        return date.atTime(time).atZone(IST).toInstant();
    }

    public static LocalDate dateIst(Instant instant) {
        return instant.atZone(IST).toLocalDate();
    }
}
