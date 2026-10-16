package com.lunchbox.common.settings;

import java.time.LocalTime;

/** Operational knobs editable from the admin panel (backed by {@code app_settings}). */
public interface PlatformSettings {

    /** IST wall-clock time on the previous day after which the next day's orders are frozen. */
    LocalTime orderCutoffTime();

    /** How many minutes before a school's delivery window opens the home pickup window starts. */
    int pickupLeadMinutes();

    /** Length of the home pickup window in minutes. */
    int pickupWindowMinutes();

    /** Radius (m) around a home that counts as "partner has arrived". */
    int homeArrivalRadiusM();

    /** Default school geofence radius (m) when a school has no polygon and no own radius. */
    int defaultSchoolGeofenceRadiusM();

    /** Minutes a partner must wait at a home before a pickup can be marked failed. */
    int pickupWaitMinutes();

    /** Grace minutes after shift start before a partner is treated as a no-show. */
    int noShowGraceMinutes();

    PayRates payRates();

    record PayRates(
            long baseDayPaise,
            long perDeliveryPaise,
            long perKmPaise,
            long onTimeBonusPaise,
            long failedDeliveryPenaltyPaise,
            long noShowPenaltyPaise,
            long minPayoutPaise) {
    }
}
