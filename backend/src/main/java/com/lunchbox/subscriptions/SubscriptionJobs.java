package com.lunchbox.subscriptions;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Prepaid billing housekeeping (ADR-0018): lapse ended periods, remind before they end. */
@Slf4j
@Component
public class SubscriptionJobs {

    private final SubscriptionService subscriptions;

    public SubscriptionJobs(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @Scheduled(cron = "${lunchbox.jobs.prepaid-sweep-cron:0 7 * * * *}", zone = "Asia/Kolkata")
    @SchedulerLock(name = "prepaidSweep", lockAtMostFor = "PT10M")
    public void sweepPrepaid() {
        int changed = subscriptions.sweepPrepaid();
        if (changed > 0) {
            log.info("Prepaid sweep updated {} subscriptions", changed);
        }
    }
}
