package com.lunchbox.subscriptions;

import java.time.LocalDate;
import java.util.UUID;

/** In-process events (published inside the originating transaction). */
public final class SubscriptionEvents {

    private SubscriptionEvents() {
    }

    public record LeaveDayAdded(UUID childId, LocalDate date, String reason) {
    }

    /** A subscription stopped (cancelled, halted for non-payment, expired); orders on or after {@code from} go. */
    public record SubscriptionEnded(UUID subscriptionId, UUID childId, LocalDate from, String reason) {
    }
}
