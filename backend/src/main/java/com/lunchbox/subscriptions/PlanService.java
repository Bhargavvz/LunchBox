package com.lunchbox.subscriptions;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.payments.PaymentGateway;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanUpdateRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class PlanService {

    private final PlanRepository plans;
    private final PaymentGateway gateway;
    private final AuditService audit;

    public PlanService(PlanRepository plans, PaymentGateway gateway, AuditService audit) {
        this.plans = plans;
        this.gateway = gateway;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<PlanResponse> activePlans() {
        return plans.findByActiveTrueOrderByPricePaise().stream().map(PlanService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<PlanResponse> allPlans() {
        return plans.findAllByOrderByCreatedAtDesc().stream().map(PlanService::toResponse).toList();
    }

    /** Creates the plan locally and at Razorpay (prices are immutable there, so price changes mean a new plan). */
    @Transactional
    public PlanResponse create(PlanRequest request) {
        if (plans.existsByCodeIgnoreCase(request.code())) {
            throw Errors.conflict("duplicate_code", "A plan with this code already exists.");
        }
        Plan plan = plans.save(new Plan(request.code(), request.name().trim(), request.description(), request.pricePaise(),
                request.billingPeriod(), request.maxDaysPerWeek()));
        int interval = request.billingPeriod() == Plan.BillingPeriod.MONTHLY ? 1 : 3;
        plan.linkProviderPlan(gateway.createPlan(plan.getName(), plan.getPricePaise(), "monthly", interval));
        PlanResponse response = toResponse(plan);
        audit.record("plan.created", "Plan", plan.getId(), null, response);
        return response;
    }

    @Transactional
    public PlanResponse update(UUID planId, PlanUpdateRequest request) {
        Plan plan = plans.findById(planId).orElseThrow(() -> Errors.notFound("Plan"));
        PlanResponse before = toResponse(plan);
        plan.update(request.name().trim(), request.description(), request.maxDaysPerWeek(), request.active());
        PlanResponse after = toResponse(plan);
        audit.record("plan.updated", "Plan", planId, before, after);
        return after;
    }

    static PlanResponse toResponse(Plan p) {
        return new PlanResponse(p.getId(), p.getCode(), p.getName(), p.getDescription(), p.getPricePaise(),
                p.getBillingPeriod(), p.getMaxDaysPerWeek(), p.isActive());
    }
}
