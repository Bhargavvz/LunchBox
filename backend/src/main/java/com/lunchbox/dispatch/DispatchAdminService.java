package com.lunchbox.dispatch;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.dispatch.web.DispatchDtos.AdminRouteResponse;
import com.lunchbox.dispatch.web.DispatchDtos.AdminStopResponse;
import com.lunchbox.dispatch.web.DispatchDtos.IssueResponse;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class DispatchAdminService {

    private final RouteRepository routes;
    private final RouteStopRepository stops;
    private final PartnerIssueRepository issues;
    private final PartnerDirectory partners;
    private final AuditService audit;
    private final Clock clock;

    public DispatchAdminService(RouteRepository routes, RouteStopRepository stops, PartnerIssueRepository issues,
                                PartnerDirectory partners, AuditService audit, Clock clock) {
        this.routes = routes;
        this.stops = stops;
        this.issues = issues;
        this.partners = partners;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<AdminRouteResponse> routes(LocalDate date) {
        List<Route> list = routes.findByRouteDate(date);
        Map<UUID, PartnerDirectory.PartnerInfo> partnerMap = partners.findAll(list.stream().map(Route::getPartnerId)
                .collect(Collectors.toSet()));
        return list.stream().map(r -> {
            PartnerDirectory.PartnerInfo p = partnerMap.get(r.getPartnerId());
            List<AdminStopResponse> stopViews = stops.findByRouteIdOrderBySequence(r.getId()).stream()
                    .map(s -> new AdminStopResponse(s.getId(), s.getSequence(), s.getStopType(), s.getStatus(),
                            s.getOrderId(), s.getSchoolId(), Geo.toGeoPoint(s.getLocation()), s.getPlannedEta(),
                            s.getArrivedAt(), s.getCompletedAt()))
                    .toList();
            return new AdminRouteResponse(r.getId(), r.getPartnerId(), p == null ? null : p.displayName(), r.getRouteDate(),
                    r.getStatus(), r.getOptimizer(), r.getTotalDistanceM(), r.getTotalDurationS(), stopViews);
        }).toList();
    }

    @Transactional(readOnly = true)
    public PageResponse<IssueResponse> issues(boolean openOnly, Integer page, Integer size) {
        Set<PartnerIssue.Status> statuses = openOnly
                ? EnumSet.of(PartnerIssue.Status.OPEN, PartnerIssue.Status.ACKNOWLEDGED)
                : EnumSet.allOf(PartnerIssue.Status.class);
        var result = issues.findByStatusInOrderByCreatedAtDesc(statuses, Pagination.of(page, size, Sort.unsorted()));
        Map<UUID, PartnerDirectory.PartnerInfo> partnerMap = partners.findAll(result.getContent().stream()
                .map(PartnerIssue::getPartnerId).collect(Collectors.toSet()));
        return PageResponse.of(result, i -> toResponse(i, partnerMap.get(i.getPartnerId())));
    }

    @Transactional
    public IssueResponse acknowledge(UUID issueId, CurrentUser admin) {
        PartnerIssue issue = issues.findById(issueId).orElseThrow(() -> Errors.notFound("Issue"));
        issue.acknowledge(admin.userId());
        audit.record("issue.acknowledged", "PartnerIssue", issueId, null, Map.of("status", issue.getStatus().name()));
        return toResponse(issue, partners.find(issue.getPartnerId()).orElse(null));
    }

    @Transactional
    public IssueResponse resolve(UUID issueId, String note, CurrentUser admin) {
        PartnerIssue issue = issues.findById(issueId).orElseThrow(() -> Errors.notFound("Issue"));
        issue.resolve(admin.userId(), note, clock.instant());
        audit.record("issue.resolved", "PartnerIssue", issueId, null, Map.of("note", note));
        return toResponse(issue, partners.find(issue.getPartnerId()).orElse(null));
    }

    private static IssueResponse toResponse(PartnerIssue i, PartnerDirectory.PartnerInfo p) {
        return new IssueResponse(i.getId(), i.getPartnerId(), p == null ? null : p.displayName(), i.getOrderId(),
                i.getIssueType(), i.getDescription(), Geo.toGeoPoint(i.getLocation()), i.getStatus(), i.getCreatedAt(),
                i.getResolvedAt(), i.getResolutionNote());
    }
}
