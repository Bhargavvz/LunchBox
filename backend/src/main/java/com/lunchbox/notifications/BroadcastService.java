package com.lunchbox.notifications;

import com.lunchbox.audit.AuditService;
import com.lunchbox.children.ChildDirectory;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.messaging.ProcessedEvents;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.common.persistence.UuidV7;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Role;
import com.lunchbox.users.UserDirectory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Admin broadcasts: recorded and queued in one transaction (outbox), fanned out asynchronously by a worker. */
@Slf4j
@Service
public class BroadcastService {

    public enum Audience { ALL_PARENTS, ALL_PARTNERS, SCHOOL_PARENTS }

    public record BroadcastRequest(@NotNull Audience audience, UUID schoolId,
                                   @NotBlank @Size(max = 160) String title,
                                   @NotBlank @Size(max = 1000) String body) {
    }

    public record BroadcastResponse(UUID id, Audience audience, UUID schoolId, String title, String body, String status,
                                    int recipientCount, Instant createdAt) {
    }

    public record BroadcastRequested(UUID broadcastId) {
    }

    private final JdbcTemplate jdbc;
    private final OutboxPublisher outbox;
    private final NotificationService notifications;
    private final UserDirectory users;
    private final ChildDirectory children;
    private final ProcessedEvents processed;
    private final AuditService audit;
    private final TransactionTemplate tx;
    private final Clock clock;

    public BroadcastService(JdbcTemplate jdbc, OutboxPublisher outbox, NotificationService notifications,
                            UserDirectory users, ChildDirectory children, ProcessedEvents processed, AuditService audit,
                            PlatformTransactionManager txManager, Clock clock) {
        this.jdbc = jdbc;
        this.outbox = outbox;
        this.notifications = notifications;
        this.users = users;
        this.children = children;
        this.processed = processed;
        this.audit = audit;
        this.tx = new TransactionTemplate(txManager);
        this.clock = clock;
    }

    @Transactional
    public BroadcastResponse create(BroadcastRequest request, CurrentUser admin) {
        if (request.audience() == Audience.SCHOOL_PARENTS && request.schoolId() == null) {
            throw Errors.badRequest("school_required", "Choose the school whose parents should receive this.");
        }
        UUID id = UuidV7.generate();
        Timestamp now = Timestamp.from(clock.instant());
        jdbc.update("""
                INSERT INTO broadcasts (id, audience, school_id, title, body, created_by, recipient_count, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, 'QUEUED', ?, ?)
                """, id, request.audience().name(), request.schoolId(), request.title(), request.body(), admin.userId(), now, now);
        outbox.publish("Broadcast", id, Messaging.BROADCAST_REQUESTED, new BroadcastRequested(id));
        audit.record("broadcast.created", "Broadcast", id, null,
                Map.of("audience", request.audience().name(), "title", request.title()));
        return get(id);
    }

    @Transactional(readOnly = true)
    public List<BroadcastResponse> recent() {
        return jdbc.query("SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 50", (rs, i) -> new BroadcastResponse(
                rs.getObject("id", UUID.class), Audience.valueOf(rs.getString("audience")),
                rs.getObject("school_id", UUID.class), rs.getString("title"), rs.getString("body"), rs.getString("status"),
                rs.getInt("recipient_count"), rs.getTimestamp("created_at").toInstant()));
    }

    private BroadcastResponse get(UUID id) {
        return jdbc.query("SELECT * FROM broadcasts WHERE id = ?", (rs, i) -> new BroadcastResponse(
                rs.getObject("id", UUID.class), Audience.valueOf(rs.getString("audience")),
                rs.getObject("school_id", UUID.class), rs.getString("title"), rs.getString("body"), rs.getString("status"),
                rs.getInt("recipient_count"), rs.getTimestamp("created_at").toInstant()), id).getFirst();
    }

    @RabbitListener(queues = Messaging.JOB_BROADCAST)
    public void deliver(BroadcastRequested job, @Header(Messaging.HEADER_EVENT_ID) String eventId) {
        Boolean first = tx.execute(s -> processed.markFirstDelivery("broadcast", UUID.fromString(eventId)));
        if (!Boolean.TRUE.equals(first)) {
            return;
        }
        BroadcastResponse b = get(job.broadcastId());
        jdbc.update("UPDATE broadcasts SET status = 'SENDING', updated_at = now() WHERE id = ?", b.id());
        List<UUID> recipients = switch (b.audience()) {
            case ALL_PARENTS -> users.activeUserIdsByRole(Role.PARENT);
            case ALL_PARTNERS -> users.activeUserIdsByRole(Role.PARTNER);
            case SCHOOL_PARENTS -> users.userIdsForParents(children.parentIdsAtSchool(b.schoolId()));
        };
        int sent = 0;
        for (UUID userId : recipients) {
            try {
                notifications.notifyText(userId, b.title(), b.body(), Map.of("broadcastId", b.id().toString()));
                sent++;
            } catch (RuntimeException e) {
                log.warn("Broadcast {} to {} failed: {}", b.id(), userId, e.getMessage());
            }
        }
        jdbc.update("UPDATE broadcasts SET status = 'COMPLETED', recipient_count = ?, updated_at = now() WHERE id = ?",
                sent, b.id());
        log.info("Broadcast {} delivered to {} of {} recipients", b.id(), sent, recipients.size());
    }
}
