package com.lunchbox.dispatch.allocation;

import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Inputs and outputs of the {@link AllocationEngine}. Plain records so the engine is tested without a database. */
public final class AllocationModel {

    private AllocationModel() {
    }

    /** One lunchbox to collect. */
    public record Job(UUID orderId, UUID schoolId, Point pickup, Instant pickupWindowStart, Instant pickupWindowEnd,
                      Instant deliveryDeadline, boolean priority) {
    }

    /** Whether a rider is reachable right now (only matters for same-day runs). */
    public enum Presence {
        /** Shift started and the phone reported a location recently. */
        ONLINE,
        /** Shift scheduled but not started yet. */
        NOT_STARTED,
        /** Shift started but no location for longer than the offline threshold. */
        OFFLINE
    }

    /**
     * A rider with a shift on the day.
     *
     * @param start       where the rider sets off from (live position, shift start point or home zone)
     * @param load        orders the rider already holds that day
     * @param schools     schools the rider already goes to that day (from orders already held)
     * @param zone        service area the rider is restricted to, or null for "within the radius"
     * @param rating      average parent rating 1–5, or null when unrated
     * @param reliability 0–1 from recent shifts (no-shows and declines lower it)
     * @param declined    orders this rider has declined; never offered again
     */
    public record Rider(UUID partnerId, String name, Point start, int capacity, int load, Set<UUID> schools,
                        int serviceRadiusM, Geometry zone, Instant shiftStart, Instant shiftEnd, Presence presence,
                        Double rating, double reliability, Set<UUID> declined) {

        public int freeSlots() {
            return Math.max(0, capacity - load);
        }
    }

    /** Why the engine chose a rider: every term in km-equivalents, so they add up to {@code total}. */
    public record Breakdown(double distanceKm, int travelMinutes, boolean roadDistance, double distanceCost,
                            double newSchoolCost, double workloadCost, double ratingCost, double reliabilityCost,
                            double total) {
    }

    public record Assignment(UUID orderId, UUID partnerId, Breakdown breakdown, int eligibleRiders,
                             UUID runnerUpPartnerId, Double runnerUpCost) {
    }

    /** Why an order found no rider; the most specific reason over all riders. */
    public enum Reason {
        NO_RIDERS_ON_SHIFT("No rider has a shift on this day."),
        DECLINED("Every rider who could take it has declined it."),
        RIDER_OFFLINE("The riders who could take it are offline."),
        OUT_OF_RANGE("The home is outside every rider's service radius."),
        OUTSIDE_ZONE("The home is outside the zones of the riders in range."),
        SHIFT_TIMES("No rider's shift covers the pickup window and the school deadline."),
        TOO_LATE("No rider can reach the home before the pickup window closes."),
        ALL_FULL("Every rider who could take it is at capacity.");

        private final String explanation;

        Reason(String explanation) {
            this.explanation = explanation;
        }

        public String explanation() {
            return explanation;
        }
    }

    public record Unassigned(UUID orderId, Reason reason) {
    }

    public record Result(List<Assignment> assignments, List<Unassigned> unassigned, double totalCost,
                         int improvingMoves, long solveMillis, String travelSource) {
    }
}
