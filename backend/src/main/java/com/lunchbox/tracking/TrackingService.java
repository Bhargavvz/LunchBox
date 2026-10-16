package com.lunchbox.tracking;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.persistence.UuidV7;
import com.lunchbox.common.ratelimit.RateLimitPolicy;
import com.lunchbox.common.ratelimit.RateLimiter;
import com.lunchbox.common.storage.StorageService;
import com.lunchbox.dispatch.DispatchTracking.ActiveRoute;
import com.lunchbox.dispatch.PartnerDirectory;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.tracking.LiveLocationStore.BufferedPing;
import com.lunchbox.tracking.LiveLocationStore.Fix;
import com.lunchbox.tracking.TrackingDtos.IngestResult;
import com.lunchbox.tracking.TrackingDtos.LiveLocation;
import com.lunchbox.tracking.TrackingDtos.LivePartnerMessage;
import com.lunchbox.tracking.TrackingDtos.LivePartnerResponse;
import com.lunchbox.tracking.TrackingDtos.PartnerCard;
import com.lunchbox.tracking.TrackingDtos.PingInput;
import com.lunchbox.tracking.TrackingDtos.TrackingMessage;
import com.lunchbox.tracking.TrackingDtos.TrackingSnapshotResponse;
import com.lunchbox.users.ConsentPurpose;
import com.lunchbox.users.UserDirectory;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.extern.slf4j.Slf4j;
import com.lunchbox.common.messaging.LiveBroadcaster;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Live tracking pipeline: partner app → (STOMP or HTTP batch) → validate → Redis GEO/latest → broadcast to each
 * watching parent's order topic and (throttled) the ops map → buffer for batched persistence → geofence events.
 * Partners are only tracked while they have an active route.
 */
@Slf4j
@Service
public class TrackingService {

    private final PartnerDirectory partners;
    private final LiveLocationStore store;
    private final GeofenceMonitor geofences;
    private final EtaEstimator eta;
    private final LiveBroadcaster messaging;
    private final RateLimiter rateLimiter;
    private final OrderQueries orders;
    private final UserDirectory users;
    private final SchoolDirectory schools;
    private final StorageService storage;
    private final LunchBoxProperties.Tracking config;
    private final MeterRegistry meters;
    private final Clock clock;

    public TrackingService(PartnerDirectory partners, LiveLocationStore store, GeofenceMonitor geofences, EtaEstimator eta,
                           LiveBroadcaster messaging, RateLimiter rateLimiter, OrderQueries orders,
                           UserDirectory users, SchoolDirectory schools, StorageService storage,
                           LunchBoxProperties properties, MeterRegistry meters, Clock clock) {
        this.partners = partners;
        this.store = store;
        this.geofences = geofences;
        this.eta = eta;
        this.messaging = messaging;
        this.rateLimiter = rateLimiter;
        this.orders = orders;
        this.users = users;
        this.schools = schools;
        this.storage = storage;
        this.config = properties.tracking();
        this.meters = meters;
        this.clock = clock;
    }

    public IngestResult ingest(UUID partnerUserId, List<PingInput> pings) {
        Timer.Sample sample = Timer.start(meters);
        try {
            rateLimiter.consume(RateLimitPolicy.LOCATION, partnerUserId.toString());
            Optional<ActiveRoute> route = geofences.activeRoute(partnerUserId);
            if (route.isEmpty()) {
                return new IngestResult(0, pings.size(), false);
            }
            UUID partnerId = route.get().partnerId();
            Instant now = clock.instant();
            Fix last = store.last(partnerId).orElse(null);
            List<BufferedPing> accepted = new ArrayList<>();
            int rejected = 0;
            for (PingInput p : pings.stream().sorted(Comparator.comparing(PingInput::recordedAt)).toList()) {
                if (!plausible(p, last, now)) {
                    rejected++;
                    continue;
                }
                accepted.add(new BufferedPing(UuidV7.generate(), partnerId, route.get().routeId(), p.lat(), p.lng(),
                        p.accuracyM(), p.speedMps(), p.headingDeg(), p.batteryPct(), p.recordedAt(), now));
                last = new Fix(p.lat(), p.lng(), p.accuracyM(), p.speedMps(), p.headingDeg(), p.batteryPct(), p.recordedAt());
            }
            if (accepted.isEmpty()) {
                return new IngestResult(0, rejected, true);
            }
            store.buffer(accepted);
            store.updateLatest(partnerId, last);
            broadcast(partnerId, last);
            geofences.evaluate(partnerUserId, route.get(), last.lat(), last.lng());
            meters.counter("lunchbox.tracking.pings", "result", "accepted").increment(accepted.size());
            if (rejected > 0) {
                meters.counter("lunchbox.tracking.pings", "result", "rejected").increment(rejected);
            }
            return new IngestResult(accepted.size(), rejected, true);
        } finally {
            sample.stop(meters.timer("lunchbox.tracking.ingest"));
        }
    }

