package com.lunchbox.dispatch;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.dispatch.web.DispatchDtos.ShiftRequest;
import com.lunchbox.dispatch.web.DispatchDtos.ShiftResponse;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ShiftService {

    private final PartnerShiftRepository shifts;
    private final DeliveryPartnerRepository partners;
    private final OrderQueries orders;
    private final OutboxPublisher outbox;
    private final AuditService audit;
    private final Clock clock;

    public ShiftService(PartnerShiftRepository shifts, DeliveryPartnerRepository partners, OrderQueries orders,
                        OutboxPublisher outbox, AuditService audit, Clock clock) {
        this.shifts = shifts;
        this.partners = partners;
        this.orders = orders;
        this.outbox = outbox;
        this.audit = audit;
        this.clock = clock;
    }

    /** Payload of {@code shift.ended} (drives the base-day earning). */
    public record ShiftEnded(UUID shiftId, UUID partnerId, LocalDate date, int deliveredCount) {
    }

    /** Payload of {@code shift.no_show} — routed on the same exchange; earnings applies the penalty. */
    public record ShiftNoShow(UUID shiftId, UUID partnerId, LocalDate date) {
    }

    @Transactional
    public ShiftResponse schedule(UUID partnerId, ShiftRequest request) {
        DeliveryPartner partner = partners.findById(partnerId).orElseThrow(() -> Errors.notFound("Partner"));
        if (!partner.canWork()) {
            throw Errors.unprocessable("partner_not_eligible", "Only active, KYC-approved partners can be scheduled.");
        }
        if (request.date().isBefore(TimeZones.todayIst(clock))) {
            throw Errors.badRequest("date_in_past", "Shifts cannot be scheduled in the past.");
        }
        if (!request.plannedStart().isBefore(request.plannedEnd())) {
            throw Errors.badRequest("invalid_window", "Shift start must be before its end.");
        }
        Instant start = TimeZones.atIst(request.date(), request.plannedStart());
        Instant end = TimeZones.atIst(request.date(), request.plannedEnd());
        PartnerShift shift = shifts.findByPartnerIdAndShiftDate(partnerId, request.date())
                .map(existing -> {
                    if (existing.getStatus() != PartnerShift.Status.SCHEDULED) {
                        throw Errors.conflict("shift_started", "This shift has already started or finished.");
                    }
                    existing.reschedule(start, end);
                    return existing;
                })
                .orElseGet(() -> shifts.save(new PartnerShift(partnerId, request.date(), start, end)));
        audit.record("shift.scheduled", "Partner", partnerId, null,
                Map.of("date", request.date().toString(), "start", start.toString(), "end", end.toString()));
        return toResponse(shift);
    }

    @Transactional
    public void cancel(UUID partnerId, LocalDate date) {
        PartnerShift shift = shifts.findByPartnerIdAndShiftDate(partnerId, date).orElseThrow(() -> Errors.notFound("Shift"));
        if (shift.getStatus() != PartnerShift.Status.SCHEDULED) {
            throw Errors.conflict("shift_started", "Only shifts that have not started can be cancelled.");
        }
        shift.cancel();
        audit.record("shift.cancelled", "Partner", partnerId, null, Map.of("date", date.toString()));
    }

    @Transactional(readOnly = true)
    public List<ShiftResponse> list(UUID partnerId, LocalDate from, LocalDate to) {
        return shifts.findByPartnerIdAndShiftDateBetweenOrderByShiftDate(partnerId, from, to).stream()
                .map(ShiftService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ShiftResponse today(UUID partnerId) {
        return shifts.findByPartnerIdAndShiftDate(partnerId, TimeZones.todayIst(clock)).map(ShiftService::toResponse)
                .orElse(null);
    }

    @Transactional
    public ShiftResponse start(UUID partnerId, GeoPoint location) {
        LocalDate today = TimeZones.todayIst(clock);
        PartnerShift shift = shifts.findByPartnerIdAndShiftDate(partnerId, today)
                .orElseThrow(() -> Errors.unprocessable("no_shift", "You are not scheduled to work today."));
        if (shift.getStatus() == PartnerShift.Status.ACTIVE) {
            return toResponse(shift);
        }
        if (shift.getStatus() != PartnerShift.Status.SCHEDULED) {
            throw Errors.conflict("shift_closed", "Today's shift is " + shift.getStatus().name().toLowerCase() + ".");
        }
        shift.start(clock.instant(), Geo.point(location));
        return toResponse(shift);
    }

    @Transactional
    public ShiftResponse end(UUID partnerId) {
        LocalDate today = TimeZones.todayIst(clock);
        PartnerShift shift = shifts.findByPartnerIdAndShiftDate(partnerId, today)
                .filter(s -> s.getStatus() == PartnerShift.Status.ACTIVE)
                .orElseThrow(() -> Errors.unprocessable("no_active_shift", "You have no active shift."));
        var todays = orders.forPartnerAndDate(partnerId, today);
        boolean carrying = todays.stream().anyMatch(o -> OrderStatus.IN_CUSTODY.contains(o.status()));
        if (carrying) {
            throw Errors.conflict("lunchboxes_on_board", "Hand over or report every lunchbox before ending your shift.");
        }
        shift.end(clock.instant());
        int delivered = (int) todays.stream().filter(o -> o.status() == OrderStatus.DELIVERED).count();
        outbox.publish("Shift", shift.getId(), Messaging.SHIFT_ENDED, new ShiftEnded(shift.getId(), partnerId, today, delivered));
        return toResponse(shift);
    }

    static ShiftResponse toResponse(PartnerShift s) {
        return new ShiftResponse(s.getId(), s.getPartnerId(), s.getShiftDate(), s.getPlannedStart(), s.getPlannedEnd(),
                s.getStartedAt(), s.getEndedAt(), s.getStatus());
    }
}
