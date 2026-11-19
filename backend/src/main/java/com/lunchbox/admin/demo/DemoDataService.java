package com.lunchbox.admin.demo;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.persistence.UuidV7;
import com.lunchbox.common.time.TimeZones;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * Realistic demo data for trying every admin page and chart: four schools in Hyderabad, forty families, twelve riders
 * and thirty days of deliveries with payments, ratings, failures and allocation decisions.
 *
 * <p>It can never touch real operations: every row is listed in {@code demo_records} and removed in one call; demo
 * schools, the demo plan and the demo coupon are inactive (parents never see them, nothing new is generated for them);
 * demo riders cannot take work; and there are no pending demo orders for the allocation jobs to pick up. Rows are
 * written with plain SQL, so no notifications, payouts or outbox events fire.
 */
@Slf4j
@Service
public class DemoDataService {

    /** Removal order: children before parents. Orders' history and decisions go with their orders. */
    private static final List<String> REMOVAL_ORDER = List.of("allocation_runs", "partner_issues", "assignments", "orders",
            "payments", "subscriptions", "partner_shifts", "addresses", "children", "parents", "delivery_partners", "users",
            "schools", "plans", "coupons");

    private static final String[] FIRST = {"Aarav", "Vihaan", "Ananya", "Diya", "Ishaan", "Aditi", "Arjun", "Saanvi", "Reyansh",
            "Myra", "Kabir", "Kavya", "Advik", "Ira", "Rohan", "Meera", "Siddharth", "Nisha", "Varun", "Tara", "Krish", "Riya",
            "Aryan", "Sneha", "Dev", "Pooja", "Nikhil", "Lakshmi", "Sai", "Harini"};
    private static final String[] LAST = {"Reddy", "Rao", "Sharma", "Naidu", "Iyer", "Khan", "Gupta", "Verma", "Patel", "Kumar",
            "Chowdary", "Menon", "Singh", "Joshi", "Desai"};
    private static final String[] RIDERS = {"Ravi Kumar", "Imran Shaikh", "Suresh Yadav", "Mahesh Goud", "Anil Reddy",
            "Farhan Ali", "Venkat Rao", "Praveen Kumar", "Sameer Khan", "Ramesh Naik", "Kiran Babu", "Naveen Chary"};

    private record DemoSchool(String code, String name, String area, String pincode, double lat, double lng,
                              LocalTime windowStart, LocalTime windowEnd, LocalTime lunch, String days) {
    }

    private static final List<DemoSchool> SCHOOLS = List.of(
            new DemoSchool("DEMO-GWP", "Demo · Greenwood Public School", "Road No. 12, Banjara Hills", "500034", 17.4156, 78.4347,
                    LocalTime.of(11, 30), LocalTime.of(12, 15), LocalTime.of(12, 30), "MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY"),
            new DemoSchool("DEMO-OAK", "Demo · Oakridge Academy", "Financial District, Gachibowli", "500032", 17.4401, 78.3489,
                    LocalTime.of(12, 0), LocalTime.of(12, 40), LocalTime.of(13, 0), "MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY"),
            new DemoSchool("DEMO-SVM", "Demo · Sri Vidya Mandir", "Ameerpet Main Road", "500016", 17.4375, 78.4482,
                    LocalTime.of(11, 45), LocalTime.of(12, 30), LocalTime.of(12, 45), "MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY"),
            new DemoSchool("DEMO-LVI", "Demo · Lakeview International", "Kondapur Main Road", "500084", 17.4699, 78.3578,
                    LocalTime.of(11, 30), LocalTime.of(12, 10), LocalTime.of(12, 30), "MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY"));

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public DemoDataService(JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    public record DemoDataStatus(boolean present, Map<String, Integer> records) {
    }

    @Transactional(readOnly = true)
    public DemoDataStatus status() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        jdbc.query("SELECT table_name, count(*) AS n FROM demo_records GROUP BY table_name ORDER BY table_name",
                rs -> {
                    counts.put(rs.getString("table_name"), rs.getInt("n"));
                });
        return new DemoDataStatus(!counts.isEmpty(), counts);
    }

