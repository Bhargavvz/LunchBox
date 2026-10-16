package com.lunchbox.dispatch.routing;

import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;

/**
 * Straight-line travel estimate. Urban Indian roads are far from straight, so the Haversine distance is inflated by a
 * circuity factor (typically ~1.35) before converting to time at the configured average speed.
 */
public final class TravelModel {

    public static final double CIRCUITY = 1.35;

    private TravelModel() {
    }

    public static long roadMeters(GeoPoint a, GeoPoint b) {
        return Math.round(Geo.haversineMeters(a, b) * CIRCUITY);
    }

    public static long seconds(GeoPoint a, GeoPoint b, double speedMps) {
        return Math.round(roadMeters(a, b) / speedMps);
    }
}
