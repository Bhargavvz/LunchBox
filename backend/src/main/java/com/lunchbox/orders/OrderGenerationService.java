package com.lunchbox.orders;

import com.lunchbox.addresses.AddressDirectory;
import com.lunchbox.addresses.AddressDirectory.AddressInfo;
import com.lunchbox.audit.AuditService;
import com.lunchbox.children.ChildDirectory;
import com.lunchbox.children.ChildDirectory.ChildInfo;
import com.lunchbox.common.persistence.UuidV7;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import com.lunchbox.subscriptions.SubscriptionQueries;
import com.lunchbox.subscriptions.SubscriptionQueries.ScheduleEntry;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Turns active subscriptions into concrete orders for a date. Skips non-working weekdays, school holidays, leave
 * days, inactive schools and removed children/addresses. Idempotent: the (child_id, scheduled_date) unique key plus
 * {@code ON CONFLICT DO NOTHING} make re-runs safe.
 */
@Slf4j
@Service
public class OrderGenerationService {

    private final SubscriptionQueries subscriptions;
    private final SchoolDirectory schools;
    private final ChildDirectory children;
    private final AddressDirectory addresses;
    private final PickupWindows windows;
    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final MeterRegistry meters;
    private final Clock clock;

    public OrderGenerationService(SubscriptionQueries subscriptions, SchoolDirectory schools, ChildDirectory children,
                                  AddressDirectory addresses, PickupWindows windows, JdbcTemplate jdbc,
                                  AuditService audit, MeterRegistry meters, Clock clock) {
        this.subscriptions = subscriptions;
        this.schools = schools;
        this.children = children;
        this.addresses = addresses;
        this.windows = windows;
        this.jdbc = jdbc;
        this.audit = audit;
        this.meters = meters;
        this.clock = clock;
    }

    public record GenerationResult(LocalDate date, int candidates, int created, int skipped) {
    }

    @Transactional
    public GenerationResult generate(LocalDate date) {
        List<ScheduleEntry> schedules = subscriptions.schedulesFor(date).stream()
                .filter(s -> s.daysOfWeek().contains(date.getDayOfWeek()))
                .toList();
        Set<UUID> onLeave = subscriptions.childrenOnLeave(date);
        Map<UUID, ChildInfo> childMap = children.findAll(schedules.stream().map(ScheduleEntry::childId).collect(Collectors.toSet()));
        Map<UUID, AddressInfo> addressMap = addresses.findAll(schedules.stream().map(ScheduleEntry::addressId).collect(Collectors.toSet()));
        Map<UUID, SchoolInfo> schoolMap = schools.findAll(childMap.values().stream().map(ChildInfo::schoolId).collect(Collectors.toSet()));
        Map<UUID, Boolean> schoolDay = new HashMap<>();

        int created = 0;
        int skipped = 0;
        for (ScheduleEntry s : schedules) {
            ChildInfo child = childMap.get(s.childId());
            AddressInfo address = addressMap.get(s.addressId());
            if (child == null || child.deleted() || address == null || address.deleted() || onLeave.contains(s.childId())) {
                skipped++;
                continue;
            }
            SchoolInfo school = schoolMap.get(child.schoolId());
            boolean open = school != null && schoolDay.computeIfAbsent(school.id(), id -> schools.isSchoolDay(id, date));
            if (!open) {
                skipped++;
                continue;
            }
            PickupWindows.Window w = windows.forSchool(school, date);
            UUID orderId = UuidV7.generate();
            Timestamp now = Timestamp.from(clock.instant());
            int inserted = jdbc.update("""
                    INSERT INTO orders (id, child_id, parent_id, school_id, address_id, subscription_id, scheduled_date,
                                        pickup_window_start, pickup_window_end, delivery_deadline, pickup_location,
                                        status, source, version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326),
                            'SCHEDULED', 'SUBSCRIPTION', 0, ?, ?)
                    ON CONFLICT (child_id, scheduled_date) DO NOTHING
                    """, orderId, s.childId(), s.parentId(), school.id(), s.addressId(), s.subscriptionId(), date,
                    Timestamp.from(w.pickupStart()), Timestamp.from(w.pickupEnd()), Timestamp.from(w.deliveryDeadline()),
                    address.location().getX(), address.location().getY(), now, now);
            if (inserted == 1) {
                jdbc.update("""
                        INSERT INTO order_status_history (id, order_id, from_status, to_status, actor_role, reason, occurred_at)
                        VALUES (?, ?, NULL, 'SCHEDULED', 'SYSTEM', 'Generated from subscription', ?)
                        """, UuidV7.generate(), orderId, now);
                created++;
            } else {
                skipped++;
            }
        }
        meters.counter("lunchbox.orders.generated").increment(created);
        GenerationResult result = new GenerationResult(date, schedules.size(), created, skipped);
        if (created > 0) {
            audit.record("orders.generated", "OrderBatch", date, null, result);
        }
        log.info("Order generation for {}: {}", date, result);
        return result;
    }
}
