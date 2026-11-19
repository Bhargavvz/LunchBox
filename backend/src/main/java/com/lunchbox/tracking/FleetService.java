package com.lunchbox.tracking;

import com.lunchbox.common.time.TimeZones;
import com.lunchbox.dispatch.DispatchTracking;
import com.lunchbox.dispatch.DispatchTracking.ShiftView;
import com.lunchbox.dispatch.PartnerDirectory;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.tracking.LiveLocationStore.Fix;
import com.lunchbox.tracking.TrackingDtos.CurrentDelivery;
import com.lunchbox.tracking.TrackingDtos.FleetPartnerResponse;
import com.lunchbox.tracking.TrackingDtos.LiveLocation;
import com.lunchbox.users.UserDirectory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Operations view of every rider on shift today: where they are, whether they can take work, and which lunchbox they
 * are handling right now. Read-only; composed from the dispatch, orders, schools and users modules' public APIs.
 */
@Service
public class FleetService {

    /** A rider whose last GPS fix is older than this is shown as offline. */
    static final Duration ONLINE_WINDOW = Duration.ofMinutes(5);
    private static final Set<OrderStatus> OPEN = EnumSet.of(OrderStatus.ASSIGNED, OrderStatus.REASSIGNED,
            OrderStatus.PARTNER_EN_ROUTE, OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT, OrderStatus.AT_SCHOOL);
    private static final Set<OrderStatus> IN_PROGRESS = EnumSet.of(OrderStatus.PARTNER_EN_ROUTE, OrderStatus.PICKED_UP,
            OrderStatus.IN_TRANSIT, OrderStatus.AT_SCHOOL);
    /** Which open order is "current": the one furthest along. */
    private static final List<OrderStatus> PROGRESS = List.of(OrderStatus.AT_SCHOOL, OrderStatus.IN_TRANSIT,
            OrderStatus.PICKED_UP, OrderStatus.PARTNER_EN_ROUTE, OrderStatus.ASSIGNED, OrderStatus.REASSIGNED);

    public enum Availability { ONLINE, BUSY, OFFLINE }

    private final DispatchTracking dispatch;
    private final PartnerDirectory partners;
    private final LiveLocationStore store;
    private final OrderQueries orders;
    private final SchoolDirectory schools;
    private final UserDirectory users;
    private final Clock clock;

    public FleetService(DispatchTracking dispatch, PartnerDirectory partners, LiveLocationStore store, OrderQueries orders,
                        SchoolDirectory schools, UserDirectory users, Clock clock) {
        this.dispatch = dispatch;
        this.partners = partners;
        this.store = store;
        this.orders = orders;
        this.schools = schools;
        this.users = users;
        this.clock = clock;
    }

    public List<FleetPartnerResponse> today() {
        Instant now = clock.instant();
        LocalDate date = TimeZones.todayIst(clock);
        List<ShiftView> shifts = dispatch.shiftsOn(date);
        if (shifts.isEmpty()) {
            return List.of();
        }
        Map<UUID, PartnerDirectory.PartnerInfo> info = partners.findAll(shifts.stream().map(ShiftView::partnerId).toList());
        Map<UUID, List<OrderView>> open = orders.forDate(date, OPEN).stream()
                .filter(o -> o.partnerId() != null)
                .collect(Collectors.groupingBy(OrderView::partnerId));
        Map<UUID, SchoolDirectory.SchoolInfo> schoolInfo = schools.findAll(open.values().stream().flatMap(List::stream)
                .map(OrderView::schoolId).collect(Collectors.toSet()));

        List<FleetPartnerResponse> out = new ArrayList<>();
        for (ShiftView shift : shifts) {
            PartnerDirectory.PartnerInfo p = info.get(shift.partnerId());
            if (p == null) {
                continue;
            }
            Optional<Fix> fix = store.last(p.id());
            LiveLocation location = fix.map(f -> new LiveLocation(f.lat(), f.lng(), f.headingDeg(), f.speedMps(), f.recordedAt()))
                    .orElse(null);
            boolean fresh = fix.isPresent() && fix.get().recordedAt().isAfter(now.minus(ONLINE_WINDOW));
            List<OrderView> mine = open.getOrDefault(p.id(), List.of());
            Optional<OrderView> current = mine.stream().min(Comparator.comparingInt(o -> PROGRESS.indexOf(o.status())));
            Availability availability = !"ACTIVE".equals(shift.status()) || !fresh ? Availability.OFFLINE
                    : mine.stream().anyMatch(o -> IN_PROGRESS.contains(o.status())) ? Availability.BUSY
                    : Availability.ONLINE;
            String phone = users.findUser(p.userId()).map(UserDirectory.UserSummary::phone).orElse(null);
            CurrentDelivery delivery = current.map(o -> new CurrentDelivery(o.id(), o.status(),
                    schoolInfo.containsKey(o.schoolId()) ? schoolInfo.get(o.schoolId()).name() : null,
                    o.deliveryDeadline())).orElse(null);
            out.add(new FleetPartnerResponse(p.id(), p.displayName(), phone, p.vehicleType().name(), p.vehicleNumber(),
                    availability, shift.status(), shift.plannedStart(), shift.plannedEnd(), location, mine.size(), delivery));
        }
        out.sort(Comparator.comparing((FleetPartnerResponse r) -> r.availability().ordinal())
                .thenComparing(FleetPartnerResponse::name, Comparator.nullsLast(Comparator.naturalOrder())));
        return out;
    }
}
