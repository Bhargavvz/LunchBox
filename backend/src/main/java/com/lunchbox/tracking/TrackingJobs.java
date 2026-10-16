package com.lunchbox.tracking;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.tracking.LiveLocationStore.BufferedPing;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.sql.Types;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

/**
 * Persists buffered pings in batches (the hot path never writes to Postgres) and maintains daily partitions:
 * creates the coming week's and drops those beyond the retention period (DPDP purpose limitation).
 */
@Slf4j
@Component
public class TrackingJobs {

    private static final int BATCH = 5_000;

    private final LiveLocationStore store;
    private final JdbcTemplate jdbc;
    private final LunchBoxProperties.Tracking config;
    private final MeterRegistry meters;
    private final Clock clock;

    public TrackingJobs(LiveLocationStore store, JdbcTemplate jdbc, LunchBoxProperties properties, MeterRegistry meters,
                        Clock clock) {
        this.store = store;
        this.jdbc = jdbc;
        this.config = properties.tracking();
        this.meters = meters;
        this.clock = clock;
    }

    /** Every instance drains concurrently; LPOP with a count is atomic so no ping is written twice. */
    @Scheduled(fixedDelayString = "${lunchbox.tracking.flush-interval}")
    public void flushPings() {
        int total = 0;
        List<BufferedPing> batch;
        do {
            batch = store.drain(BATCH);
            if (!batch.isEmpty()) {
                insert(batch);
                total += batch.size();
            }
        } while (batch.size() == BATCH);
        if (total > 0) {
            meters.counter("lunchbox.tracking.pings_persisted").increment(total);
            log.debug("Persisted {} location pings", total);
        }
    }

    private void insert(List<BufferedPing> batch) {
        jdbc.batchUpdate("""
                INSERT INTO location_pings (id, partner_id, route_id, location, accuracy_m, speed_mps, heading_deg,
                                            battery_pct, recorded_at, received_at)
                VALUES (?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, ?, ?, ?, ?)
                ON CONFLICT DO NOTHING
                """, batch, 1000, (ps, p) -> {
            ps.setObject(1, p.id());
            ps.setObject(2, p.partnerId());
            ps.setObject(3, p.routeId());
            ps.setDouble(4, p.lng());
            ps.setDouble(5, p.lat());
            setNullable(ps, 6, p.accuracyM());
            setNullable(ps, 7, p.speedMps());
            setNullable(ps, 8, p.headingDeg());
            if (p.batteryPct() == null) {
                ps.setNull(9, Types.INTEGER);
            } else {
                ps.setInt(9, p.batteryPct());
            }
            ps.setTimestamp(10, Timestamp.from(p.recordedAt()));
            ps.setTimestamp(11, Timestamp.from(p.receivedAt()));
        });
    }

    private static void setNullable(java.sql.PreparedStatement ps, int idx, Double v) throws java.sql.SQLException {
        if (v == null) {
            ps.setNull(idx, Types.DOUBLE);
        } else {
            ps.setDouble(idx, v);
        }
    }

    @Scheduled(cron = "${lunchbox.jobs.partition-cron}", zone = "UTC")
    @SchedulerLock(name = "locationPingPartitions", lockAtMostFor = "PT10M")
    public void maintainPartitions() {
        LocalDate today = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        for (int i = 0; i <= 7; i++) {
            jdbc.execute("SELECT ensure_location_ping_partition(DATE '" + today.plusDays(i) + "')");
        }
        LocalDate cutoff = today.minusDays(config.retentionDays());
        Integer dropped = jdbc.queryForObject("SELECT drop_location_ping_partitions_before(?)", Integer.class, cutoff);
        log.info("Location ping partitions ensured to {}; dropped {} older than {}", today.plusDays(7), dropped, cutoff);
    }
}
