package com.lunchbox.schools;

import com.lunchbox.common.persistence.BaseEntity;
import com.lunchbox.common.persistence.DaysOfWeekConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.Set;

@Getter
@Setter(AccessLevel.PACKAGE)
@Entity
@Table(name = "schools")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class School extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(name = "address_line", nullable = false)
    private String addressLine;

    @Column(nullable = false)
    private String city;

    @Column(nullable = false)
    private String pincode;

    @Column(nullable = false, columnDefinition = "geometry(Point,4326)")
    private Point location;

    @Column(columnDefinition = "geometry(Polygon,4326)")
    private Polygon geofence;

    @Column(name = "geofence_radius_m")
    private Integer geofenceRadiusM;

    @Column(name = "lunch_time", nullable = false)
    private LocalTime lunchTime;

    @Column(name = "delivery_window_start", nullable = false)
    private LocalTime deliveryWindowStart;

    @Column(name = "delivery_window_end", nullable = false)
    private LocalTime deliveryWindowEnd;

    @Convert(converter = DaysOfWeekConverter.class)
    @Column(name = "working_days", nullable = false)
    private Set<DayOfWeek> workingDays = EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY, DayOfWeek.FRIDAY);

    @Column(name = "contact_name")
    private String contactName;

    @Column(name = "contact_phone")
    private String contactPhone;

    @Column(name = "handover_instructions")
    private String handoverInstructions;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    static School create(String code) {
        School s = new School();
        s.code = code;
        return s;
    }

    void softDelete(Instant at) {
        this.deletedAt = at;
        this.active = false;
    }
}
