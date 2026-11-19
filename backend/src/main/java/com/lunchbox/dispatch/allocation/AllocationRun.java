package com.lunchbox.dispatch.allocation;

import com.lunchbox.common.persistence.UuidV7;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One run of the allocation engine for a day (append-only once finished). */
@Getter
@Entity
@Table(name = "allocation_runs")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AllocationRun {

    public enum Trigger { SCHEDULED, MANUAL, DECLINE, NO_SHOW, OFFLINE }

    @Id
    private UUID id;

    @Column(name = "run_date", nullable = false)
    private LocalDate runDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Trigger trigger;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    private int considered;
    private int assigned;
    private int unassigned;
    private int riders;

    @Column(name = "total_cost")
    private BigDecimal totalCost;

    @Column(name = "improving_moves")
    private int improvingMoves;

    @Column(name = "solve_ms")
    private int solveMs;

    @Column(name = "travel_source")
    private String travelSource;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String weights;

    AllocationRun(LocalDate runDate, Trigger trigger, UUID actorUserId, String weights, Instant startedAt) {
        this.id = UuidV7.generate();
        this.runDate = runDate;
        this.trigger = trigger;
        this.actorUserId = actorUserId;
        this.weights = weights;
        this.startedAt = startedAt;
    }

    void finish(int considered, int assigned, int unassigned, int riders, double totalCost, int moves, long solveMs,
                String travelSource, Instant at) {
        this.considered = considered;
        this.assigned = assigned;
        this.unassigned = unassigned;
        this.riders = riders;
        this.totalCost = BigDecimal.valueOf(totalCost);
        this.improvingMoves = moves;
        this.solveMs = (int) Math.min(Integer.MAX_VALUE, solveMs);
        this.travelSource = travelSource;
        this.finishedAt = at;
    }
}
