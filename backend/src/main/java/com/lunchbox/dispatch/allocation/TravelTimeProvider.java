package com.lunchbox.dispatch.allocation;

import org.locationtech.jts.geom.Point;

import java.util.List;

/**
 * Riding distance and time between pairs of points. The road implementation asks Google's Routes API (cached); the
 * estimate multiplies straight-line distance by a detour factor. Callers never depend on which one answered: each
 * leg says whether it is a road measurement.
 */
public interface TravelTimeProvider {

    record Pair(Point from, Point to) {
    }

    record Leg(double meters, double seconds, boolean road) {
    }

    /** One leg per pair, in the same order. Never throws for a provider outage: it falls back to estimates. */
    List<Leg> legs(List<Pair> pairs, AllocationWeights weights);

    String name();
}
