package com.lunchbox.dispatch;

import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.orders.PickupWindows;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;

@Slf4j
@Component
public class DispatchJobs {

    private final AssignmentService assignment;
    private final PartnerShiftRepository shifts;
    private final PickupWindows windows;
    private final PlatformSettings settings;
    private final OutboxPublisher outbox;
    private final TransactionTemplate tx;
    private final Clock clock;

    public DispatchJobs(AssignmentService assignment, PartnerShiftRepository shifts, PickupWindows windows,
                        PlatformSettings settings, OutboxPublisher outbox, PlatformTransactionManager txManager,
                        Clock clock) {
        this.assignment = assignment;
        this.shifts = shifts;
        this.windows = windows;
        this.settings = settings;
        this.outbox = outbox;
        this.tx = new TransactionTemplate(txManager);
        this.clock = clock;
    }

    /** After the cut-off, assign tomorrow's orders (re-runs pick up late changes and are idempotent). */
    @Scheduled(cron = "${lunchbox.jobs.assignment-cron}", zone = "Asia/Kolkata")
    @SchedulerLock(name = "autoAssignTomorrow", lockAtMostFor = "PT9M")
    public void assignTomorrow() {
        if (windows.pastCutoffToday()) {
            var result = assignment.autoAssign(TimeZones.todayIst(clock).plusDays(1));
            if (result.considered() > 0) {
                log.info("Auto-assignment: {}", result);
            }
        }
    }

    /** Same-day safety net: assigns orders released by no-shows or added manually today. */
    @Scheduled(cron = "0 */3 6-13 * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "autoAssignToday", lockAtMostFor = "PT2M")
    public void assignToday() {
        assignment.autoAssign(TimeZones.todayIst(clock));
    }

    /** Partners who have not started their shift after the grace period are marked no-show and released. */
    @Scheduled(cron = "${lunchbox.jobs.no-show-cron}", zone = "Asia/Kolkata")
    @SchedulerLock(name = "noShowDetection", lockAtMostFor = "PT4M")
    public void detectNoShows() {
        LocalDate today = TimeZones.todayIst(clock);
        Instant threshold = clock.instant().minusSeconds(settings.noShowGraceMinutes() * 60L);
        List<PartnerShift> late = shifts.findByShiftDateAndStatusIn(today, EnumSet.of(PartnerShift.Status.SCHEDULED))
                .stream().filter(s -> s.getPlannedStart().isBefore(threshold)).toList();
        for (PartnerShift shift : late) {
            try {
                tx.executeWithoutResult(status -> {
                    PartnerShift fresh = shifts.findById(shift.getId()).orElseThrow();
                    if (fresh.getStatus() != PartnerShift.Status.SCHEDULED) {
                        return;
                    }
                    fresh.noShow();
                    var released = assignment.releaseOpenOrders(fresh.getPartnerId(), today, "Partner no-show");
                    outbox.publish("Shift", fresh.getId(), Messaging.SHIFT_NO_SHOW,
                            new ShiftService.ShiftNoShow(fresh.getId(), fresh.getPartnerId(), today));
                    log.warn("Partner {} no-show; released {} orders", fresh.getPartnerId(), released.size());
                });
            } catch (RuntimeException e) {
                log.error("No-show handling failed for shift {}", shift.getId(), e);
            }
        }
        if (!late.isEmpty()) {
            assignment.autoAssign(today);
        }
    }
}
