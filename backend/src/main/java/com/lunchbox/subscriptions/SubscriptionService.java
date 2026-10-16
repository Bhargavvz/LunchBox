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
import com.lunchbox.subscriptions.web.SubscriptionDtos.SubscriptionResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.UpdateScheduleRequest;
import com.lunchbox.users.UserDirectory;
import com.lunchbox.users.UserDirectory.ParentInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public SubscriptionService(SubscriptionRepository subscriptions, PlanRepository plans, LeaveDayRepository leaves,
                               ChildDirectory children, AddressDirectory addresses, SchoolDirectory schools,
                               UserDirectory users, PaymentGateway gateway, PaymentRecorder payments,
                               PickupWindows windows, AuditService audit, ApplicationEventPublisher events, Clock clock) {
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
        this.audit = audit;
        this.events = events;
        this.clock = clock;
    }

    // ---- SubscriptionQueries ----

    @Override
    @Transactional(readOnly = true)
    public List<ScheduleEntry> schedulesFor(LocalDate date) {
        return subscriptions.findActiveOn(date).stream()
                .map(s -> new ScheduleEntry(s.getId(), s.getChildId(), s.getParentId(), s.getAddressId(), s.getDaysOfWeek()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> childrenOnLeave(LocalDate date) {
        return new HashSet<>(leaves.findChildIdsOnLeave(date));
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
        LocalDate firstOpen = windows.firstOpenDate();
        if (request.startDate().isBefore(firstOpen)) {
            throw Errors.unprocessable("start_too_early", "The earliest start date is " + firstOpen + ".");
        }
        if (!subscriptions.findByChildIdAndStatusIn(child.id(), Subscription.LIVE).isEmpty()) {
            throw Errors.conflict("subscription_exists", "This child already has a subscription.");
        }
        if (plan.getRazorpayPlanId() == null) {
            throw Errors.unavailable("plan_not_ready", "This plan is not available for purchase yet.");
        }
        Subscription sub = subscriptions.saveAndFlush(new Subscription(parentId, child.id(), plan.getId(),
                request.addressId(), request.daysOfWeek(), request.startDate()));
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
                plan.getName(), parent.firstName(), parent.phone());
    }

    /** Client-side confirmation after checkout; the signature proves Razorpay authorised the mandate payment. */
    @Transactional
    public SubscriptionResponse verifyCheckout(UUID parentUserId, UUID subscriptionId, String paymentId, String signature) {
        UUID parentId = users.requireParentId(parentUserId);
        Subscription sub = subscriptions.findByIdAndParentId(subscriptionId, parentId)
                .orElseThrow(() -> Errors.notFound("Subscription"));
        if (sub.getRazorpaySubscriptionId() == null
                || !gateway.verifyCheckoutSignature(paymentId, sub.getRazorpaySubscriptionId(), signature)) {
            throw Errors.badRequest("invalid_signature", "We could not verify this payment. Please contact support.");
        }
        Plan plan = plans.findById(sub.getPlanId()).orElseThrow();
        payments.recordAuthorized(parentId, sub.getId(), paymentId, plan.getPricePaise(), plan.getName());
        Subscription.Status before = sub.getStatus();
        sub.activate(null);
        audit.record("subscription.activated", "Subscription", sub.getId(), Map.of("status", before.name()),
                Map.of("status", sub.getStatus().name(), "via", "checkout"));
        return toResponse(sub, plan, children.require(sub.getChildId()));
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
        cancel(sub, reason);
        return toResponse(sub, plans.findById(sub.getPlanId()).orElseThrow(), children.require(sub.getChildId()));
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
    }

    private List<SubscriptionResponse> toResponses(List<Subscription> list) {
        Map<UUID, ChildInfo> childMap = children.findAll(list.stream().map(Subscription::getChildId).collect(Collectors.toSet()));
        Map<UUID, Plan> planMap = plans.findAllById(list.stream().map(Subscription::getPlanId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Plan::getId, Function.identity()));
        return list.stream().map(s -> toResponse(s, planMap.get(s.getPlanId()), childMap.get(s.getChildId()))).toList();
    }

    static SubscriptionResponse toResponse(Subscription s, Plan p, ChildInfo c) {
        return new SubscriptionResponse(s.getId(), s.getChildId(), c == null ? null : c.displayName(), s.getPlanId(),
                p == null ? null : p.getName(), p == null ? 0 : p.getPricePaise(), s.getAddressId(), s.getDaysOfWeek(),
                s.getStartDate(), s.getEndDate(), s.getStatus(), s.getCurrentPeriodEnd(), s.getCancelledAt(),
                s.getCancelReason());
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
