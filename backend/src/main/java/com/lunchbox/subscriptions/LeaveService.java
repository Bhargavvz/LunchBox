package com.lunchbox.subscriptions;

import com.lunchbox.audit.AuditService;
import com.lunchbox.children.ChildDirectory;
import com.lunchbox.common.error.Errors;
import com.lunchbox.orders.PickupWindows;
import com.lunchbox.subscriptions.SubscriptionEvents.LeaveDayAdded;
import com.lunchbox.subscriptions.web.SubscriptionDtos.LeaveDayRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.LeaveDayResponse;
import com.lunchbox.users.UserDirectory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Parent-marked absence days. Changes are allowed only for dates whose order cut-off has not passed. */
@Service
public class LeaveService {

    private static final int MAX_DAYS_AHEAD = 180;

    private final LeaveDayRepository leaves;
    private final ChildDirectory children;
    private final UserDirectory users;
    private final PickupWindows windows;
    private final AuditService audit;
    private final ApplicationEventPublisher events;

    public LeaveService(LeaveDayRepository leaves, ChildDirectory children, UserDirectory users, PickupWindows windows,
                        AuditService audit, ApplicationEventPublisher events) {
        this.leaves = leaves;
        this.children = children;
        this.users = users;
        this.windows = windows;
        this.audit = audit;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<LeaveDayResponse> list(UUID parentUserId, UUID childId, LocalDate from, LocalDate to) {
        UUID parentId = users.requireParentId(parentUserId);
        children.requireOwned(childId, parentId);
        if (to.isBefore(from) || from.plusDays(400).isBefore(to)) {
            throw Errors.badRequest("invalid_range", "Choose a date range of at most 400 days.");
        }
        return leaves.findByChildIdAndLeaveDateBetweenOrderByLeaveDate(childId, from, to).stream()
                .map(LeaveService::toResponse).toList();
    }

    @Transactional
    public LeaveDayResponse add(UUID parentUserId, UUID childId, LeaveDayRequest request) {
        UUID parentId = users.requireParentId(parentUserId);
        children.requireOwned(childId, parentId);
        requireOpen(request.date());
        if (leaves.findByChildIdAndLeaveDate(childId, request.date()).isPresent()) {
            throw Errors.conflict("leave_exists", "Leave is already marked for this day.");
        }
        LeaveDay leave = leaves.save(new LeaveDay(childId, request.date(), request.reason(), parentUserId));
        audit.record("leave.added", "Child", childId, null, Map.of("date", request.date().toString()));
        events.publishEvent(new LeaveDayAdded(childId, request.date(), request.reason()));
        return toResponse(leave);
    }

    @Transactional
    public void remove(UUID parentUserId, UUID childId, LocalDate date) {
        UUID parentId = users.requireParentId(parentUserId);
        children.requireOwned(childId, parentId);
        requireOpen(date);
        LeaveDay leave = leaves.findByChildIdAndLeaveDate(childId, date).orElseThrow(() -> Errors.notFound("Leave day"));
        leaves.delete(leave);
        audit.record("leave.removed", "Child", childId, Map.of("date", date.toString()), null);
    }

    private void requireOpen(LocalDate date) {
        LocalDate firstOpen = windows.firstOpenDate();
        if (date.isBefore(firstOpen)) {
            throw Errors.unprocessable("cutoff_passed",
                    "Changes for this day are closed. The earliest date you can change is " + firstOpen + ".");
        }
        if (date.isAfter(firstOpen.plusDays(MAX_DAYS_AHEAD))) {
            throw Errors.unprocessable("too_far_ahead", "Leave can be marked up to " + MAX_DAYS_AHEAD + " days ahead.");
        }
    }

    private static LeaveDayResponse toResponse(LeaveDay l) {
        return new LeaveDayResponse(l.getId(), l.getChildId(), l.getLeaveDate(), l.getReason());
    }
}
