package com.lunchbox.dispatch;

import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.orders.OrderCommands;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Moves a route forward: which order is "partner en route", when boxes are "in transit" to school, and when they
 * are "at school". Shared by explicit partner actions and geofence events so both behave identically.
 */
@Slf4j
@Service
public class RouteProgressService implements DispatchTracking {

    private final RouteRepository routes;
    private final RouteStopRepository stops;
    private final DeliveryPartnerRepository partners;
    private final OrderQueries orderQueries;
    private final OrderCommands orderCommands;
    private final OutboxPublisher outbox;
    private final Clock clock;

    public RouteProgressService(RouteRepository routes, RouteStopRepository stops, DeliveryPartnerRepository partners,
                                OrderQueries orderQueries, OrderCommands orderCommands, OutboxPublisher outbox,
                                Clock clock) {
        this.routes = routes;
        this.stops = stops;
        this.partners = partners;
        this.orderQueries = orderQueries;
        this.orderCommands = orderCommands;
        this.outbox = outbox;
        this.clock = clock;
    }

    /** Payload of {@code route.completed}; drives the distance earning. */
    public record RouteCompleted(UUID routeId, UUID partnerId, LocalDate date, int distanceMeters) {
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ActiveRoute> activeRoute(UUID partnerUserId) {
        return partners.findByUserId(partnerUserId)
                .flatMap(p -> routes.findByPartnerIdAndRouteDate(p.getId(), TimeZones.todayIst(clock))
                        .filter(r -> r.getStatus() == Route.Status.ACTIVE)
                        .map(r -> new ActiveRoute(p.getId(), r.getId(), stops.findByRouteIdOrderBySequence(r.getId()).stream()
                                .filter(RouteStop::isOpen)
                                .map(s -> new StopPoint(s.getId(), s.getStopType(), s.getOrderId(), s.getSchoolId(),
                                        s.getLocation(), s.getStatus()))
                                .toList())));
    }

    @Override
    @Transactional
    public void arrivedAtPickup(UUID partnerId, UUID stopId) {
        stops.findById(stopId).filter(s -> s.getStatus() == RouteStop.Status.PENDING && s.getStopType() == RouteStop.Type.PICKUP)
                .ifPresent(stop -> {
                    Route route = routes.findById(stop.getRouteId()).orElseThrow();
                    if (!route.getPartnerId().equals(partnerId)) {
                        return;
                    }
                    stop.arrive(clock.instant());
                    OrderView order = orderQueries.require(stop.getOrderId());
                    if (order.status() == OrderStatus.ASSIGNED) {
                        orderCommands.transition(order.id(), OrderStatus.PARTNER_EN_ROUTE, null, Map.of("trigger", "arrival"));
                    }
                    outbox.publish("Order", order.id(), Messaging.PARTNER_ARRIVING,
                            new PartnerArriving(order.id(), order.parentId(), partnerId, clock.instant()));
                });
    }

    @Override
    @Transactional
    public void arrivedAtSchool(UUID partnerId, UUID schoolId) {
        LocalDate today = TimeZones.todayIst(clock);
        routes.findByPartnerIdAndRouteDate(partnerId, today).ifPresent(route -> {
            stops.findByRouteIdOrderBySequence(route.getId()).stream()
                    .filter(s -> s.getStopType() == RouteStop.Type.DROP && schoolId.equals(s.getSchoolId()) && s.isOpen())
                    .findFirst().ifPresent(s -> s.arrive(clock.instant()));
            for (OrderView o : ordersForSchool(partnerId, today, schoolId)) {
                if (o.status() == OrderStatus.PICKED_UP) {
                    orderCommands.transition(o.id(), OrderStatus.IN_TRANSIT, null, Map.of("trigger", "school_geofence"));
                    orderCommands.transition(o.id(), OrderStatus.AT_SCHOOL, null, Map.of("trigger", "school_geofence"));
                } else if (o.status() == OrderStatus.IN_TRANSIT) {
                    orderCommands.transition(o.id(), OrderStatus.AT_SCHOOL, null, Map.of("trigger", "school_geofence"));
                }
            }
        });
    }

    /**
     * Advances to the next open stop: the next pickup's order becomes PARTNER_EN_ROUTE, or — when the next stop is a
     * school — the lunchboxes on board for that school become IN_TRANSIT. Completes the route when nothing is open.
     */
    @Transactional
    public void advance(Route route) {
        List<RouteStop> all = stops.findByRouteIdOrderBySequence(route.getId());
        Optional<RouteStop> next = all.stream().filter(RouteStop::isOpen).findFirst();
        if (next.isEmpty()) {
            if (route.getStatus() == Route.Status.ACTIVE) {
                route.complete(clock.instant());
                outbox.publish("Route", route.getId(), Messaging.ROUTE_COMPLETED,
                        new RouteCompleted(route.getId(), route.getPartnerId(), route.getRouteDate(), route.getTotalDistanceM()));
            }
            return;
        }
        RouteStop stop = next.get();
        if (stop.getStopType() == RouteStop.Type.PICKUP) {
            OrderView order = orderQueries.require(stop.getOrderId());
            if (order.status() == OrderStatus.ASSIGNED) {
                orderCommands.transition(order.id(), OrderStatus.PARTNER_EN_ROUTE, null, Map.of("trigger", "route_advance"));
            } else if (order.status().isTerminal() || order.status() == OrderStatus.REASSIGNED) {
                stop.skip(clock.instant());
                advance(route);
            }
        } else {
            List<OrderView> forSchool = ordersForSchool(route.getPartnerId(), route.getRouteDate(), stop.getSchoolId());
            boolean anyOnBoard = false;
            for (OrderView o : forSchool) {
                if (o.status() == OrderStatus.PICKED_UP) {
                    orderCommands.transition(o.id(), OrderStatus.IN_TRANSIT, null, Map.of("trigger", "route_advance"));
                    anyOnBoard = true;
                } else if (o.status() == OrderStatus.IN_TRANSIT || o.status() == OrderStatus.AT_SCHOOL) {
                    anyOnBoard = true;
                }
            }
            if (!anyOnBoard) {
                stop.skip(clock.instant());
                advance(route);
            }
        }
    }

    List<OrderView> ordersForSchool(UUID partnerId, LocalDate date, UUID schoolId) {
        return orderQueries.forPartnerAndDate(partnerId, date).stream()
                .filter(o -> o.schoolId().equals(schoolId))
                .toList();
    }
}
