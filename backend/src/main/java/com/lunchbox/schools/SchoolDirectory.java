package com.lunchbox.schools;

import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Public API of the schools module. */
public interface SchoolDirectory {

    Optional<SchoolInfo> find(UUID schoolId);

    SchoolInfo require(UUID schoolId);

    Map<UUID, SchoolInfo> findAll(Collection<UUID> schoolIds);

    List<SchoolInfo> activeSchools();

    /** Whether the school serves lunch on this date (working weekday and not a holiday). */
    boolean isSchoolDay(UUID schoolId, LocalDate date);

    record SchoolInfo(
            UUID id,
            String name,
            String addressLine,
            Point location,
            Polygon geofence,
            Integer geofenceRadiusM,
            LocalTime lunchTime,
            LocalTime deliveryWindowStart,
            LocalTime deliveryWindowEnd,
            Set<DayOfWeek> workingDays,
            String handoverInstructions,
            boolean active) {
    }

    /** Published (in-process, same transaction) when a holiday is declared so orders for that day are cancelled. */
    record HolidayDeclared(UUID schoolId, LocalDate date, String reason) {
    }
}
