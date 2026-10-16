package com.lunchbox.tracking.postmvp;

import com.lunchbox.common.geo.GeoPoint;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Extension points designed now and implemented after the MVP (see docs/post-mvp.md). None of these are wired into
 * the application yet; the MVP equivalents are noted on each.
 */
public final class PostMvpInterfaces {

    private PostMvpInterfaces() {
    }

    /** Kalman filter + snap-to-road. MVP: raw fixes with accuracy/speed plausibility filtering in TrackingService. */
    public interface LocationSmoother {
        GeoPoint smooth(UUID partnerId, GeoPoint raw, double accuracyM, Instant at);
    }

    /** Hungarian-algorithm batch matching of orders to partners. MVP: greedy nearest-available (AssignmentService). */
    public interface BatchMatcher {
        Map<UUID, UUID> match(List<UUID> orderIds, List<UUID> partnerIds, double[][] cost);
    }

    /** DBSCAN clustering of homes per school for zone design. MVP: school affinity in the greedy score. */
    public interface HomeClusterer {
        List<List<UUID>> cluster(Map<UUID, GeoPoint> homes, double epsMeters, int minPoints);
    }

    /** Learned ETA model. MVP: EtaEstimator (distance × circuity / average speed). */
    public interface EtaModel {
        int predictSeconds(GeoPoint from, GeoPoint to, Instant departAt);
    }

    /** Next-day order volume forecasting for partner shift planning. */
    public interface DemandForecaster {
        Map<UUID, Integer> forecastOrdersPerSchool(java.time.LocalDate date);
    }
}
