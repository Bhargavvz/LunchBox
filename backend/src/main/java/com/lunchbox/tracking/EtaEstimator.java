package com.lunchbox.tracking;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.geo.Geo;
import org.springframework.stereotype.Component;

/**
 * MVP ETA: road-adjusted straight-line distance over the configured average urban speed. Behind this class's
 * {@link #seconds} contract an ML model (post-MVP) can replace the heuristic without changing callers.
 */
@Component
public class EtaEstimator {

    private static final double CIRCUITY = 1.35;
    private final double speedMps;

    public EtaEstimator(LunchBoxProperties properties) {
        this.speedMps = properties.tracking().averageSpeedKmph() / 3.6;
    }

    public int seconds(double fromLat, double fromLng, double toLat, double toLng) {
        double meters = Geo.haversineMeters(fromLat, fromLng, toLat, toLng) * CIRCUITY;
        return (int) Math.round(meters / speedMps);
    }
}
