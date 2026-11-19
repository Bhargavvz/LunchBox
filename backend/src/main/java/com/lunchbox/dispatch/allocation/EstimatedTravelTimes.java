package com.lunchbox.dispatch.allocation;

import com.lunchbox.common.geo.Geo;

import java.util.List;

/** Straight-line distance × detour factor at an average city riding speed. Used when no road matrix is configured. */
public class EstimatedTravelTimes implements TravelTimeProvider {

    @Override
    public List<Leg> legs(List<Pair> pairs, AllocationWeights weights) {
        return pairs.stream().map(p -> estimate(p, weights)).toList();
    }

    static Leg estimate(Pair p, AllocationWeights weights) {
        double meters = Geo.haversineMeters(p.from(), p.to()) * weights.roadDetourFactor();
        double seconds = meters / (weights.averageSpeedKmph() * 1000 / 3600);
        return new Leg(meters, seconds, false);
    }

    @Override
    public String name() {
        return "estimate";
    }
}
