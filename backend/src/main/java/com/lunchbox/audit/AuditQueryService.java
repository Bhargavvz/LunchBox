package com.lunchbox.audit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class AuditQueryService {

    private final AuditLogRepository repository;
    private final ObjectMapper objectMapper;

    public AuditQueryService(AuditLogRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public record AuditLogResponse(UUID id, UUID actorUserId, String actorRole, String action, String entityType,
                                   String entityId, JsonNode before, JsonNode after, String ip, String requestId,
                                   Instant occurredAt) {
    }

    @Transactional(readOnly = true)
    public PageResponse<AuditLogResponse> search(String entityType, String entityId, UUID actorUserId, String action,
                                                 Instant from, Instant to, Integer page, Integer size) {
        Specification<AuditLog> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (entityType != null) {
                p.add(cb.equal(root.get("entityType"), entityType));
            }
            if (entityId != null) {
                p.add(cb.equal(root.get("entityId"), entityId));
            }
            if (actorUserId != null) {
                p.add(cb.equal(root.get("actorUserId"), actorUserId));
            }
            if (action != null) {
                p.add(cb.equal(root.get("action"), action));
            }
            if (from != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("occurredAt"), from));
            }
            if (to != null) {
                p.add(cb.lessThan(root.get("occurredAt"), to));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        return PageResponse.of(repository.findAll(spec,
                Pagination.of(page, size, Sort.by(Sort.Direction.DESC, "occurredAt"))), this::toResponse);
    }

    private AuditLogResponse toResponse(AuditLog a) {
        return new AuditLogResponse(a.getId(), a.getActorUserId(), a.getActorRole(), a.getAction(), a.getEntityType(),
                a.getEntityId(), parse(a.getBeforeState()), parse(a.getAfterState()), a.getIp(), a.getRequestId(),
                a.getOccurredAt());
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
