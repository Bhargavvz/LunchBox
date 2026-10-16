package com.lunchbox.dispatch;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Getter
@Entity
@Table(name = "partner_shifts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PartnerShift extends BaseEntity {

    public enum Status { SCHEDULED, ACTIVE, ENDED, NO_SHOW, CANCELLED }

    @Column(name = "partner_id", nullable = false, updatable = false)
    private UUID partnerId;

    @Column(name = "shift_date", nullable = false, updatable = false)
    private LocalDate shiftDate;

    @Column(name = "planned_start", nullable = false)
    private Instant plannedStart;

    @Column(name = "planned_end", nullable = false)
    private Instant plannedEnd;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.SCHEDULED;

    @Column(name = "start_location", columnDefinition = "geometry(Point,4326)")
    private Point startLocation;

    PartnerShift(UUID partnerId, LocalDate shiftDate, Instant plannedStart, Instant plannedEnd) {
        this.partnerId = partnerId;
        this.shiftDate = shiftDate;
        reschedule(plannedStart, plannedEnd);
    }

    void reschedule(Instant start, Instant end) {
        this.plannedStart = start;
        this.plannedEnd = end;
    }

    void start(Instant at, Point location) {
        this.status = Status.ACTIVE;
        this.startedAt = at;
        this.startLocation = location;
    }

    void end(Instant at) {
        this.status = Status.ENDED;
        this.endedAt = at;
    }

    void noShow() {
        this.status = Status.NO_SHOW;
    }

    void cancel() {
        this.status = Status.CANCELLED;
    }

    /** Partners who are working or expected to work today and can take orders. */
    public boolean isAvailable() {
        return status == Status.SCHEDULED || status == Status.ACTIVE;
    }
}
