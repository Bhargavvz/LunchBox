package com.lunchbox.subscriptions;

import com.lunchbox.addresses.AddressDirectory;
import com.lunchbox.addresses.AddressDirectory.AddressRemoving;
import com.lunchbox.audit.AuditService;
import com.lunchbox.children.ChildDirectory;
import com.lunchbox.children.ChildDirectory.ChildInfo;
import com.lunchbox.children.ChildDirectory.ChildRemoved;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.privacy.PersonalDataContributor;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.orders.PickupWindows;
import com.lunchbox.payments.PaymentGateway;
import com.lunchbox.payments.PaymentRecorder;
import com.lunchbox.schools.SchoolDirectory;
import com.lunchbox.subscriptions.SubscriptionEvents.SubscriptionEnded;
import com.lunchbox.subscriptions.web.SubscriptionDtos.AdminSubscriptionResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.CheckoutResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.CreateSubscriptionRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.QuoteRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.QuoteResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.SubscriptionResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.UpdateScheduleRequest;
import com.lunchbox.users.UserDirectory;
import com.lunchbox.users.UserDirectory.ParentInfo;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.subscriptions.SubscriptionEvents.RenewalDue;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
public class SubscriptionService implements SubscriptionQueries, PersonalDataContributor {

    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final LeaveDayRepository leaves;
    private final ChildDirectory children;
    private final AddressDirectory addresses;
    private final SchoolDirectory schools;
    private final UserDirectory users;
    private final PaymentGateway gateway;
    private final PaymentRecorder payments;
    private final PickupWindows windows;
    private final PlanFeatures features;
    private final CouponService coupons;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    /** ADR-0018: "prepaid" (Razorpay Orders, one payment per period) or "subscription" (Razorpay auto-debit). */
    private final boolean prepaidBilling;

    /** How early before a prepaid period ends the parent may renew, and is reminded to. */
    static final Duration RENEWAL_WINDOW = Duration.ofDays(7);
    static final Duration REMINDER_LEAD = Duration.ofDays(3);

    public SubscriptionService(SubscriptionRepository subscriptions, PlanRepository plans, LeaveDayRepository leaves,
                               ChildDirectory children, AddressDirectory addresses, SchoolDirectory schools,
                               UserDirectory users, PaymentGateway gateway, PaymentRecorder payments,
                               PickupWindows windows, PlanFeatures features, CouponService coupons, AuditService audit,
                               ApplicationEventPublisher events, Clock clock,
                               @Value("${lunchbox.billing.mode:prepaid}") String billingMode) {
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.leaves = leaves;
        this.children = children;
        this.addresses = addresses;
        this.schools = schools;
        this.users = users;
        this.gateway = gateway;
        this.payments = payments;
        this.windows = windows;
        this.features = features;
        this.coupons = coupons;
        this.audit = audit;
        this.events = events;
        this.clock = clock;
        this.prepaidBilling = !"subscription".equalsIgnoreCase(billingMode);
    }

    public boolean prepaidBilling() {
        return prepaidBilling;
    }

    // ---- SubscriptionQueries ----

