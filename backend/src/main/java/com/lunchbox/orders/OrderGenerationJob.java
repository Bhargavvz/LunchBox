package com.lunchbox.orders;

import com.lunchbox.common.time.TimeZones;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;

/**
 * Runs every few minutes; once today's cut-off has passed it (idempotently) generates tomorrow's orders. Driving it
 * off the cut-off setting rather than a fixed cron means an admin change to the cut-off takes effect the same day.
 */
@Component
public class OrderGenerationJob {

    private final OrderGenerationService generation;
    private final PickupWindows windows;
    private final Clock clock;

    public OrderGenerationJob(OrderGenerationService generation, PickupWindows windows, Clock clock) {
        this.generation = generation;
        this.windows = windows;
        this.clock = clock;
    }

    @Scheduled(cron = "${lunchbox.jobs.order-generation-cron}", zone = "Asia/Kolkata")
    @SchedulerLock(name = "orderGeneration", lockAtMostFor = "PT10M")
    public void run() {
        if (windows.pastCutoffToday()) {
            generation.generate(TimeZones.todayIst(clock).plusDays(1));
        }
    }
}
