package com.lunchbox.tracking;

import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.dispatch.DispatchTracking;
import com.lunchbox.dispatch.DispatchTracking.ActiveRoute;
import com.lunchbox.dispatch.DispatchTracking.StopPoint;
import com.lunchbox.dispatch.RouteStop;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.schools.SchoolDirectory.SchoolInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Turns position fixes into route events: arriving at the next home (radius check) and entering a school
 * (polygon {@code contains}, or radius when the school has no polygon). Each trigger fires once (Redis SETNX).
 * Route and school data are cached briefly in memory so the hot path does not hit Postgres on every ping.
 */
@Slf4j
@Component
public class GeofenceMonitor {

    private static final Duration ROUTE_CACHE_TTL = Duration.ofSeconds(20);
    private static final Duration SCHOOL_CACHE_TTL = Duration.ofMinutes(5);

    private final DispatchTracking dispatch;
    private final SchoolDirectory schools;
    private final PlatformSettings settings;
    private final LiveLocationStore store;
    private final Clock clock;
    private final ConcurrentHashMap<UUID, Cached<Optional<ActiveRoute>>> routeCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Cached<SchoolInfo>> schoolCache = new ConcurrentHashMap<>();

    public GeofenceMonitor(DispatchTracking dispatch, SchoolDirectory schools, PlatformSettings settings,
                           LiveLocationStore store, Clock clock) {
        this.dispatch = dispatch;
        this.schools = schools;
        this.settings = settings;
        this.store = store;
        this.clock = clock;
    }

    private record Cached<T>(T value, Instant expiresAt) {
    }

    public Optional<ActiveRoute> activeRoute(UUID partnerUserId) {
        Instant now = clock.instant();
        Cached<Optional<ActiveRoute>> c = routeCache.get(partnerUserId);
        if (c != null && c.expiresAt().isAfter(now)) {
            return c.value();
        }
        Optional<ActiveRoute> route = dispatch.activeRoute(partnerUserId);
        routeCache.put(partnerUserId, new Cached<>(route, now.plus(ROUTE_CACHE_TTL)));
        return route;
    }

    public void evaluate(UUID partnerUserId, ActiveRoute route, double lat, double lng) {
        boolean changed = false;
        Optional<StopPoint> nextPickup = route.openStops().stream()
                .filter(s -> s.type() == RouteStop.Type.PICKUP && s.status() == RouteStop.Status.PENDING)
                .findFirst();
        if (nextPickup.isPresent()) {
            StopPoint stop = nextPickup.get();
            double d = Geo.haversineMeters(stop.location().getY(), stop.location().getX(), lat, lng);
            if (d <= settings.homeArrivalRadiusM() && store.once("trk:arrived:" + stop.stopId(), Duration.ofHours(12))) {
                safely(() -> dispatch.arrivedAtPickup(route.partnerId(), stop.stopId()));
                changed = true;
            }
        }
        for (StopPoint stop : route.openStops()) {
            if (stop.type() != RouteStop.Type.DROP || stop.status() != RouteStop.Status.PENDING) {
                continue;
            }
            SchoolInfo school = school(stop.schoolId());
            int radius = school.geofenceRadiusM() != null ? school.geofenceRadiusM() : settings.defaultSchoolGeofenceRadiusM();
            if (Geo.insideGeofence(school.geofence(), school.location(), radius, lat, lng)
                    && store.once("trk:at-school:" + route.routeId() + ":" + stop.schoolId(), Duration.ofHours(12))) {
                safely(() -> dispatch.arrivedAtSchool(route.partnerId(), stop.schoolId()));
                changed = true;
            }
        }
        if (changed) {
            routeCache.remove(partnerUserId);
        }
    }

    private SchoolInfo school(UUID schoolId) {
        Instant now = clock.instant();
        Cached<SchoolInfo> c = schoolCache.get(schoolId);
        if (c != null && c.expiresAt().isAfter(now)) {
            return c.value();
        }
        SchoolInfo info = schools.require(schoolId);
        schoolCache.put(schoolId, new Cached<>(info, now.plus(SCHOOL_CACHE_TTL)));
        return info;
    }

    private static void safely(Runnable action) {
        try {
            action.run();
        } catch (RuntimeException e) {
            log.warn("Geofence transition failed: {}", e.getMessage());
        }
    }
}
