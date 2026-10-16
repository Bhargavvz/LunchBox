package com.lunchbox.admin;

import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Data-retention policy (docs/security.md#retention). Location pings are dropped by partition in TrackingJobs;
 * handover photos and KYC documents expire through S3 lifecycle rules. This job handles the remaining tables.
 */
@Slf4j
@Component
public class RetentionJobs {

    private final JdbcTemplate jdbc;

    public RetentionJobs(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "${lunchbox.jobs.retention-cron}", zone = "Asia/Kolkata")
    @SchedulerLock(name = "dataRetention", lockAtMostFor = "PT30M")
    public void purge() {
        int events = jdbc.update("DELETE FROM processed_events WHERE processed_at < now() - interval '30 days'");
        int webhooks = jdbc.update("DELETE FROM webhook_events WHERE received_at < now() - interval '400 days'");
        int audit = jdbc.update("DELETE FROM audit_logs WHERE occurred_at < now() - interval '3 years' - interval '1 day'");
        int verifications = jdbc.update("""
                UPDATE verifications SET code_ciphertext = NULL
                WHERE code_ciphertext IS NOT NULL AND created_at < now() - interval '2 days'
                """);
        log.info("Retention: processed_events={}, webhook_events={}, audit_logs={}, otp_scrubbed={}",
                events, webhooks, audit, verifications);
    }
}
