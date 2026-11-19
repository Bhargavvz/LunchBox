package com.lunchbox.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.SecurityContext;
import com.lunchbox.common.web.ClientInfo;
import com.lunchbox.common.web.CorrelationIdFilter;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;

/**
 * Writes the who/what/when/before/after trail. Joins the caller's transaction so an audit entry exists if and only
 * if the change committed. Callers pass DTO-shaped snapshots that exclude secrets and raw PII. Every entry gets a
 * severity, a module and a one-sentence summary ({@link AuditSummaries}); {@link #system} records events nobody
 * clicked (allocation results, rejected webhooks, failures) and survives a rollback of the surrounding work.
 */
@Service
public class AuditService {

    public enum Severity { INFO, WARNING, ERROR }

    private final AuditLogRepository repository;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public AuditService(AuditLogRepository repository, ObjectMapper objectMapper, Clock clock) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional
    public void record(String action, String entityType, Object entityId, Object before, Object after) {
        save(action, entityType, entityId, before, after, AuditSummaries.severity(action),
                AuditSummaries.describe(action, entityType, before, after));
    }

    /**
     * A system event with its own severity and plain-English summary, written in its own transaction so failures are
     * logged even when the work that failed is rolled back.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void system(Severity severity, String action, String entityType, Object entityId, String summary, Object details) {
        save(action, entityType, entityId, null, details, severity, summary);
    }

    private void save(String action, String entityType, Object entityId, Object before, Object after, Severity severity,
                      String summary) {
        Optional<CurrentUser> actor = SecurityContext.currentUser();
        repository.save(new AuditLog(
                actor.map(CurrentUser::userId).orElse(null),
                actor.map(u -> u.role() == null ? "UNREGISTERED" : u.role().name()).orElse("SYSTEM"),
                action,
                entityType,
                entityId == null ? null : entityId.toString(),
                toJson(before),
                toJson(after),
                ClientInfo.currentIp(),
                ClientInfo.currentUserAgent(),
                MDC.get(CorrelationIdFilter.MDC_KEY),
                clock.instant()).describe(severity.name(), AuditSummaries.module(action), summary));
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise audit snapshot", e);
        }
    }
}
