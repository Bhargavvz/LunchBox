package com.lunchbox.reports;

import com.lunchbox.common.error.Errors;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Analytics served from the read replica. This is the one place that reads across module tables, read-only and by
 * design (ADR-0009): reporting needs joins the module APIs would make prohibitively chatty.
 */
@Service
public class ReportService {

    private static final int MAX_RANGE_DAYS = 366;

    private final ReportsDatabase db;

    public ReportService(ReportsDatabase db) {
        this.db = db;
    }

    public record DashboardResponse(LocalDate date, Map<String, Long> ordersByStatus, long total, long delivered,
                                    long onTime, double onTimeRate, long unassigned, long activePartners,
                                    long scheduledPartners, long openIssues) {
    }

    public record OnTimeRow(LocalDate date, long delivered, long onTime, double onTimeRate, long failed) {
    }

    public record PartnerPerformanceRow(UUID partnerId, String partnerName, long assigned, long delivered, long onTime,
                                        long pickupFailed, long deliveryFailed, double onTimeRate, Double rating) {
    }

    public record FailureRow(String status, String reason, long count) {
    }

    public DashboardResponse dashboard(LocalDate date) {
        var p = new MapSqlParameterSource("date", date);
        Map<String, Long> byStatus = new LinkedHashMap<>();
        db.jdbc().query("SELECT status, count(*) AS n FROM orders WHERE scheduled_date = :date GROUP BY status ORDER BY status",
                p, rs -> {
                    byStatus.put(rs.getString("status"), rs.getLong("n"));
                });
        long total = byStatus.values().stream().mapToLong(Long::longValue).sum();
        Map<String, Object> d = db.jdbc().queryForMap("""
                SELECT count(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
                       count(*) FILTER (WHERE status = 'DELIVERED' AND delivered_at <= delivery_deadline) AS on_time,
                       count(*) FILTER (WHERE status IN ('SCHEDULED', 'REASSIGNED')) AS unassigned
                FROM orders WHERE scheduled_date = :date
                """, p);
        Map<String, Object> s = db.jdbc().queryForMap("""
                SELECT count(*) FILTER (WHERE status = 'ACTIVE') AS active,
                       count(*) FILTER (WHERE status IN ('SCHEDULED', 'ACTIVE', 'ENDED')) AS scheduled
                FROM partner_shifts WHERE shift_date = :date
                """, p);
        Long openIssues = db.jdbc().queryForObject(
                "SELECT count(*) FROM partner_issues WHERE status IN ('OPEN', 'ACKNOWLEDGED')", p, Long.class);
        long delivered = num(d.get("delivered"));
        long onTime = num(d.get("on_time"));
        return new DashboardResponse(date, byStatus, total, delivered, onTime, rate(onTime, delivered),
                num(d.get("unassigned")), num(s.get("active")), num(s.get("scheduled")), openIssues == null ? 0 : openIssues);
    }

    public List<OnTimeRow> onTime(LocalDate from, LocalDate to, UUID schoolId) {
        checkRange(from, to);
        var p = new MapSqlParameterSource("from", from).addValue("to", to).addValue("schoolId", schoolId);
        return db.jdbc().query("""
                SELECT scheduled_date AS d,
                       count(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
                       count(*) FILTER (WHERE status = 'DELIVERED' AND delivered_at <= delivery_deadline) AS on_time,
                       count(*) FILTER (WHERE status IN ('PICKUP_FAILED', 'DELIVERY_FAILED')) AS failed
                FROM orders
                WHERE scheduled_date BETWEEN :from AND :to
                  AND (CAST(:schoolId AS uuid) IS NULL OR school_id = CAST(:schoolId AS uuid))
                GROUP BY scheduled_date ORDER BY scheduled_date
                """, p, (rs, i) -> {
            long delivered = rs.getLong("delivered");
            long onTime = rs.getLong("on_time");
            return new OnTimeRow(rs.getObject("d", LocalDate.class), delivered, onTime, rate(onTime, delivered),
                    rs.getLong("failed"));
        });
    }

    public List<PartnerPerformanceRow> partnerPerformance(LocalDate from, LocalDate to) {
        checkRange(from, to);
        var p = new MapSqlParameterSource("from", from).addValue("to", to);
        return db.jdbc().query("""
                SELECT dp.id, dp.first_name || coalesce(' ' || dp.last_name, '') AS name, dp.rating,
                       count(o.id) AS assigned,
                       count(o.id) FILTER (WHERE o.status = 'DELIVERED') AS delivered,
                       count(o.id) FILTER (WHERE o.status = 'DELIVERED' AND o.delivered_at <= o.delivery_deadline) AS on_time,
                       count(o.id) FILTER (WHERE o.status = 'PICKUP_FAILED') AS pickup_failed,
                       count(o.id) FILTER (WHERE o.status = 'DELIVERY_FAILED') AS delivery_failed
                FROM delivery_partners dp
                JOIN orders o ON o.partner_id = dp.id AND o.scheduled_date BETWEEN :from AND :to
                GROUP BY dp.id, dp.first_name, dp.last_name, dp.rating
                ORDER BY delivered DESC
                """, p, (rs, i) -> {
            long delivered = rs.getLong("delivered");
            long onTime = rs.getLong("on_time");
            return new PartnerPerformanceRow(rs.getObject("id", UUID.class), rs.getString("name"), rs.getLong("assigned"),
                    delivered, onTime, rs.getLong("pickup_failed"), rs.getLong("delivery_failed"), rate(onTime, delivered),
                    rs.getBigDecimal("rating") == null ? null : rs.getBigDecimal("rating").doubleValue());
        });
    }

    public List<FailureRow> failures(LocalDate from, LocalDate to) {
        checkRange(from, to);
        var p = new MapSqlParameterSource("from", from).addValue("to", to);
        return db.jdbc().query("""
                SELECT status, coalesce(failure_reason, 'Unspecified') AS reason, count(*) AS n
                FROM orders
                WHERE scheduled_date BETWEEN :from AND :to AND status IN ('PICKUP_FAILED', 'DELIVERY_FAILED')
                GROUP BY status, coalesce(failure_reason, 'Unspecified')
                ORDER BY n DESC
                LIMIT 200
                """, p, (rs, i) -> new FailureRow(rs.getString("status"), rs.getString("reason"), rs.getLong("n")));
    }

    private static void checkRange(LocalDate from, LocalDate to) {
        if (to.isBefore(from) || from.plusDays(MAX_RANGE_DAYS).isBefore(to)) {
            throw Errors.badRequest("invalid_range", "Choose a range of at most one year.");
        }
    }

    private static long num(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }

    private static double rate(long part, long whole) {
        return whole == 0 ? 0.0 : Math.round(part * 1000.0 / whole) / 10.0;
    }
}
