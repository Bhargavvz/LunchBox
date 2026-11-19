package com.lunchbox.subscriptions;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.payments.PaymentGateway;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanUpdateRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class PlanService {

    private final PlanRepository plans;
    private final SubscriptionRepository subscriptions;
    private final PlanFeatures features;
    private final PaymentGateway gateway;
    private final AuditService audit;
    private final boolean prepaidBilling;

    public PlanService(PlanRepository plans, SubscriptionRepository subscriptions, PlanFeatures features,
                       PaymentGateway gateway, AuditService audit,
                       @org.springframework.beans.factory.annotation.Value("${lunchbox.billing.mode:prepaid}") String billingMode) {
        this.plans = plans;
        this.subscriptions = subscriptions;
        this.features = features;
        this.gateway = gateway;
        this.audit = audit;
        this.prepaidBilling = !"subscription".equalsIgnoreCase(billingMode);
    }

    /** Plans a parent can choose: active and listed (hidden plans are bought only through a direct link). */
    @Transactional(readOnly = true)
    public List<PlanResponse> activePlans() {
        return plans.findByActiveTrueOrderByPricePaise().stream()
                .filter(p -> p.getVisibility() == Plan.Visibility.PUBLIC)
                .map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<PlanResponse> allPlans() {
        return plans.findAllByOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    /** Creates the plan locally and at Razorpay (prices are immutable there, so price changes mean a new plan). */
    @Transactional
    public PlanResponse create(PlanRequest request) {
        if (plans.existsByCodeIgnoreCase(request.code())) {
            throw Errors.conflict("duplicate_code", "A plan with this code already exists.");
        }
        String entitlements = features.validate(request.entitlements());
        Plan plan = plans.save(new Plan(request.code(), request.name().trim(), request.description(), request.pricePaise(),
                request.billingPeriod(), request.maxDaysPerWeek()));
        plan.describe(trimmed(request.features()));
        plan.configure(request.visibility(), request.trialDays(), request.durationPeriods(), request.maxSubscribers(), entitlements);
        checkConsistent(plan);
        // Prepaid billing (ADR-0018) charges per order, so no plan is needed at Razorpay.
        if (!prepaidBilling) {
            int interval = request.billingPeriod() == Plan.BillingPeriod.MONTHLY ? 1 : 3;
            plan.linkProviderPlan(gateway.createPlan(plan.getName(), plan.getPricePaise(), "monthly", interval));
        }
        PlanResponse response = toResponse(plan);
        audit.record("plan.created", "Plan", plan.getId(), null, response);
        return response;
    }

    @Transactional
    public PlanResponse update(UUID planId, PlanUpdateRequest request) {
        Plan plan = plans.findById(planId).orElseThrow(() -> Errors.notFound("Plan"));
        PlanResponse before = toResponse(plan);
        String entitlements = features.validate(request.entitlements());
        plan.update(request.name().trim(), request.description(), request.maxDaysPerWeek(), request.active());
        if (request.features() != null) {
            plan.describe(trimmed(request.features()));
        }
        plan.configure(request.visibility(), request.trialDays(), request.durationPeriods(), request.maxSubscribers(), entitlements);
        checkConsistent(plan);
        PlanResponse after = toResponse(plan);
        audit.record("plan.updated", "Plan", planId, before, after);
        return after;
    }

    /** Settings that contradict each other are refused rather than silently ignored. */
    private void checkConsistent(Plan plan) {
        Set<DayOfWeek> allowed = features.days(plan, PlanFeatures.ALLOWED_DAYS).orElse(null);
        if (allowed != null && allowed.size() < plan.getMaxDaysPerWeek()) {
            throw Errors.badRequest("invalid_features", "The plan allows " + plan.getMaxDaysPerWeek()
                    + " days a week but only " + allowed.size() + " pickup days. Allow more days or lower the days a week.");
        }
        if (plan.getMaxSubscribers() != null && plan.getId() != null) {
            long live = subscriptions.countByPlanIdAndStatusIn(plan.getId(), Subscription.LIVE);
            if (plan.getMaxSubscribers() < live) {
                throw Errors.badRequest("limit_below_live", "This plan already has " + live + " live subscriptions; "
                        + "the limit cannot be lower.");
            }
        }
    }

    PlanResponse toResponse(Plan p) {
        long live = p.getId() == null ? 0 : subscriptions.countByPlanIdAndStatusIn(p.getId(), Subscription.LIVE);
        return new PlanResponse(p.getId(), p.getCode(), p.getName(), p.getDescription(), p.getPricePaise(),
                p.getBillingPeriod(), p.getMaxDaysPerWeek(), p.isActive(), List.copyOf(p.getFeatures()), p.getVisibility(),
                p.getTrialDays(), p.getDurationPeriods(), p.getMaxSubscribers(), live, features.values(p), features.describe(p));
    }

    private static List<String> trimmed(List<String> features) {
        return features == null ? List.of() : features.stream().map(String::trim).filter(f -> !f.isEmpty()).distinct().toList();
    }
}
