package com.lunchbox.audit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.users.UserDirectory;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** Searching and exporting the log: by severity, module, person, words and dates. */
@Service
public class AuditQueryService {

    private static final int EXPORT_LIMIT = 10_000;

    private final AuditLogRepository repository;
    private final UserDirectory users;
    private final ObjectMapper objectMapper;

    public AuditQueryService(AuditLogRepository repository, UserDirectory users, ObjectMapper objectMapper) {
        this.repository = repository;
        this.users = users;
        this.objectMapper = objectMapper;
    }

    public record AuditLogResponse(UUID id, UUID actorUserId, String actorName, String actorRole, String action,
                                   String entityType, String entityId, JsonNode before, JsonNode after, String ip,
                                   String userAgent, String requestId, Instant occurredAt, String severity, String module,
                                   String summary) {
    }

    public record Filter(String entityType, String entityId, UUID actorUserId, String action, String severity,
                         String module, String q, Instant from, Instant to) {
    }

    @Transactional(readOnly = true)
    public PageResponse<AuditLogResponse> search(Filter filter, Integer page, Integer size) {
        Page<AuditLog> result = repository.findAll(spec(filter),
                Pagination.of(page, size, Sort.by(Sort.Direction.DESC, "occurredAt")));
        Map<UUID, String> names = names(result.getContent());
        return PageResponse.of(result, a -> toResponse(a, names));
    }

    /** Up to 10,000 matching entries, newest first, for the CSV export. */
    @Transactional(readOnly = true)
    public List<AuditLogResponse> export(Filter filter) {
        List<AuditLog> list = repository.findAll(spec(filter),
                PageRequest.of(0, EXPORT_LIMIT, Sort.by(Sort.Direction.DESC, "occurredAt"))).getContent();
        Map<UUID, String> names = names(list);
        return list.stream().map(a -> toResponse(a, names)).toList();
    }

    private static Specification<AuditLog> spec(Filter f) {
        return (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (f.entityType() != null) {
                p.add(cb.equal(root.get("entityType"), f.entityType()));
            }
            if (f.entityId() != null) {
                p.add(cb.equal(root.get("entityId"), f.entityId()));
            }
            if (f.actorUserId() != null) {
                p.add(cb.equal(root.get("actorUserId"), f.actorUserId()));
            }
            if (f.action() != null) {
                p.add(cb.equal(root.get("action"), f.action()));
            }
            if (f.severity() != null) {
                p.add(cb.equal(root.get("severity"), f.severity().toUpperCase(Locale.ROOT)));
            }
            if (f.module() != null) {
                p.add(cb.equal(root.get("module"), f.module()));
            }
            if (f.q() != null && !f.q().isBlank()) {
                String like = "%" + f.q().trim().toLowerCase(Locale.ROOT) + "%";
                p.add(cb.or(cb.like(cb.lower(root.get("action")), like), cb.like(cb.lower(root.get("summary")), like),
                        cb.like(cb.lower(root.get("entityId")), like), cb.like(cb.lower(root.get("entityType")), like)));
            }
            if (f.from() != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("occurredAt"), f.from()));
            }
            if (f.to() != null) {
                p.add(cb.lessThan(root.get("occurredAt"), f.to()));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    private Map<UUID, String> names(List<AuditLog> list) {
        Map<UUID, String> out = new HashMap<>();
        list.stream().map(AuditLog::getActorUserId).filter(Objects::nonNull).distinct().forEach(id ->
                users.findUser(id).ifPresent(u -> out.put(id, u.displayName() != null ? u.displayName()
                        : u.email() != null ? u.email() : u.role().name())));
        return out;
    }

    private AuditLogResponse toResponse(AuditLog a, Map<UUID, String> names) {
        return new AuditLogResponse(a.getId(), a.getActorUserId(),
                a.getActorUserId() == null ? "System" : names.get(a.getActorUserId()), a.getActorRole(), a.getAction(),
                a.getEntityType(), a.getEntityId(), parse(a.getBeforeState()), parse(a.getAfterState()), a.getIp(),
                a.getUserAgent(), a.getRequestId(), a.getOccurredAt(), a.getSeverity(),
                a.getModule() != null ? a.getModule() : AuditSummaries.module(a.getAction()),
                // Entries written before summaries existed get theirs from the same wording now.
                a.getSummary() != null ? a.getSummary() : AuditSummaries.describe(a.getAction(), a.getEntityType(), null, null));
    }

    private JsonNode parse(String json) {
        if (json == null) {
            return null;
        }
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return objectMapper.getNodeFactory().textNode(json);
        }
    }
}