    @Transactional
    public DemoDataStatus seed() {
        if (status().present()) {
            throw Errors.conflict("demo_present", "Demo data is already loaded. Remove it first to load it again.");
        }
        Random rnd = new Random(20261120L);
        Instant now = clock.instant();
        LocalDate today = TimeZones.todayIst(clock);
        Timestamp ts = Timestamp.from(now);

        // ---- Plan and coupon (inactive: never offered to real parents) ----
        UUID planId = insert("plans", """
                INSERT INTO plans (id, code, name, description, price_paise, billing_period, max_days_per_week, active,
                                   visibility, features, entitlements, created_at, updated_at)
                VALUES (?, 'DEMO_MONTHLY', 'Demo · Monthly lunch', 'Demo plan for trying the admin panel', 249900, 'MONTHLY', 6,
                        false, 'HIDDEN', '{"Pickup on school days","Photo at handover"}', '{"live_tracking": true}', ?, ?)
                """, ts, ts);
        insert("coupons", """
                INSERT INTO coupons (id, code, description, kind, amount, active, created_at, updated_at)
                VALUES (?, 'DEMOWELCOME', 'Demo coupon (inactive)', 'PERCENT', 10, false, ?, ?)
                """, ts, ts);

        // ---- Schools (inactive: hidden from parents' school search, no orders generated) ----
        List<UUID> schoolIds = new ArrayList<>();
        for (DemoSchool s : SCHOOLS) {
            schoolIds.add(insert("schools", """
                    INSERT INTO schools (id, code, name, address_line, city, pincode, location, geofence_radius_m, lunch_time,
                                         delivery_window_start, delivery_window_end, working_days, active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'Hyderabad', ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), 150, ?, ?, ?, ?, false, ?, ?)
                    """, s.code(), s.name(), s.area(), s.pincode(), s.lng(), s.lat(), s.lunch(), s.windowStart(), s.windowEnd(),
                    s.days(), ts, ts));
        }

        // ---- Riders (approved but inactive: they can never be given real work) ----
        List<UUID> riderIds = new ArrayList<>();
        for (int i = 0; i < RIDERS.length; i++) {
            String[] name = RIDERS[i].split(" ");
            UUID userId = insert("users", """
                    INSERT INTO users (id, firebase_uid, role, display_name, status, preferred_language, created_at, updated_at)
                    VALUES (?, ?, 'PARTNER', ?, 'ACTIVE', 'en', ?, ?)
                    """, "demo-rider-" + i, RIDERS[i], ts, ts);
            DemoSchool home = SCHOOLS.get(i % SCHOOLS.size());
            double rating = 3.9 + rnd.nextDouble() * 1.1;
            riderIds.add(insert("delivery_partners", """
                    INSERT INTO delivery_partners (id, user_id, first_name, last_name, vehicle_type, vehicle_number, capacity,
                                                   home_zone, service_radius_m, approval_status, approval_notes, rating,
                                                   rating_count, active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), 7000, 'APPROVED',
                            'Demo rider', ?, ?, false, ?, ?)
                    """, userId, name[0], name[1], i % 3 == 0 ? "EV_SCOOTER" : "SCOOTER",
                    String.format(Locale.ROOT, "TS09EV%04d", 4500 + i), 8 + (i % 3) * 2,
                    home.lng() + (rnd.nextDouble() - 0.5) * 0.04, home.lat() + (rnd.nextDouble() - 0.5) * 0.04,
                    Math.round(rating * 100) / 100.0, 20 + rnd.nextInt(80), ts, ts));
        }

        // ---- Families: parent, address near the school, one or two children, a paid plan ----
        record Kid(UUID childId, UUID parentId, UUID addressId, UUID subscriptionId, int school, double lat, double lng,
                   String days) {
        }
        List<Kid> kids = new ArrayList<>();
        for (int f = 0; f < 40; f++) {
            String first = FIRST[f % FIRST.length];
            String last = LAST[(f * 7) % LAST.length];
            UUID userId = insert("users", """
                    INSERT INTO users (id, firebase_uid, role, display_name, status, preferred_language, created_at, updated_at)
                    VALUES (?, ?, 'PARENT', ?, 'ACTIVE', ?, ?, ?)
                    """, "demo-parent-" + f, first + " " + last, f % 5 == 0 ? "hi" : "en", ts, ts);
            UUID parentId = insert("parents", """
                    INSERT INTO parents (id, user_id, first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
                    """, userId, first, last, ts, ts);
            int schoolIndex = f % SCHOOLS.size();
            DemoSchool school = SCHOOLS.get(schoolIndex);
            double lat = school.lat() + (rnd.nextDouble() - 0.5) * 0.05;
            double lng = school.lng() + (rnd.nextDouble() - 0.5) * 0.05;
            UUID addressId = insert("addresses", """
                    INSERT INTO addresses (id, parent_id, label, line1, line2, city, pincode, location, instructions, is_default,
                                           created_at, updated_at)
                    VALUES (?, ?, 'Home', ?, ?, 'Hyderabad', ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), 'Ring the bell', true, ?, ?)
                    """, parentId, "Flat " + (101 + f), school.area(), school.pincode(), lng, lat, ts, ts);
            int children = f % 3 == 0 ? 2 : 1;
            for (int c = 0; c < children; c++) {
                String childFirst = FIRST[(f * 3 + c * 11 + 5) % FIRST.length];
                UUID childId = insert("children", """
                        INSERT INTO children (id, parent_id, school_id, first_name, last_name, class_name, section, roll_number,
                                              created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, parentId, schoolIds.get(schoolIndex), childFirst, last, String.valueOf(1 + rnd.nextInt(10)),
                        String.valueOf((char) ('A' + rnd.nextInt(3))), String.valueOf(1 + rnd.nextInt(40)), ts, ts);
                String days = school.days().contains("SATURDAY") && rnd.nextBoolean() ? school.days()
                        : "MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY";
                LocalDate start = today.minusDays(35 + rnd.nextInt(20));
                UUID subId = insert("subscriptions", """
                        INSERT INTO subscriptions (id, parent_id, child_id, plan_id, address_id, days_of_week, start_date, status,
                                                   periods_paid, version, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 2, 0, ?, ?)
                        """, parentId, childId, planId, addressId, days, start, ts, ts);
                for (int p = 0; p < 2; p++) {
                    Instant paid = TimeZones.atIst(start.plusMonths(p), LocalTime.of(9 + rnd.nextInt(10), rnd.nextInt(60)));
                    insert("payments", """
                            INSERT INTO payments (id, parent_id, subscription_id, razorpay_payment_id, amount_paise, currency,
                                                  status, method, description, paid_at, created_at, updated_at)
                            VALUES (?, ?, ?, ?, 249900, 'INR', 'CAPTURED', ?, 'Demo · Monthly lunch', ?, ?, ?)
                            """, parentId, subId, "pay_demo_" + UUID.randomUUID().toString().substring(0, 12),
                            rnd.nextInt(10) < 7 ? "upi" : "card", Timestamp.from(paid), Timestamp.from(paid), Timestamp.from(paid));
                }
                kids.add(new Kid(childId, parentId, addressId, subId, schoolIndex, lat, lng, days));
            }
        }

        // ---- Thirty days of shifts, orders, assignments, ratings and a few issues ----
        int orders = 0;
        for (int back = 30; back >= 0; back--) {
            LocalDate date = today.minusDays(back);
            if (date.getDayOfWeek() == DayOfWeek.SUNDAY) {
                continue;
            }
            boolean isToday = back == 0;
            for (int r = 0; r < riderIds.size(); r++) {
                boolean noShow = !isToday && rnd.nextInt(100) < 3;
                insert("partner_shifts", """
                        INSERT INTO partner_shifts (id, partner_id, shift_date, planned_start, planned_end, started_at, ended_at,
                                                    status, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, riderIds.get(r), date, Timestamp.from(TimeZones.atIst(date, LocalTime.of(9, 0))),
                        Timestamp.from(TimeZones.atIst(date, LocalTime.of(13, 30))),
                        noShow ? null : Timestamp.from(TimeZones.atIst(date, LocalTime.of(9, rnd.nextInt(10)))),
                        noShow ? null : Timestamp.from(TimeZones.atIst(date, LocalTime.of(13, 10 + rnd.nextInt(15)))),
                        noShow ? "NO_SHOW" : "ENDED", ts, ts);
            }
            UUID runId = back <= 7 ? insert("allocation_runs", """
                    INSERT INTO allocation_runs (id, run_date, trigger, started_at, finished_at, weights, travel_source)
                    VALUES (?, ?, 'SCHEDULED', ?, ?, '{"distancePerKm": 1.0, "newSchoolKm": 3.0, "workloadKm": 2.0}', 'estimate')
                    """, date, Timestamp.from(TimeZones.atIst(date.minusDays(1), LocalTime.of(21, 5))),
                    Timestamp.from(TimeZones.atIst(date.minusDays(1), LocalTime.of(21, 5, 1)))) : null;
            int runAssigned = 0;
            int runUnassigned = 0;
            for (Kid k : kids) {
                if (!k.days().contains(date.getDayOfWeek().name())) {
                    continue;
                }
                if (!SCHOOLS.get(k.school()).days().contains(date.getDayOfWeek().name())) {
                    continue;
                }
                DemoSchool school = SCHOOLS.get(k.school());
                Instant deadline = TimeZones.atIst(date, school.windowEnd());
                Instant pickupStart = TimeZones.atIst(date, school.windowStart().minusMinutes(90));
                Instant pickupEnd = pickupStart.plusSeconds(45 * 60);
                UUID rider = riderIds.get((k.school() * 3 + Math.abs(k.childId().hashCode()) % 3) % riderIds.size());
                int roll = rnd.nextInt(100);
                String status;
                if (isToday) {
                    status = roll < 30 ? "DELIVERED" : roll < 45 ? "AT_SCHOOL" : roll < 65 ? "IN_TRANSIT"
                            : roll < 80 ? "PICKED_UP" : roll < 92 ? "PARTNER_EN_ROUTE" : roll < 96 ? "ASSIGNED" : "CANCELLED";
                } else {
                    status = roll < 88 ? "DELIVERED" : roll < 93 ? "CANCELLED" : roll < 97 ? "PICKUP_FAILED" : "DELIVERY_FAILED";
                }
                boolean late = rnd.nextInt(100) < 7;
                Instant pickedUp = pickupStart.plusSeconds(60L * rnd.nextInt(40));
                Instant delivered = late ? deadline.plusSeconds(60L * (2 + rnd.nextInt(12)))
                        : deadline.minusSeconds(60L * (5 + rnd.nextInt(30)));
                Short stars = "DELIVERED".equals(status) && rnd.nextInt(100) < 35 ? (short) (rnd.nextInt(100) < 80 ? 5 : 4) : null;
                boolean collected = List.of("PICKED_UP", "IN_TRANSIT", "AT_SCHOOL", "DELIVERED", "DELIVERY_FAILED").contains(status);
                UUID orderId = insert("orders", """
                        INSERT INTO orders (id, child_id, parent_id, school_id, address_id, subscription_id, scheduled_date,
                                            pickup_window_start, pickup_window_end, delivery_deadline, pickup_location, status,
                                            partner_id, source, cancel_reason, failure_reason, picked_up_at, delivered_at,
                                            rating_stars, rated_at, version, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, 'SUBSCRIPTION', ?, ?, ?, ?,
                                ?, ?, 0, ?, ?)
                        """, k.childId(), k.parentId(), schoolIds.get(k.school()), k.addressId(), k.subscriptionId(), date,
                        Timestamp.from(pickupStart), Timestamp.from(pickupEnd), Timestamp.from(deadline), k.lng(), k.lat(), status,
                        "CANCELLED".equals(status) ? null : rider,
                        "CANCELLED".equals(status) ? (rnd.nextBoolean() ? "Parent marked leave" : "School holiday: Bonalu") : null,
                        "PICKUP_FAILED".equals(status) ? "Parent not answering" : "DELIVERY_FAILED".equals(status)
                                ? "School gate closed" : null,
                        collected ? Timestamp.from(pickedUp) : null,
                        "DELIVERED".equals(status) ? Timestamp.from(delivered) : null,
                        stars,
                        stars == null ? null : Timestamp.from(delivered.plusSeconds(1800)),
                        Timestamp.from(TimeZones.atIst(date.minusDays(1), LocalTime.of(21, 0))), ts);
                jdbc.update("""
                        INSERT INTO order_status_history (id, order_id, from_status, to_status, actor_role, reason, occurred_at)
                        VALUES (?, ?, NULL, 'SCHEDULED', 'SYSTEM', 'Generated from subscription', ?), (?, ?, 'SCHEDULED', ?, 'SYSTEM', ?, ?)
                        """, UuidV7.generate(), orderId, Timestamp.from(TimeZones.atIst(date.minusDays(1), LocalTime.of(21, 0))),
                        UuidV7.generate(), orderId, status, "Demo data", Timestamp.from("DELIVERED".equals(status) ? delivered : pickupStart));
                if (!"CANCELLED".equals(status)) {
                    insert("assignments", """
                            INSERT INTO assignments (id, order_id, partner_id, status, assigned_at, version, created_at, updated_at)
                            VALUES (?, ?, ?, 'ACTIVE', ?, 0, ?, ?)
                            """, orderId, rider, Timestamp.from(TimeZones.atIst(date.minusDays(1), LocalTime.of(21, 5))), ts, ts);
                }
                if (runId != null) {
                    boolean unassigned = rnd.nextInt(100) < 2;
                    jdbc.update("""
                            INSERT INTO allocation_decisions (id, run_id, order_id, partner_id, outcome, reason_code, reason, breakdown,
                                                              eligible_riders, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?)
                            """, UuidV7.generate(), runId, orderId, unassigned ? null : rider,
                            unassigned ? "UNASSIGNED" : "ASSIGNED", unassigned ? "ALL_FULL" : "LOWEST_COST",
                            unassigned ? "Every rider who could take it is at capacity."
                                    : "Best of 3 eligible riders: 1.8 km to the home (estimated, ~6 min), already going to this school. (Demo)",
                            unassigned ? null : "{\"distanceKm\": 1.8, \"travelMinutes\": 6, \"roadDistance\": false, \"distanceCost\": 1.8, "
                                    + "\"newSchoolCost\": 0, \"workloadCost\": 0.6, \"ratingCost\": 0.2, \"reliabilityCost\": 0.3, \"total\": 2.9}",
                            unassigned ? 0 : 3, Timestamp.from(TimeZones.atIst(date.minusDays(1), LocalTime.of(21, 5))));
                    if (unassigned) {
                        runUnassigned++;
                    } else {
                        runAssigned++;
                    }
                }
                orders++;
            }
            if (runId != null) {
                jdbc.update("UPDATE allocation_runs SET considered = ?, assigned = ?, unassigned = ?, riders = ?, total_cost = ?, solve_ms = ? WHERE id = ?",
                        runAssigned + runUnassigned, runAssigned, runUnassigned, riderIds.size(), runAssigned * 2.9 + runUnassigned * 1000.0,
                        40 + rnd.nextInt(80), runId);
            }
        }
        for (int i = 0; i < 4; i++) {
            insert("partner_issues", """
                    INSERT INTO partner_issues (id, partner_id, issue_type, description, status, resolved_at, resolution_note,
                                                created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'RESOLVED', ?, 'Handled by ops (demo)', ?, ?)
                    """, riderIds.get(i), List.of("VEHICLE_BREAKDOWN", "PARENT_UNREACHABLE", "SCHOOL_CLOSED", "OTHER").get(i),
                    "Demo issue " + (i + 1), Timestamp.from(now.minusSeconds(86_400L * (i + 1))),
                    Timestamp.from(now.minusSeconds(86_400L * (i + 1) + 1800)), ts);
        }
        DemoDataStatus result = status();
        audit.record("demo.seeded", "DemoData", null, null, Map.of("records", result.records(), "orders", orders));
        log.info("Demo data loaded: {}", result.records());
        return result;
    }

    /** Deletes every demo row (and only those), children first. */
    @Transactional
    public DemoDataStatus remove() {
        DemoDataStatus before = status();
        String ids = "SELECT record_id FROM demo_records WHERE table_name = ?";
        jdbc.update("DELETE FROM allocation_decisions WHERE order_id IN (" + ids + ") OR run_id IN (" + ids.replace("?", "'allocation_runs'") + ")", "orders");
        jdbc.update("DELETE FROM order_status_history WHERE order_id IN (" + ids + ")", "orders");
        jdbc.update("DELETE FROM verifications WHERE order_id IN (" + ids + ")", "orders");
        jdbc.update("DELETE FROM route_stops WHERE order_id IN (" + ids + ")", "orders");
        jdbc.update("DELETE FROM routes WHERE partner_id IN (" + ids + ")", "delivery_partners");
        jdbc.update("DELETE FROM earnings_ledger WHERE partner_id IN (" + ids + ")", "delivery_partners");
        jdbc.update("DELETE FROM payouts WHERE partner_id IN (" + ids + ")", "delivery_partners");
        jdbc.update("DELETE FROM device_tokens WHERE user_id IN (" + ids + ")", "users");
        jdbc.update("DELETE FROM notifications WHERE user_id IN (" + ids + ")", "users");
        jdbc.update("DELETE FROM leave_days WHERE child_id IN (" + ids + ")", "children");
        jdbc.update("DELETE FROM consents WHERE user_id IN (" + ids + ")", "users");
        for (String table : REMOVAL_ORDER) {
            jdbc.update("DELETE FROM " + table + " WHERE id IN (" + ids + ")", table);
        }
        jdbc.update("DELETE FROM demo_records");
        audit.record("demo.removed", "DemoData", null, Map.of("records", before.records()), null);
        log.info("Demo data removed: {}", before.records());
        return status();
    }

    private UUID insert(String table, String sql, Object... args) {
        UUID id = UuidV7.generate();
        Object[] all = new Object[args.length + 1];
        all[0] = id;
        System.arraycopy(args, 0, all, 1, args.length);
        jdbc.update(sql, all);
        jdbc.update("INSERT INTO demo_records (table_name, record_id) VALUES (?, ?)", table, id);
        return id;
    }
}