    @Override
    @Transactional(readOnly = true)
    public List<ScheduleEntry> schedulesFor(LocalDate date) {
        return subscriptions.findActiveOn(date, TimeZones.atIst(date, LocalTime.MIDNIGHT)).stream()
                .map(s -> new ScheduleEntry(s.getId(), s.getChildId(), s.getParentId(), s.getAddressId(), s.getDaysOfWeek()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> childrenOnLeave(LocalDate date) {
        return new HashSet<>(leaves.findChildIdsOnLeave(date));
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> priorityDeliverySubscriptions(Collection<UUID> subscriptionIds) {
        if (subscriptionIds.isEmpty()) {
            return Set.of();
        }
        List<Subscription> list = subscriptions.findByIdIn(subscriptionIds);
        Map<UUID, Plan> planMap = plans.findAllById(list.stream().map(Subscription::getPlanId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Plan::getId, Function.identity()));
        return list.stream()
                .filter(s -> planMap.containsKey(s.getPlanId())
                        && features.bool(planMap.get(s.getPlanId()), PlanFeatures.PRIORITY_DELIVERY, false))
                .map(Subscription::getId).collect(Collectors.toSet());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean liveTrackingIncluded(UUID subscriptionId) {
        if (subscriptionId == null) {
            return true;
        }
        return subscriptions.findById(subscriptionId).flatMap(s -> plans.findById(s.getPlanId()))
                .map(p -> features.bool(p, PlanFeatures.LIVE_TRACKING, true)).orElse(true);
    }

    @Override
    @Transactional(readOnly = true)
    public java.util.Optional<ChildPlan> currentPlan(UUID childId) {
        return subscriptions.findByChildIdAndStatusIn(childId, Subscription.LIVE).stream().findFirst().map(s -> {
            String planName = plans.findById(s.getPlanId()).map(Plan::getName).orElse(null);
            return new ChildPlan(s.getId(), planName, s.getStatus().name(), s.getDaysOfWeek(), s.getStartDate(),
                    s.getEndDate(), s.getCurrentPeriodEnd(), s.getTrialEndsAt());
        });
    }

    @Override
    @Transactional(readOnly = true)
    public Set<LocalDate> leaveDays(UUID childId, LocalDate from, LocalDate to) {
        return leaves.findByChildIdAndLeaveDateBetweenOrderByLeaveDate(childId, from, to).stream()
                .map(LeaveDay::getLeaveDate).collect(Collectors.toSet());
    }

    /** Price, coupon discount and trial for a plan, before the parent commits. */
    @Transactional(readOnly = true)
    public QuoteResponse quote(UUID parentUserId, QuoteRequest request) {
        UUID parentId = users.requireParentId(parentUserId);
        Plan plan = plans.findById(request.planId()).filter(Plan::isActive)
                .orElseThrow(() -> Errors.badRequest("invalid_plan", "Choose an available plan."));
        CouponService.Applied coupon = blank(request.couponCode()) ? null : coupons.check(request.couponCode(), plan, parentId);
        long discount = coupon == null ? 0 : coupon.discountPaise();
        return new QuoteResponse(plan.getId(), plan.getPricePaise(), discount, plan.getPricePaise() - discount,
                coupon == null ? null : coupon.code(), trialEligible(plan, parentId) ? plan.getTrialDays() : 0);
    }

    // ---- Parent ----

    @Transactional
    public CheckoutResponse create(UUID parentUserId, CreateSubscriptionRequest request) {
        UUID parentId = users.requireParentId(parentUserId);
        ChildInfo child = children.requireOwned(request.childId(), parentId);
        addresses.requireOwned(request.addressId(), parentId);
        Plan plan = plans.findById(request.planId()).filter(Plan::isActive)
                .orElseThrow(() -> Errors.badRequest("invalid_plan", "Choose an available plan."));
        validateSchedule(child, plan, request.daysOfWeek());
        checkPlanLimits(plan, parentId);
        LocalDate firstOpen = windows.firstOpenDate();
        if (request.startDate().isBefore(firstOpen)) {
            throw Errors.unprocessable("start_too_early", "The earliest start date is " + firstOpen + ".");
        }
        if (!subscriptions.findByChildIdAndStatusIn(child.id(), Subscription.LIVE).isEmpty()) {
            throw Errors.conflict("subscription_exists", "This child already has a subscription.");
        }
        if (!prepaidBilling && plan.getRazorpayPlanId() == null) {
            throw Errors.unavailable("plan_not_ready", "This plan is not available for purchase yet.");
        }
        if (!prepaidBilling && !blank(request.couponCode())) {
            throw Errors.unprocessable("coupon_not_supported", "Coupons apply to prepaid plans only.");
        }
        boolean trial = prepaidBilling && trialEligible(plan, parentId);
        CouponService.Applied coupon = trial || blank(request.couponCode()) ? null
                : coupons.check(request.couponCode(), plan, parentId);
        Subscription sub = subscriptions.saveAndFlush(new Subscription(parentId, child.id(), plan.getId(),
                request.addressId(), request.daysOfWeek(), request.startDate()));
        if (prepaidBilling) {
            audit.record("subscription.created", "Subscription", sub.getId(), null,
                    Map.of("childId", child.id(), "planId", plan.getId(), "startDate", request.startDate().toString(),
                            "billing", "prepaid"));
            if (trial) {
                Instant trialEnd = TimeZones.atIst(request.startDate().plusDays(plan.getTrialDays()), LocalTime.MIDNIGHT);
                sub.startTrial(trialEnd);
                audit.record("subscription.trial_started", "Subscription", sub.getId(), null,
                        Map.of("trialDays", plan.getTrialDays(), "trialEndsAt", trialEnd.toString()));
                ParentInfo parent = users.requireParent(parentId);
                return new CheckoutResponse(sub.getId(), null, gateway.keyId(), null, 0, plan.getName(), parent.firstName(),
                        parent.phone(), null, 0, null, trialEnd);
            }
            return startPeriodCheckout(sub, plan, parentId, coupon);
        }
        int totalCount = plan.getBillingPeriod() == Plan.BillingPeriod.MONTHLY ? 12 : 4;
        Map<String, String> notes = new LinkedHashMap<>();
        notes.put("lunchbox_subscription_id", sub.getId().toString());
        notes.put("lunchbox_parent_id", parentId.toString());
        PaymentGateway.ProviderSubscription provider = gateway.createSubscription(plan.getRazorpayPlanId(), totalCount, notes);
        sub.linkProvider(provider.id(), provider.shortUrl());
        audit.record("subscription.created", "Subscription", sub.getId(), null,
                Map.of("childId", child.id(), "planId", plan.getId(), "startDate", request.startDate().toString()));
        ParentInfo parent = users.requireParent(parentId);
        return new CheckoutResponse(sub.getId(), provider.id(), gateway.keyId(), provider.shortUrl(), plan.getPricePaise(),
                plan.getName(), parent.firstName(), parent.phone(), null, 0, null, null);
    }

    /**
     * Prepaid renewal: opens a Razorpay order for the next period. Allowed in the last {@link #RENEWAL_WINDOW} of a paid
     * period, after it lapsed (HALTED), or to finish a first payment that was abandoned (PENDING_PAYMENT).
     */
    @Transactional
    public CheckoutResponse renew(UUID parentUserId, UUID subscriptionId, String couponCode) {
        UUID parentId = users.requireParentId(parentUserId);
        Subscription sub = subscriptions.findByIdAndParentId(subscriptionId, parentId)
                .filter(Subscription::isLive)
                .orElseThrow(() -> Errors.notFound("Subscription"));
        if (!sub.isPrepaid()) {
            throw Errors.unprocessable("auto_debit", "This plan renews automatically.");
        }
        Instant now = clock.instant();
        boolean renewable = sub.getStatus() == Subscription.Status.HALTED
                || sub.getStatus() == Subscription.Status.PENDING_PAYMENT
                || (sub.getStatus() == Subscription.Status.ACTIVE && sub.getCurrentPeriodEnd() != null
                && sub.getCurrentPeriodEnd().minus(RENEWAL_WINDOW).isBefore(now));
        if (!renewable) {
            throw Errors.unprocessable("too_early", "You can renew in the last 7 days of your plan.");
        }
        Plan plan = plans.findById(sub.getPlanId()).orElseThrow();
        if (plan.getDurationPeriods() != null && sub.getPeriodsPaid() >= plan.getDurationPeriods()) {
            throw Errors.unprocessable("plan_completed", plan.getName() + " runs for " + plan.getDurationPeriods()
                    + " period" + (plan.getDurationPeriods() == 1 ? "" : "s") + " and is complete. Choose a plan to continue.");
        }
        CouponService.Applied coupon = blank(couponCode) ? null : coupons.check(couponCode, plan, parentId);
        return startPeriodCheckout(sub, plan, parentId, coupon);
    }

    /** Opens a Razorpay order for one billing period of {@code plan}. */
    private CheckoutResponse startPeriodCheckout(Subscription sub, Plan plan, UUID parentId, CouponService.Applied coupon) {
        Map<String, String> notes = new LinkedHashMap<>();
        notes.put("lunchbox_subscription_id", sub.getId().toString());
        notes.put("lunchbox_parent_id", parentId.toString());
        // Razorpay receipts are at most 40 characters.
        String receipt = ("lb-" + sub.getId().toString().replace("-", "")).substring(0, 35);
        long discount = coupon == null ? 0 : coupon.discountPaise();
        long amount = plan.getPricePaise() - discount;
        if (coupon != null) {
            notes.put("lunchbox_coupon", coupon.code());
        }
        PaymentGateway.ProviderOrder order = gateway.createOrder(amount, receipt, notes);
        sub.awaitOrder(order.id(), amount, coupon == null ? null : coupon.couponId());
        audit.record("subscription.checkout_opened", "Subscription", sub.getId(), null,
                Map.of("orderId", order.id(), "amountPaise", amount, "discountPaise", discount));
        ParentInfo parent = users.requireParent(parentId);
        return new CheckoutResponse(sub.getId(), null, gateway.keyId(), null, amount, plan.getName(),
                parent.firstName(), parent.phone(), order.id(), discount, coupon == null ? null : coupon.code(), null);
    }

    /**
     * End of the period a prepaid payment buys. A renewal made before the current period ends extends it; otherwise the
     * period starts on the plan's start date or today (IST), whichever is later. Periods end at IST midnight.
     */
    static Instant nextPeriodEnd(Subscription sub, Plan plan, Clock clock) {
        int months = plan.getBillingPeriod() == Plan.BillingPeriod.MONTHLY ? 1 : 3;
        Instant now = clock.instant();
        if (sub.getCurrentPeriodEnd() != null && sub.getCurrentPeriodEnd().isAfter(now)) {
            LocalDate from = TimeZones.dateIst(sub.getCurrentPeriodEnd());
            return TimeZones.atIst(from.plusMonths(months), LocalTime.MIDNIGHT);
        }
        LocalDate today = TimeZones.todayIst(clock);
        LocalDate from = sub.getStartDate().isAfter(today) ? sub.getStartDate() : today;
        return TimeZones.atIst(from.plusMonths(months), LocalTime.MIDNIGHT);
    }

    /** Hourly: lapses prepaid plans whose period has ended and reminds parents a few days before. */
    @Transactional
    public int sweepPrepaid() {
        Instant now = clock.instant();
        int changed = 0;
        for (Subscription sub : subscriptions.findPrepaidEndingBefore(now.plus(REMINDER_LEAD))) {
            Instant end = sub.getCurrentPeriodEnd();
            Plan plan = plans.findById(sub.getPlanId()).orElse(null);
            boolean completed = plan != null && plan.getDurationPeriods() != null && sub.getPeriodsPaid() >= plan.getDurationPeriods();
            if (!end.isAfter(now) && completed) {
                sub.expire(TimeZones.dateIst(end));
                audit.record("subscription.expired", "Subscription", sub.getId(), Map.of("status", "ACTIVE"),
                        Map.of("status", sub.getStatus().name(), "reason", "all paid periods used"));
                events.publishEvent(new SubscriptionEnded(sub.getId(), sub.getChildId(), TimeZones.dateIst(end),
                        "plan completed"));
                changed++;
            } else if (completed) {
                continue;
            } else if (!end.isAfter(now)) {
                sub.lapse();
                audit.record("subscription.lapsed", "Subscription", sub.getId(), Map.of("status", "ACTIVE"),
                        Map.of("status", sub.getStatus().name(), "periodEnd", end.toString()));
                events.publishEvent(new SubscriptionEnded(sub.getId(), sub.getChildId(), TimeZones.dateIst(end),
                        "plan period ended; renew to continue"));
                changed++;
            } else if (!end.equals(sub.getRenewalRemindedFor())) {
                sub.markReminded(end);
                events.publishEvent(new RenewalDue(sub.getId(), sub.getParentId(), sub.getChildId(), end));
                changed++;
            }
        }
        return changed;
    }

    /** Client-side confirmation after checkout; the signature proves Razorpay authorised the mandate payment. */
    @Transactional
    public SubscriptionResponse verifyCheckout(UUID parentUserId, UUID subscriptionId, String paymentId, String signature) {
        UUID parentId = users.requireParentId(parentUserId);
        Subscription sub = subscriptions.findByIdAndParentId(subscriptionId, parentId)
                .orElseThrow(() -> Errors.notFound("Subscription"));
        Plan plan = plans.findById(sub.getPlanId()).orElseThrow();
        if (sub.isPrepaid()) {
            return verifyPeriodPayment(sub, plan, parentId, paymentId, signature);
        }
        if (!gateway.verifyCheckoutSignature(paymentId, sub.getRazorpaySubscriptionId(), signature)) {
            throw Errors.badRequest("invalid_signature", "We could not verify this payment. Please contact support.");
        }
        payments.recordAuthorized(parentId, sub.getId(), paymentId, plan.getPricePaise(), plan.getName());
        Subscription.Status before = sub.getStatus();
        sub.activate(null);
        audit.record("subscription.activated", "Subscription", sub.getId(), Map.of("status", before.name()),
                Map.of("status", sub.getStatus().name(), "via", "checkout"));
        return toResponse(sub, plan, children.require(sub.getChildId()));
    }

    private SubscriptionResponse verifyPeriodPayment(Subscription sub, Plan plan, UUID parentId, String paymentId,
                                                     String signature) {
        String orderId = sub.getRazorpayOrderId();
        if (orderId == null || !gateway.verifyOrderSignature(orderId, paymentId, signature)) {
            throw Errors.badRequest("invalid_signature", "We could not verify this payment. Please contact support.");
        }
        Subscription.Status before = sub.getStatus();
        Instant periodEnd = nextPeriodEnd(sub, plan, clock);
        long amount = sub.expectedAmount(plan.getPricePaise());
        UUID couponId = sub.getPendingCouponId();
        payments.recordCaptured(parentId, sub.getId(), paymentId, null, amount, null, plan.getName(), clock.instant());
        sub.orderPaid();
        sub.activate(periodEnd);
        coupons.redeem(couponId, parentId, sub.getId(), plan.getPricePaise() - amount);
        audit.record("subscription.paid", "Subscription", sub.getId(), Map.of("status", before.name()),
                Map.of("status", sub.getStatus().name(), "orderId", orderId, "paidUntil", periodEnd.toString()));
        return toResponse(sub, plan, children.require(sub.getChildId()));
    }

    /** Webhook path for a prepaid order (see {@link PrepaidWebhookHandler}); idempotent. */
    @Transactional
    public void onOrderPaid(String orderId, String paymentId, long amountPaise, String method, Instant paidAt) {
        subscriptions.findByRazorpayOrderId(orderId).ifPresentOrElse(sub -> {
            Plan plan = plans.findById(sub.getPlanId()).orElseThrow();
            long expected = sub.expectedAmount(plan.getPricePaise());
            if (amountPaise != expected) {
                log.warn("Order {} paid {} paise, expected {} for plan {}; not activating", orderId, amountPaise, expected,
                        plan.getId());
                return;
            }
            Subscription.Status before = sub.getStatus();
            Instant periodEnd = nextPeriodEnd(sub, plan, clock);
            UUID couponId = sub.getPendingCouponId();
            payments.recordCaptured(sub.getParentId(), sub.getId(), paymentId, null, amountPaise, method, plan.getName(),
                    paidAt);
            sub.orderPaid();
            sub.activate(periodEnd);
            coupons.redeem(couponId, sub.getParentId(), sub.getId(), plan.getPricePaise() - amountPaise);
            audit.record("subscription.paid", "Subscription", sub.getId(), Map.of("status", before.name()),
                    Map.of("status", sub.getStatus().name(), "orderId", orderId, "paidUntil", periodEnd.toString(),
                            "via", "webhook"));
        }, () -> log.info("payment.captured for order {} matches no open plan order (already confirmed)", orderId));
    }

    @Transactional
    public SubscriptionResponse updateSchedule(UUID parentUserId, UUID subscriptionId, UpdateScheduleRequest request) {
        UUID parentId = users.requireParentId(parentUserId);
        Subscription sub = subscriptions.findByIdAndParentId(subscriptionId, parentId)
                .filter(Subscription::isLive)
                .orElseThrow(() -> Errors.notFound("Subscription"));
        addresses.requireOwned(request.addressId(), parentId);
        Plan plan = plans.findById(sub.getPlanId()).orElseThrow();
        ChildInfo child = children.require(sub.getChildId());
        validateSchedule(child, plan, request.daysOfWeek());
        Map<String, Object> before = Map.of("days", sub.getDaysOfWeek().toString(), "addressId", sub.getAddressId());
        sub.changeSchedule(request.addressId(), request.daysOfWeek());
        audit.record("subscription.schedule_changed", "Subscription", sub.getId(), before,
                Map.of("days", sub.getDaysOfWeek().toString(), "addressId", sub.getAddressId()));
        return toResponse(sub, plan, child);
    }

    @Transactional
    public SubscriptionResponse cancelByParent(UUID parentUserId, UUID subscriptionId, String reason) {
        UUID parentId = users.requireParentId(parentUserId);
        Subscription sub = subscriptions.findByIdAndParentId(subscriptionId, parentId)
                .filter(Subscription::isLive)
                .orElseThrow(() -> Errors.notFound("Subscription"));
        Plan plan = plans.findById(sub.getPlanId()).orElseThrow();
        if (!features.bool(plan, PlanFeatures.CANCELLATION_ALLOWED, true)) {
            throw Errors.unprocessable("cancel_via_support", "This plan cannot be cancelled in the app. Contact support to cancel it.");
        }
        cancel(sub, reason);
        return toResponse(sub, plan, children.require(sub.getChildId()));
    }

    @Transactional
    public SubscriptionResponse cancelByAdmin(UUID subscriptionId, String reason) {
        Subscription sub = subscriptions.findById(subscriptionId).filter(Subscription::isLive)
                .orElseThrow(() -> Errors.notFound("Subscription"));
        cancel(sub, reason);
        return toResponse(sub, plans.findById(sub.getPlanId()).orElseThrow(), children.require(sub.getChildId()));
    }

    @Transactional(readOnly = true)
    public List<SubscriptionResponse> list(UUID parentUserId) {
        UUID parentId = users.requireParentId(parentUserId);
        List<Subscription> list = subscriptions.findByParentIdOrderByCreatedAtDesc(parentId);
        return toResponses(list);
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminSubscriptionResponse> search(Subscription.Status status, Integer page, Integer size) {
        Page<Subscription> result = subscriptions.search(status, Pagination.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        Map<UUID, ChildInfo> childMap = children.findAll(result.getContent().stream().map(Subscription::getChildId).collect(Collectors.toSet()));
        Map<UUID, Plan> planMap = plans.findAllById(result.getContent().stream().map(Subscription::getPlanId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Plan::getId, Function.identity()));
        return PageResponse.of(result, s -> {
            ChildInfo c = childMap.get(s.getChildId());
            Plan p = planMap.get(s.getPlanId());
            return new AdminSubscriptionResponse(s.getId(), s.getParentId(), s.getChildId(), c == null ? null : c.displayName(),
                    p == null ? null : p.getName(), s.getStatus(), s.getDaysOfWeek(), s.getStartDate(), s.getEndDate(),
                    s.getCurrentPeriodEnd(), s.getCreatedAt());
        });
    }

    // ---- Webhook-driven state (called by SubscriptionWebhookHandler) ----

    @Transactional
    public void onProviderActivated(String providerSubscriptionId, java.time.Instant periodEnd) {
        subscriptions.findByRazorpaySubscriptionId(providerSubscriptionId).ifPresentOrElse(sub -> {
            Subscription.Status before = sub.getStatus();
            if (before == Subscription.Status.CANCELLED || before == Subscription.Status.EXPIRED) {
                return;
            }
            sub.activate(periodEnd);
            if (before != sub.getStatus()) {
                audit.record("subscription.activated", "Subscription", sub.getId(), Map.of("status", before.name()),
                        Map.of("status", sub.getStatus().name(), "via", "webhook"));
            }
        }, () -> log.warn("Webhook for unknown subscription {}", providerSubscriptionId));
    }

    @Transactional
    public void onProviderCharged(String providerSubscriptionId, java.time.Instant periodEnd, String paymentId,
                                  String invoiceId, long amountPaise, String method, java.time.Instant paidAt) {
        subscriptions.findByRazorpaySubscriptionId(providerSubscriptionId).ifPresent(sub -> {
            Plan plan = plans.findById(sub.getPlanId()).orElseThrow();
            payments.recordCaptured(sub.getParentId(), sub.getId(), paymentId, invoiceId, amountPaise, method,
                    plan.getName(), paidAt);
            onProviderActivated(providerSubscriptionId, periodEnd);
        });
    }

    @Transactional
    public void onProviderHalted(String providerSubscriptionId) {
        subscriptions.findByRazorpaySubscriptionId(providerSubscriptionId).ifPresent(sub -> {
            Subscription.Status before = sub.getStatus();
            sub.halt();
            if (before != sub.getStatus()) {
                audit.record("subscription.halted", "Subscription", sub.getId(), Map.of("status", before.name()),
                        Map.of("status", sub.getStatus().name()));
                events.publishEvent(new SubscriptionEnded(sub.getId(), sub.getChildId(), windows.firstOpenDate(),
                        "payment pending"));
            }
        });
    }

    @Transactional
    public void onProviderEnded(String providerSubscriptionId, boolean completed) {
        subscriptions.findByRazorpaySubscriptionId(providerSubscriptionId).filter(Subscription::isLive).ifPresent(sub -> {
            Subscription.Status before = sub.getStatus();
            if (completed) {
                sub.expire(com.lunchbox.common.time.TimeZones.todayIst(clock));
            } else {
                sub.cancel("Cancelled at payment provider", clock.instant());
            }
            audit.record(completed ? "subscription.expired" : "subscription.cancelled", "Subscription", sub.getId(),
                    Map.of("status", before.name()), Map.of("status", sub.getStatus().name(), "via", "webhook"));
            events.publishEvent(new SubscriptionEnded(sub.getId(), sub.getChildId(), windows.firstOpenDate(),
                    completed ? "completed" : "cancelled"));
        });
    }

    // ---- Cross-module listeners ----

    @EventListener
    public void onChildRemoved(ChildRemoved event) {
        subscriptions.findByChildIdAndStatusIn(event.childId(), Subscription.LIVE)
                .forEach(sub -> cancel(sub, "Child removed by parent"));
    }

    @EventListener
    public void onAddressRemoving(AddressRemoving event) {
        if (subscriptions.existsByAddressIdAndStatusIn(event.addressId(), Subscription.LIVE)) {
            throw Errors.conflict("address_in_use",
                    "This address is used by an active subscription. Change the subscription's address first.");
        }
    }

    // ---- PersonalDataContributor ----

    @Override
    public String section() {
        return "subscriptions";
    }

    @Override
    public int order() {
        return 20;
    }

    @Override
    @Transactional(readOnly = true)
    public Object export(UUID userId) {
        UUID parentId = users.requireParentId(userId);
        List<Subscription> list = subscriptions.findByParentIdOrderByCreatedAtDesc(parentId);
        Set<UUID> childIds = list.stream().map(Subscription::getChildId).collect(Collectors.toSet());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("subscriptions", toResponses(list));
        data.put("leaveDays", leaves.findByChildIdIn(childIds).stream()
                .map(l -> Map.of("childId", l.getChildId(), "date", l.getLeaveDate().toString())).toList());
        return data;
    }

    @Override
    @Transactional
    public void erase(UUID userId) {
        UUID parentId = users.requireParentId(userId);
        subscriptions.findByParentIdOrderByCreatedAtDesc(parentId).stream().filter(Subscription::isLive)
                .forEach(sub -> cancel(sub, "Account deleted"));
    }

    // ---- helpers ----

    private void cancel(Subscription sub, String reason) {
        Subscription.Status before = sub.getStatus();
        sub.cancel(reason, clock.instant());
        audit.record("subscription.cancelled", "Subscription", sub.getId(), Map.of("status", before.name()),
                Map.of("status", sub.getStatus().name(), "reason", reason));
        events.publishEvent(new SubscriptionEnded(sub.getId(), sub.getChildId(), windows.firstOpenDate(), reason));
        String providerId = sub.getRazorpaySubscriptionId();
        if (providerId != null) {
            afterCommit(() -> gateway.cancelSubscription(providerId, false));
        }
    }

    private void validateSchedule(ChildInfo child, Plan plan, Set<DayOfWeek> days) {
        if (days.size() > plan.getMaxDaysPerWeek()) {
            throw Errors.unprocessable("too_many_days", "This plan covers up to " + plan.getMaxDaysPerWeek() + " days a week.");
        }
        Set<DayOfWeek> working = schools.require(child.schoolId()).workingDays();
        if (!working.containsAll(days)) {
            throw Errors.unprocessable("non_working_day", "Choose only days on which the school is open.");
        }
        features.days(plan, PlanFeatures.ALLOWED_DAYS).ifPresent(allowed -> {
            if (!allowed.containsAll(days)) {
                throw Errors.unprocessable("day_not_in_plan", "This plan does not include "
                        + days.stream().filter(d -> !allowed.contains(d)).map(SubscriptionService::dayName)
                        .collect(Collectors.joining(", ")) + ".");
            }
        });
    }

    /** Subscriber cap of the plan and the per-parent child limit. */
    private void checkPlanLimits(Plan plan, UUID parentId) {
        if (plan.getMaxSubscribers() != null
                && subscriptions.countByPlanIdAndStatusIn(plan.getId(), Subscription.LIVE) >= plan.getMaxSubscribers()) {
            throw Errors.conflict("plan_full", plan.getName() + " is full. Choose another plan.");
        }
        features.integer(plan, PlanFeatures.MAX_CHILDREN).ifPresent(max -> {
            if (subscriptions.countByParentIdAndPlanIdAndStatusIn(parentId, plan.getId(), Subscription.LIVE) >= max) {
                throw Errors.unprocessable("plan_child_limit", plan.getName() + " covers up to " + max + " child"
                        + (max == 1 ? "" : "ren") + " per family.");
            }
        });
    }

    /** One free trial per parent, on plans that offer one. */
    private boolean trialEligible(Plan plan, UUID parentId) {
        return plan.getTrialDays() > 0 && !subscriptions.existsByParentIdAndTrialEndsAtIsNotNull(parentId);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String dayName(DayOfWeek d) {
        String n = d.name();
        return n.charAt(0) + n.substring(1).toLowerCase(java.util.Locale.ROOT);
    }

    private List<SubscriptionResponse> toResponses(List<Subscription> list) {
        Map<UUID, ChildInfo> childMap = children.findAll(list.stream().map(Subscription::getChildId).collect(Collectors.toSet()));
        Map<UUID, Plan> planMap = plans.findAllById(list.stream().map(Subscription::getPlanId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Plan::getId, Function.identity()));
        return list.stream().map(s -> toResponse(s, planMap.get(s.getPlanId()), childMap.get(s.getChildId()))).toList();
    }

    SubscriptionResponse toResponse(Subscription s, Plan p, ChildInfo c) {
        return new SubscriptionResponse(s.getId(), s.getChildId(), c == null ? null : c.displayName(), s.getPlanId(),
                p == null ? null : p.getName(), p == null ? 0 : p.getPricePaise(), s.getAddressId(), s.getDaysOfWeek(),
                s.getStartDate(), s.getEndDate(), s.getStatus(), s.getCurrentPeriodEnd(), s.getCancelledAt(),
                s.getCancelReason(), s.getTrialEndsAt(), s.getPeriodsPaid(),
                p == null || features.bool(p, PlanFeatures.CANCELLATION_ALLOWED, true));
    }

    private static void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    action.run();
                } catch (RuntimeException e) {
                    log.error("Provider call after commit failed; reconcile manually", e);
                }
            }
        });
    }
}
