package com.lunchbox.dispatch.allocation;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

/**
 * Admin-tunable weights of the allocation cost (setting {@code allocation.weights}). Every term is expressed in
 * kilometres of riding so the numbers are comparable: "a new school costs as much as 3 extra km".
 *
 * @param distancePerKm        cost of each km between the rider's start and the home (1 = plain distance)
 * @param newSchoolKm          extra cost when an order adds a school the rider does not already go to (batching)
 * @param workloadKm           fairness: a rider's workload costs workloadKm × load² / capacity, so each extra box
 *                             costs more than the last and work spreads evenly
 * @param ratingKm             cost of a rating of 0 (scales linearly to 0 at 5 stars); unrated riders count as 4
 * @param reliabilityKm        cost of reliability 0 (scales linearly to 0 at reliability 1)
 * @param unassignedPenaltyKm  cost of leaving an order unassigned; large so everything that can be served is
 * @param priorityMultiplier   unassigned penalty multiplier for priority-delivery plans (served first when short)
 * @param candidatesPerOrder   nearest eligible riders priced per order (bounds road-distance lookups)
 * @param offlineAfterMinutes  a started shift without a location for this long counts as offline
 * @param roadDetourFactor     straight-line → road distance estimate when no road matrix is available
 * @param averageSpeedKmph     city riding speed for travel-time estimates
 */
public record AllocationWeights(double distancePerKm, double newSchoolKm, double workloadKm, double ratingKm,
                                double reliabilityKm, double unassignedPenaltyKm, double priorityMultiplier,
                                int candidatesPerOrder, int offlineAfterMinutes, double roadDetourFactor,
                                double averageSpeedKmph) {

    public static final AllocationWeights DEFAULTS = new AllocationWeights(1.0, 3.0, 2.0, 2.0, 4.0, 1000.0, 2.0, 8, 10,
            1.35, 18.0);

    public static AllocationWeights from(JsonNode v) {
        return new AllocationWeights(
                v.path("distancePerKm").asDouble(DEFAULTS.distancePerKm),
                v.path("newSchoolKm").asDouble(DEFAULTS.newSchoolKm),
                v.path("workloadKm").asDouble(DEFAULTS.workloadKm),
                v.path("ratingKm").asDouble(DEFAULTS.ratingKm),
                v.path("reliabilityKm").asDouble(DEFAULTS.reliabilityKm),
                v.path("unassignedPenaltyKm").asDouble(DEFAULTS.unassignedPenaltyKm),
                v.path("priorityMultiplier").asDouble(DEFAULTS.priorityMultiplier),
                v.path("candidatesPerOrder").asInt(DEFAULTS.candidatesPerOrder),
                v.path("offlineAfterMinutes").asInt(DEFAULTS.offlineAfterMinutes),
                v.path("roadDetourFactor").asDouble(DEFAULTS.roadDetourFactor),
                v.path("averageSpeedKmph").asDouble(DEFAULTS.averageSpeedKmph));
    }

    /** Problems with a proposed value, in words an admin can act on; empty when valid. */
    public static List<String> problems(JsonNode v) {
        List<String> out = new ArrayList<>();
        if (v == null || !v.isObject()) {
            out.add("Weights must be an object.");
            return out;
        }
        range(out, v, "distancePerKm", 0.1, 10);
        range(out, v, "newSchoolKm", 0, 50);
        range(out, v, "workloadKm", 0, 50);
        range(out, v, "ratingKm", 0, 50);
        range(out, v, "reliabilityKm", 0, 50);
        range(out, v, "unassignedPenaltyKm", 100, 100_000);
        range(out, v, "priorityMultiplier", 1, 10);
        range(out, v, "candidatesPerOrder", 1, 50);
        range(out, v, "offlineAfterMinutes", 2, 60);
        range(out, v, "roadDetourFactor", 1, 3);
        range(out, v, "averageSpeedKmph", 5, 60);
        return out;
    }

    private static void range(List<String> out, JsonNode v, String field, double min, double max) {
        JsonNode n = v.get(field);
        if (n == null || !n.isNumber()) {
            out.add(field + " must be a number.");
        } else if (n.asDouble() < min || n.asDouble() > max) {
            out.add(field + " must be between " + fmt(min) + " and " + fmt(max) + ".");
        }
    }

    private static String fmt(double d) {
        return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d);
    }
}
