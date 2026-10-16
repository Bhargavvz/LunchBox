package com.lunchbox.audit;

import com.lunchbox.common.security.Roles;
import com.lunchbox.common.web.PageResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

@Tag(name = "Admin · Audit")
@RestController
@RequestMapping("/api/v1/admin/audit-logs")
public class AuditController {

    private final AuditQueryService queries;

    public AuditController(AuditQueryService queries) {
        this.queries = queries;
    }

    @GetMapping
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<AuditQueryService.AuditLogResponse> search(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String entityId,
            @RequestParam(required = false) UUID actorUserId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return queries.search(entityType, entityId, actorUserId, action, from, to, page, size);
    }
}
