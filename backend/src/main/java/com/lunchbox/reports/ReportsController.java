package com.lunchbox.reports;

import com.lunchbox.common.security.Roles;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.common.web.Csv;
import com.lunchbox.reports.ReportService.DashboardResponse;
import com.lunchbox.reports.ReportService.FailureRow;
import com.lunchbox.reports.ReportService.OnTimeRow;
import com.lunchbox.reports.ReportService.PartnerPerformanceRow;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Admin · Reports")
@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize(Roles.ADMIN_READ)
public class ReportsController {

    private final ReportService reports;
    private final Clock clock;

    public ReportsController(ReportService reports, Clock clock) {
        this.reports = reports;
        this.clock = clock;
    }

    @GetMapping("/dashboard")
    public DashboardResponse dashboard(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return reports.dashboard(date == null ? TimeZones.todayIst(clock) : date);
    }

    @GetMapping("/reports/on-time")
    public List<OnTimeRow> onTime(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                  @RequestParam(required = false) UUID schoolId) {
        return reports.onTime(from, to, schoolId);
    }

    @GetMapping("/reports/partner-performance")
    public List<PartnerPerformanceRow> partnerPerformance(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reports.partnerPerformance(from, to);
    }

    @GetMapping("/reports/failures")
    public List<FailureRow> failures(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                     @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reports.failures(from, to);
    }

    @GetMapping(value = "/reports/partner-performance.csv", produces = "text/csv")
    public void partnerPerformanceCsv(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                      HttpServletResponse response) throws IOException {
        Csv.write(response, "partner-performance-" + from + "-" + to + ".csv",
                List.of("partnerId", "name", "assigned", "delivered", "onTime", "onTimeRate", "pickupFailed",
                        "deliveryFailed", "rating"),
                reports.partnerPerformance(from, to),
                r -> List.of(r.partnerId(), r.partnerName(), r.assigned(), r.delivered(), r.onTime(), r.onTimeRate(),
                        r.pickupFailed(), r.deliveryFailed(), r.rating() == null ? "" : r.rating()));
    }

    @GetMapping(value = "/reports/on-time.csv", produces = "text/csv")
    public void onTimeCsv(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                          @RequestParam(required = false) UUID schoolId,
                          HttpServletResponse response) throws IOException {
        Csv.write(response, "on-time-" + from + "-" + to + ".csv",
                List.of("date", "delivered", "onTime", "onTimeRate", "failed"),
                reports.onTime(from, to, schoolId),
                r -> List.of(r.date(), r.delivered(), r.onTime(), r.onTimeRate(), r.failed()));
    }
}
