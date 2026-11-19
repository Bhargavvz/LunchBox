package com.lunchbox.audit;

import com.lunchbox.common.security.Roles;
import com.lunchbox.common.web.Csv;
import com.lunchbox.common.web.PageResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
public class AuditController {

    private final AuditQueryService queries;

    public AuditController(AuditQueryService queries) {
        this.queries = queries;
    }

    @GetMapping("/api/v1/admin/audit-logs")
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<AuditQueryService.AuditLogResponse> search(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String entityId,
            @RequestParam(required = false) UUID actorUserId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return queries.search(new AuditQueryService.Filter(entityType, entityId, actorUserId, action, severity, module, q,
                from, to), page, size);
    }

    @GetMapping(value = "/api/v1/admin/audit-logs.csv", produces = "text/csv")
    @PreAuthorize(Roles.ADMIN_READ)
    public void export(@RequestParam(required = false) String severity,
                       @RequestParam(required = false) String module,
                       @RequestParam(required = false) UUID actorUserId,
                       @RequestParam(required = false) String q,
                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                       HttpServletResponse response) throws IOException {
        Csv.write(response, "lunchbox-log.csv",
                List.of("time", "severity", "module", "summary", "action", "who", "role", "entity", "entityId", "ip",
                        "device", "requestId", "before", "after"),
                queries.export(new AuditQueryService.Filter(null, null, actorUserId, null, severity, module, q, from, to)),
                a -> List.of(a.occurredAt(), a.severity(), nn(a.module()), nn(a.summary()), a.action(), nn(a.actorName()),
                        nn(a.actorRole()), a.entityType(), nn(a.entityId()), nn(a.ip()), nn(a.userAgent()), nn(a.requestId()),
                        a.before() == null ? "" : a.before().toString(), a.after() == null ? "" : a.after().toString()));
    }

    private static String nn(String s) {
        return s == null ? "" : s;
    }
}
