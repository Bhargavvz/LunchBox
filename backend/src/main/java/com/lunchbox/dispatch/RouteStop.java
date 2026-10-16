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
import java.util.UUID;

@Getter
@Entity
@Table(name = "route_stops")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RouteStop extends BaseEntity {

    public enum Type { PICKUP, DROP }

    public enum Status { PENDING, ARRIVED, COMPLETED, SKIPPED, FAILED }

    @Column(name = "route_id", nullable = false, updatable = false)
    private UUID routeId;

    @Column(nullable = false)
    private int sequence;

    @Enumerated(EnumType.STRING)
    @Column(name = "stop_type", nullable = false, updatable = false)
    private Type stopType;

    @Column(name = "order_id", updatable = false)
    private UUID orderId;

    @Column(name = "school_id", updatable = false)
    private UUID schoolId;

    @Column(nullable = false, columnDefinition = "geometry(Point,4326)")
    private Point location;

    @Column(name = "planned_eta")
    private Instant plannedEta;

    @Column(name = "arrived_at")
    private Instant arrivedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    static RouteStop pickup(UUID routeId, int sequence, UUID orderId, Point location, Instant eta) {
        RouteStop s = new RouteStop();
        s.routeId = routeId;
        s.sequence = sequence;
        s.stopType = Type.PICKUP;
        s.orderId = orderId;
        s.location = location;
        s.plannedEta = eta;
        return s;
    }

    static RouteStop drop(UUID routeId, int sequence, UUID schoolId, Point location, Instant eta) {
        RouteStop s = new RouteStop();
        s.routeId = routeId;
        s.sequence = sequence;
        s.stopType = Type.DROP;
        s.schoolId = schoolId;
        s.location = location;
        s.plannedEta = eta;
        return s;
    }

    void arrive(Instant at) {
        if (status == Status.PENDING) {
            this.status = Status.ARRIVED;
            this.arrivedAt = at;
        }
    }

    void complete(Instant at) {
        if (arrivedAt == null) {
            arrivedAt = at;
        }
        this.status = Status.COMPLETED;
        this.completedAt = at;
    }

    void fail(Instant at) {
        this.status = Status.FAILED;
        this.completedAt = at;
    }

    void skip(Instant at) {
        this.status = Status.SKIPPED;
        this.completedAt = at;
    }

    public boolean isOpen() {
        return status == Status.PENDING || status == Status.ARRIVED;
    }
}
