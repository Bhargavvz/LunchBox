package com.lunchbox.audit;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Plain-English sentences, severities and modules for audit actions, so the log reads "Ops assigned an order to a
 * rider" instead of "order.assigned". Unknown actions fall back to a readable version of the action name.
 */
public final class AuditSummaries {

    private AuditSummaries() {
    }

    private static final Map<String, String> SENTENCES = Map.ofEntries(
            Map.entry("account.deleted", "A parent deleted their account; personal data was erased"),
            Map.entry("account.exported", "A parent downloaded a copy of their data"),
            Map.entry("address.created", "A pickup address was added"),
            Map.entry("address.updated", "A pickup address was changed"),
            Map.entry("address.deleted", "A pickup address was removed"),
            Map.entry("broadcast.created", "A broadcast message was sent"),
            Map.entry("child.created", "A child was added"),
            Map.entry("child.updated", "A child's details were changed"),
            Map.entry("child.deleted", "A child was removed"),
            Map.entry("coupon.created", "A coupon was created"),
            Map.entry("coupon.updated", "A coupon was changed"),
            Map.entry("coupon.redeemed", "A coupon was used for a paid plan"),
            Map.entry("demo.seeded", "Demo data was loaded"),
            Map.entry("demo.removed", "Demo data was removed"),
            Map.entry("earnings.adjusted", "A rider's earnings were adjusted"),
            Map.entry("issue.acknowledged", "A rider's issue was acknowledged"),
            Map.entry("issue.resolved", "A rider's issue was resolved"),
            Map.entry("leave.added", "A parent skipped a pickup day"),
            Map.entry("leave.removed", "A parent put a pickup day back"),
            Map.entry("order.assigned", "An order was assigned to a rider by hand"),
            Map.entry("order.cancelled", "An order was cancelled"),
            Map.entry("order.created_manually", "Ops created an order by hand"),
            Map.entry("order.declined", "A rider handed back an order before setting off"),
            Map.entry("order.rated", "A parent rated a delivery"),
            Map.entry("order.school_receipt_confirmed", "The school confirmed receiving a lunchbox"),
            Map.entry("orders.generated", "Orders were created for a day from active plans"),
            Map.entry("parent.registered", "A parent signed up"),
            Map.entry("partner.bank_linked", "A rider's bank account was linked for payouts"),
            Map.entry("partner.created", "A rider was added"),
            Map.entry("partner.updated", "A rider's profile was changed"),
            Map.entry("partner.approved", "A rider was approved"),
            Map.entry("partner.rejected", "A rider was rejected"),
            Map.entry("payment.captured", "A payment was received"),
            Map.entry("payment.failed", "A payment failed"),
            Map.entry("payout.created", "A rider payout was created"),
            Map.entry("plan.created", "A plan was created"),
            Map.entry("plan.updated", "A plan was changed"),
            Map.entry("plan_feature.created", "A plan feature type was added"),
            Map.entry("plan_feature.updated", "A plan feature type was changed"),
            Map.entry("school.created", "A school was added"),
            Map.entry("school.updated", "A school's details were changed"),
            Map.entry("school.deleted", "A school was removed"),
            Map.entry("school.holiday_added", "A school holiday was declared; that day's pickups were cancelled"),
            Map.entry("school.holiday_removed", "A school holiday was removed"),
            Map.entry("service_area.created", "A service area was added"),
            Map.entry("service_area.updated", "A service area was changed"),
            Map.entry("service_area.deleted", "A service area was removed"),
            Map.entry("setting.updated", "A setting was changed"),
            Map.entry("shift.scheduled", "A rider's shift was scheduled"),
            Map.entry("shift.cancelled", "A rider's shift was cancelled"),
            Map.entry("staff.created", "A staff account was created"),
            Map.entry("staff.role_changed", "A staff member's role was changed"),
            Map.entry("subscription.created", "A parent started a plan"),
            Map.entry("subscription.checkout_opened", "A payment was opened for a plan"),
            Map.entry("subscription.paid", "A plan period was paid"),
            Map.entry("subscription.activated", "A plan became active"),
            Map.entry("subscription.trial_started", "A free trial started"),
            Map.entry("subscription.schedule_changed", "A plan's pickup days or address changed"),
            Map.entry("subscription.cancelled", "A plan was cancelled"),
            Map.entry("subscription.expired", "A plan ended"),
            Map.entry("subscription.halted", "A plan was paused for payment"),
            Map.entry("subscription.lapsed", "A plan period ran out without renewal"),
            Map.entry("user.linked", "A sign-in was linked to an account"),
            Map.entry("user.phone_changed", "A user changed their phone number"),
            Map.entry("user.photo_updated", "A user changed their photo"),
            Map.entry("user.profile_updated", "A user changed their profile"),
            Map.entry("user.provisioned", "An account was created by an admin"),
            Map.entry("user.suspended", "An account was suspended"),
            Map.entry("user.reactivated", "An account was reactivated"));

    private static final Set<String> WARNING_SUFFIXES = Set.of("failed", "declined", "no_show", "lapsed", "halted", "rejected",
            "suspended", "unassigned", "offline");

    public static String module(String action) {
        int dot = action.indexOf('.');
        String head = dot < 0 ? action : action.substring(0, dot);
        return switch (head) {
            case "orders" -> "order";
            case "partner", "shift", "issue", "earnings" -> "rider";
            case "plan_feature", "coupon" -> "plan";
            default -> head;
        };
    }

    public static AuditService.Severity severity(String action) {
        String suffix = action.substring(action.lastIndexOf('.') + 1);
        return WARNING_SUFFIXES.contains(suffix) ? AuditService.Severity.WARNING : AuditService.Severity.INFO;
    }

    public static String describe(String action, String entityType, Object before, Object after) {
        String sentence = SENTENCES.get(action);
        if (sentence != null) {
            return sentence + ".";
        }
        String readable = action.replace('_', ' ').replace('.', ' ');
        return (entityType == null ? "" : entityType + ": ") + readable.substring(0, 1).toUpperCase(Locale.ROOT)
                + readable.substring(1) + ".";
    }
}
