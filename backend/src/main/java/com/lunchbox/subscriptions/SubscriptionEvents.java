package com.lunchbox.subscriptions;

import java.time.LocalDate;
import java.util.UUID;

/** In-process events (published inside the originating transaction). */
public final class SubscriptionEvents {

    private SubscriptionEvents() {
    }

    public record LeaveDayAdded(UUID childId, LocalDate date, String reason) {
    }

    /** A prepaid period ends soon; the parent is reminded to renew. */
    public record RenewalDue(UUID subscriptionId, UUID parentId, UUID childId, java.time.Instant periodEnd) {
    }

    /** A subscription stopped (cancelled, halted for non-payment, expired); orders on or after {@code from} go. */
    public record SubscriptionEnded(UUID subscriptionId, UUID childId, LocalDate from, String reason) {
    }
}