    /** Rejects stale, future, inaccurate and physically impossible fixes (anomaly detection on speed). */
    private boolean plausible(PingInput p, Fix last, Instant now) {
        if (p.recordedAt().isAfter(now.plusSeconds(30)) || p.recordedAt().isBefore(now.minus(config.maxPingAge()))) {
            return false;
        }
        if (p.accuracyM() != null && p.accuracyM() > config.maxAccuracyM()) {
            return false;
        }
        if (last == null) {
            return true;
        }
        if (!p.recordedAt().isAfter(last.recordedAt())) {
            return false;
        }
        double seconds = Duration.between(last.recordedAt(), p.recordedAt()).toMillis() / 1000.0;
        double meters = Geo.haversineMeters(last.lat(), last.lng(), p.lat(), p.lng());
        double kmph = seconds <= 0 ? 0 : (meters / seconds) * 3.6;
        if (kmph > config.maxSpeedKmph() && meters > 200) {
            this.meters.counter("lunchbox.anomaly.impossible_speed").increment();
            return false;
        }
        return true;
    }

    private void broadcast(UUID partnerId, Fix fix) {
        Set<String> watched = store.trackableOrders(partnerId);
        for (String id : watched) {
            UUID orderId = UUID.fromString(id);
            var meta = store.meta(orderId);
            Integer etaSeconds = meta.map(m -> eta.seconds(fix.lat(), fix.lng(), m.destLat(), m.destLng())).orElse(null);
            OrderStatus status = meta.map(m -> OrderStatus.valueOf(m.status())).orElse(null);
            messaging.send("/topic/orders." + orderId, new TrackingMessage("location", orderId, status,
                    fix.lat(), fix.lng(), fix.headingDeg(), fix.speedMps(), etaSeconds, fix.recordedAt()));
        }
        if (store.once("trk:admin-throttle:" + partnerId, Duration.ofSeconds(10))) {
            messaging.send("/topic/admin.live", new LivePartnerMessage(partnerId, fix.lat(), fix.lng(),
                    fix.headingDeg(), fix.speedMps(), watched.size(), fix.recordedAt()));
        }
    }

    // ---- Parent snapshot ----

    public TrackingSnapshotResponse snapshot(UUID parentUserId, UUID orderId) {
        UUID parentId = users.requireParentId(parentUserId);
        OrderView order = orders.requireOwnedByParent(orderId, parentId);
        boolean consent = users.hasActiveConsent(parentUserId, ConsentPurpose.LIVE_TRACKING);
        PartnerCard card = null;
        LiveLocation location = null;
        Integer etaSeconds = null;
        String destType = order.status() == OrderStatus.PARTNER_EN_ROUTE ? "HOME" : "SCHOOL";
        GeoPoint destination = "HOME".equals(destType)
                ? Geo.toGeoPoint(order.pickupLocation())
                : Geo.toGeoPoint(schools.require(order.schoolId()).location());
        if (order.partnerId() != null && !order.status().isTerminal()) {
            var p = partners.require(order.partnerId());
            String photo = p.photoKey() == null ? null
                    : storage.presignDownload(StorageService.Bucket.KYC, p.photoKey(), Duration.ofMinutes(10));
            card = new PartnerCard(p.firstName(), p.vehicleType(), p.vehicleNumber(), p.rating(), photo);
            if (consent && OrderStatus.TRACKABLE.contains(order.status())) {
                Optional<Fix> fix = store.last(order.partnerId());
                if (fix.isPresent()) {
                    Fix f = fix.get();
                    location = new LiveLocation(f.lat(), f.lng(), f.headingDeg(), f.speedMps(), f.recordedAt());
                    etaSeconds = eta.seconds(f.lat(), f.lng(), destination.lat(), destination.lng());
                }
            }
        }
        return new TrackingSnapshotResponse(order.id(), order.status(), consent, card, location, etaSeconds, destType,
                destination);
    }

    // ---- Ops ----

    public List<LivePartnerResponse> livePartners() {
        List<UUID> ids = store.allLivePartners();
        Map<UUID, PartnerDirectory.PartnerInfo> info = partners.findAll(ids);
        Instant staleBefore = clock.instant().minus(Duration.ofMinutes(15));
        List<LivePartnerResponse> out = new ArrayList<>();
        for (UUID id : ids) {
            Optional<Fix> fix = store.last(id);
            if (fix.isEmpty() || fix.get().recordedAt().isBefore(staleBefore)) {
                continue;
            }
            Fix f = fix.get();
            PartnerDirectory.PartnerInfo p = info.get(id);
            out.add(new LivePartnerResponse(id, p == null ? null : p.displayName(), f.lat(), f.lng(), f.headingDeg(),
                    f.speedMps(), f.recordedAt(), store.trackableOrders(id).size()));
        }
        return out;
    }

    public List<LivePartnerResponse> nearby(double lat, double lng, double radiusM) {
        if (radiusM <= 0 || radiusM > 30_000) {
            throw Errors.badRequest("invalid_radius", "Radius must be between 1 m and 30 km.");
        }
        Set<UUID> near = store.nearby(lat, lng, radiusM, 50).stream().collect(Collectors.toSet());
        return livePartners().stream().filter(p -> near.contains(p.partnerId())).toList();
    }
}
