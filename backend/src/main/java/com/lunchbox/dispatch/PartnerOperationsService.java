package com.lunchbox.dispatch;

import com.lunchbox.addresses.AddressDirectory;
import com.lunchbox.addresses.AddressDirectory.AddressInfo;
import com.lunchbox.children.ChildDirectory;
import com.lunchbox.children.ChildDirectory.ChildInfo;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.common.storage.StorageService.PresignedUpload;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.common.web.Validation;
import com.lunchbox.dispatch.web.DispatchDtos.DropStopDetails;
import com.lunchbox.dispatch.web.DispatchDtos.FailureRequest;
import com.lunchbox.dispatch.web.DispatchDtos.HandoverRequest;
import com.lunchbox.dispatch.web.DispatchDtos.IssueRequest;
import com.lunchbox.dispatch.web.DispatchDtos.PartnerMeResponse;
import com.lunchbox.dispatch.web.DispatchDtos.PickupConfirmRequest;
import com.lunchbox.dispatch.web.DispatchDtos.PickupStopDetails;
import com.lunchbox.dispatch.web.DispatchDtos.StopView;
import com.lunchbox.dispatch.web.DispatchDtos.TodayRouteResponse;
import com.lunchbox.orders.OrderCommands;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import com.lunchbox.users.UserDirectory;
import com.lunchbox.users.UserDirectory.ParentInfo;
import com.lunchbox.verification.HandoverVerifier;
import com.lunchbox.verification.PickupVerifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Everything the partner app does during the day. Every action re-checks that the order belongs to this partner and
 * is scheduled for today (partners never see other partners' stops or future days).
 */
@Service
public class PartnerOperationsService {

    private final PartnerDirectory partners;
    private final ShiftService shifts;
    private final RouteRepository routes;
    private final RouteStopRepository stops;
    private final RoutePlanningService planning;
    private final RouteProgressService progress;
    private final PartnerIssueRepository issues;
    private final OrderQueries orderQueries;
    private final OrderCommands orderCommands;
    private final PickupVerifier pickupVerifier;
    private final HandoverVerifier handoverVerifier;
    private final UserDirectory users;
    private final AddressDirectory addresses;
    private final ChildDirectory children;
    private final SchoolDirectory schools;
    private final PlatformSettings settings;
    private final OutboxPublisher outbox;
    private final Clock clock;

    public PartnerOperationsService(PartnerDirectory partners, ShiftService shifts, RouteRepository routes,
                                    RouteStopRepository stops, RoutePlanningService planning,
                                    RouteProgressService progress, PartnerIssueRepository issues,
                                    OrderQueries orderQueries, OrderCommands orderCommands,
                                    PickupVerifier pickupVerifier, HandoverVerifier handoverVerifier,
                                    UserDirectory users, AddressDirectory addresses, ChildDirectory children,
                                    SchoolDirectory schools, PlatformSettings settings, OutboxPublisher outbox,
                                    Clock clock) {
        this.partners = partners;
        this.shifts = shifts;
        this.routes = routes;
        this.stops = stops;
        this.planning = planning;
        this.progress = progress;
        this.issues = issues;
        this.orderQueries = orderQueries;
        this.orderCommands = orderCommands;
        this.pickupVerifier = pickupVerifier;
        this.handoverVerifier = handoverVerifier;
        this.users = users;
        this.addresses = addresses;
        this.children = children;
        this.schools = schools;
        this.settings = settings;
        this.outbox = outbox;
        this.clock = clock;
    }

    /** Payload of {@code partner.issue_reported}. */
    public record IssueReported(UUID issueId, UUID partnerId, String partnerName, UUID orderId, PartnerIssue.Type type,
                                String description, Double lat, Double lng, Instant at) {
    }

    @Transactional(readOnly = true)
    public PartnerMeResponse me(UUID partnerUserId) {
        PartnerDirectory.PartnerInfo p = partners.requireWorkingPartner(partnerUserId);
        return new PartnerMeResponse(p.id(), p.firstName(), p.lastName(), p.vehicleType(), p.vehicleNumber(), p.capacity(),
                p.rating(), shifts.today(p.id()));
    }

    @Transactional
    public TodayRouteResponse todayRoute(UUID partnerUserId) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        LocalDate today = today();
        Route route = routes.findByPartnerIdAndRouteDate(partner.id(), today)
                .or(() -> planning.plan(partner.id(), today).flatMap(routes::findById))
                .orElse(null);
        if (route == null) {
            return new TodayRouteResponse(null, today, null, 0, 0, List.of());
        }
        return view(route);
    }

    @Transactional
    public TodayRouteResponse startRoute(UUID partnerUserId) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        var shift = shifts.today(partner.id());
        if (shift == null || shift.status() != PartnerShift.Status.ACTIVE) {
            throw Errors.unprocessable("shift_not_started", "Start your shift before starting the route.");
        }
        Route route = requireTodayRoute(partner.id());
        if (route.getStatus() == Route.Status.PLANNED) {
            route.start(clock.instant());
            progress.advance(route);
        }
        return view(route);
    }

    @Transactional
    public TodayRouteResponse arrive(UUID partnerUserId, UUID stopId, GeoPoint at) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        Route route = requireTodayRoute(partner.id());
        RouteStop stop = stops.findById(stopId).filter(s -> s.getRouteId().equals(route.getId()))
                .orElseThrow(() -> Errors.notFound("Stop"));
        double distance = Geo.haversineMeters(stop.getLocation().getY(), stop.getLocation().getX(), at.lat(), at.lng());
        int allowed = Math.max(settings.homeArrivalRadiusM() * 2, 150);
        if (stop.getStopType() == RouteStop.Type.PICKUP) {
            if (distance > allowed) {
                throw Errors.unprocessable("not_at_stop", "You appear to be " + Math.round(distance) + " m from this home.");
            }
            progress.arrivedAtPickup(partner.id(), stopId);
        } else {
            SchoolInfo school = schools.require(stop.getSchoolId());
            int radius = school.geofenceRadiusM() != null ? school.geofenceRadiusM() : settings.defaultSchoolGeofenceRadiusM();
            if (!Geo.insideGeofence(school.geofence(), school.location(), radius, at.lat(), at.lng())) {
                throw Errors.unprocessable("not_at_stop", "You need to be inside the school premises.");
            }
            progress.arrivedAtSchool(partner.id(), stop.getSchoolId());
        }
        return view(route);
    }

    @Transactional
    public TodayRouteResponse confirmPickup(UUID partnerUserId, UUID orderId, PickupConfirmRequest request) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        OrderView order = requireOwnOrderToday(partner.id(), orderId);
        Route route = requireActiveRoute(partner.id());
        if (order.status() == OrderStatus.PICKED_UP || OrderStatus.IN_CUSTODY.contains(order.status())) {
            return view(route);
        }
        if (order.status() == OrderStatus.ASSIGNED) {
            orderCommands.transition(orderId, OrderStatus.PARTNER_EN_ROUTE, null, Map.of("trigger", "pickup"));
        } else if (order.status() != OrderStatus.PARTNER_EN_ROUTE) {
            throw Errors.conflict("not_collectable", "This lunchbox cannot be collected now (" + order.status() + ").");
        }
        pickupVerifier.verifyPickup(orderId, partnerUserId, request.method(), request.code(), request.location());
        orderCommands.transition(orderId, OrderStatus.PICKED_UP, null,
                Map.of("method", request.method().name(), "lat", request.location().lat(), "lng", request.location().lng()));
        stopFor(route, orderId).complete(clock.instant());
        progress.advance(route);
        return view(route);
    }

    @Transactional
    public TodayRouteResponse pickupFailed(UUID partnerUserId, UUID orderId, FailureRequest request) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        OrderView order = requireOwnOrderToday(partner.id(), orderId);
        Route route = requireActiveRoute(partner.id());
        if (order.status() == OrderStatus.PICKUP_FAILED) {
            return view(route);
        }
        RouteStop stop = stopFor(route, orderId);
        if (stop.getArrivedAt() == null) {
            throw Errors.unprocessable("not_arrived", "Mark that you have arrived at the home first.");
        }
        Instant canFailAt = stop.getArrivedAt().plusSeconds(settings.pickupWaitMinutes() * 60L);
        if (clock.instant().isBefore(canFailAt)) {
            long secondsLeft = canFailAt.getEpochSecond() - clock.instant().getEpochSecond();
            throw Errors.unprocessable("wait_timer", "Please wait " + Math.max(1, (secondsLeft + 59) / 60)
                    + " more minute(s) and try calling the parent.");
        }
        orderCommands.transition(orderId, OrderStatus.PICKUP_FAILED, request.reason(), Map.of("waitedFrom", stop.getArrivedAt().toString()));
        stop.fail(clock.instant());
        progress.advance(route);
        return view(route);
    }

    public PresignedUpload handoverPhotoUpload(UUID partnerUserId) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        return handoverVerifier.presignHandoverPhoto(partner.id(), today());
    }

    @Transactional
    public TodayRouteResponse handover(UUID partnerUserId, UUID schoolId, HandoverRequest request) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        Route route = requireActiveRoute(partner.id());
        List<OrderView> boxes = progress.ordersForSchool(partner.id(), today(), schoolId).stream()
                .filter(o -> EnumSet.of(OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT, OrderStatus.AT_SCHOOL).contains(o.status()))
                .toList();
        if (boxes.isEmpty()) {
            return view(route);
        }
        handoverVerifier.verifyHandover(partner.id(), partnerUserId, schoolId, boxes.stream().map(OrderView::id).toList(),
                request.photoKey(), request.location(), today());
        for (OrderView o : boxes) {
            OrderStatus s = o.status();
            if (s == OrderStatus.PICKED_UP) {
                orderCommands.transition(o.id(), OrderStatus.IN_TRANSIT, null, Map.of("trigger", "handover"));
                s = OrderStatus.IN_TRANSIT;
            }
            if (s == OrderStatus.IN_TRANSIT) {
                orderCommands.transition(o.id(), OrderStatus.AT_SCHOOL, null, Map.of("trigger", "handover"));
            }
            orderCommands.transition(o.id(), OrderStatus.DELIVERED, null, Map.of("photoKey", request.photoKey()));
        }
        stops.findByRouteIdOrderBySequence(route.getId()).stream()
                .filter(st -> st.getStopType() == RouteStop.Type.DROP && schoolId.equals(st.getSchoolId()) && st.isOpen())
                .forEach(st -> st.complete(clock.instant()));
        progress.advance(route);
        return view(route);
    }

    @Transactional
    public TodayRouteResponse deliveryFailed(UUID partnerUserId, UUID orderId, FailureRequest request) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        OrderView order = requireOwnOrderToday(partner.id(), orderId);
        Route route = requireActiveRoute(partner.id());
        if (order.status() == OrderStatus.DELIVERY_FAILED) {
            return view(route);
        }
        if (order.status() == OrderStatus.PICKED_UP) {
            orderCommands.transition(orderId, OrderStatus.IN_TRANSIT, null, Map.of("trigger", "delivery_failed"));
        }
        orderCommands.transition(orderId, OrderStatus.DELIVERY_FAILED, request.reason(),
                request.location() == null ? Map.of() : Map.of("lat", request.location().lat(), "lng", request.location().lng()));
        boolean anyLeft = progress.ordersForSchool(partner.id(), today(), order.schoolId()).stream()
                .anyMatch(o -> OrderStatus.IN_CUSTODY.contains(o.status()));
        if (!anyLeft) {
            stops.findByRouteIdOrderBySequence(route.getId()).stream()
                    .filter(st -> st.getStopType() == RouteStop.Type.DROP && order.schoolId().equals(st.getSchoolId()) && st.isOpen())
                    .forEach(st -> st.fail(clock.instant()));
        }
        progress.advance(route);
        return view(route);
    }

    @Transactional
    public UUID reportIssue(UUID partnerUserId, IssueRequest request) {
        PartnerDirectory.PartnerInfo partner = partners.requireWorkingPartner(partnerUserId);
        if (request.orderId() != null) {
            requireOwnOrderToday(partner.id(), request.orderId());
        }
        PartnerIssue issue = issues.save(new PartnerIssue(partner.id(), request.orderId(), request.type(),
                request.description(), request.location() == null ? null : Geo.point(request.location())));
        outbox.publish("PartnerIssue", issue.getId(), Messaging.PARTNER_ISSUE_REPORTED, new IssueReported(issue.getId(),
                partner.id(), partner.displayName(), request.orderId(), request.type(), request.description(),
                request.location() == null ? null : request.location().lat(),
                request.location() == null ? null : request.location().lng(), clock.instant()));
        return issue.getId();
    }

    // ---- views & guards ----

    private TodayRouteResponse view(Route route) {
        List<RouteStop> list = stops.findByRouteIdOrderBySequence(route.getId());
        Map<UUID, OrderView> orderMap = orderQueries.findAll(list.stream().map(RouteStop::getOrderId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet()));
        Map<UUID, AddressInfo> addressMap = addresses.findAll(orderMap.values().stream().map(OrderView::addressId).collect(Collectors.toSet()));
        Map<UUID, ChildInfo> childMap = children.findAll(orderMap.values().stream().map(OrderView::childId).collect(Collectors.toSet()));
        Map<UUID, SchoolInfo> schoolMap = schools.findAll(list.stream().map(RouteStop::getSchoolId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet()));
        Map<UUID, ParentInfo> parentCache = new HashMap<>();
        Map<UUID, List<UUID>> ordersBySchool = orderMap.values().stream()
                .collect(Collectors.groupingBy(OrderView::schoolId, Collectors.mapping(OrderView::id, Collectors.toList())));

        List<StopView> views = list.stream().map(s -> {
            PickupStopDetails pickup = null;
            DropStopDetails drop = null;
            if (s.getStopType() == RouteStop.Type.PICKUP) {
                OrderView o = orderMap.get(s.getOrderId());
                AddressInfo a = addressMap.get(o.addressId());
                ChildInfo c = childMap.get(o.childId());
                ParentInfo parent = parentCache.computeIfAbsent(o.parentId(), users::requireParent);
                pickup = new PickupStopDetails(o.id(), o.status(), parent.firstName(), Validation.maskPhone(parent.phone()),
                        a == null ? null : a.singleLine(), a == null ? null : a.landmark(), a == null ? null : a.instructions(),
                        c == null ? null : c.firstName(), c == null ? null : c.className(),
                        o.pickupWindowStart(), o.pickupWindowEnd());
            } else {
                SchoolInfo school = schoolMap.get(s.getSchoolId());
                drop = new DropStopDetails(s.getSchoolId(), school == null ? null : school.name(),
                        school == null ? null : school.addressLine(), school == null ? null : school.handoverInstructions(),
                        school == null ? null : TimeZones.atIst(route.getRouteDate(), school.deliveryWindowEnd()),
                        ordersBySchool.getOrDefault(s.getSchoolId(), List.of()));
            }
            return new StopView(s.getId(), s.getSequence(), s.getStopType(), s.getStatus(), Geo.toGeoPoint(s.getLocation()),
                    s.getPlannedEta(), s.getArrivedAt(), s.getCompletedAt(), pickup, drop);
        }).toList();
        return new TodayRouteResponse(route.getId(), route.getRouteDate(), route.getStatus(), route.getTotalDistanceM(),
                route.getTotalDurationS(), views);
    }

    private OrderView requireOwnOrderToday(UUID partnerId, UUID orderId) {
        OrderView order = orderQueries.find(orderId).orElseThrow(() -> Errors.notFound("Order"));
        if (!partnerId.equals(order.partnerId()) || !order.scheduledDate().equals(today())) {
            throw Errors.notFound("Order");
        }
        return order;
    }

    private Route requireTodayRoute(UUID partnerId) {
        return routes.findByPartnerIdAndRouteDate(partnerId, today())
                .orElseThrow(() -> Errors.unprocessable("no_route", "You have no deliveries today."));
    }

    private Route requireActiveRoute(UUID partnerId) {
        Route route = requireTodayRoute(partnerId);
        if (route.getStatus() != Route.Status.ACTIVE) {
            throw Errors.unprocessable("route_not_started", "Start your route first.");
        }
        return route;
    }

    private RouteStop stopFor(Route route, UUID orderId) {
        return stops.findByRouteIdOrderBySequence(route.getId()).stream()
                .filter(s -> orderId.equals(s.getOrderId()))
                .findFirst()
                .orElseThrow(() -> Errors.notFound("Stop"));
    }

    private LocalDate today() {
        return TimeZones.todayIst(clock);
    }
}
