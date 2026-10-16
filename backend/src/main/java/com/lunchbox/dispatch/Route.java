package com.lunchbox.dispatch;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Getter
@Entity
@Table(name = "routes")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Route extends BaseEntity {

    public enum Status { PLANNED, ACTIVE, COMPLETED, CANCELLED }

    @Column(name = "partner_id", nullable = false, updatable = false)
    private UUID partnerId;

    @Column(name = "route_date", nullable = false, updatable = false)
    private LocalDate routeDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PLANNED;

    @Column(nullable = false)
    private String optimizer;

    @Column(name = "total_distance_m", nullable = false)
    private int totalDistanceM;

    @Column(name = "total_duration_s", nullable = false)
    private int totalDurationS;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Version
    private long version;

    Route(UUID partnerId, LocalDate routeDate) {
        this.partnerId = partnerId;
        this.routeDate = routeDate;
        this.optimizer = "none";
    }

    void planned(String optimizer, int distanceM, int durationS) {
        this.optimizer = optimizer;
        this.totalDistanceM = distanceM;
        this.totalDurationS = durationS;
        if (status == Status.CANCELLED || status == Status.COMPLETED) {
            this.status = Status.PLANNED;
        }
    }

    void start(Instant at) {
        this.status = Status.ACTIVE;
        this.startedAt = at;
    }

    void complete(Instant at) {
        this.status = Status.COMPLETED;
        this.completedAt = at;
    }

    void cancel() {
        this.status = Status.CANCELLED;
    }
}
