package com.lunchbox.subscriptions.web;

import com.lunchbox.common.idempotency.IdempotencyService;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.subscriptions.LeaveService;
import com.lunchbox.subscriptions.PlanService;
import com.lunchbox.subscriptions.Subscription;
import com.lunchbox.subscriptions.SubscriptionService;
import com.lunchbox.subscriptions.web.SubscriptionDtos.AdminSubscriptionResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.CancelRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.CheckoutResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.CreateSubscriptionRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.LeaveDayRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.LeaveDayResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.PlanUpdateRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.SubscriptionResponse;
import com.lunchbox.subscriptions.web.SubscriptionDtos.UpdateScheduleRequest;
import com.lunchbox.subscriptions.web.SubscriptionDtos.VerifyCheckoutRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Subscriptions")
@RestController
public class SubscriptionController {

    private final SubscriptionService subscriptions;
    private final PlanService plans;
    private final LeaveService leaves;
    private final IdempotencyService idempotency;

    public SubscriptionController(SubscriptionService subscriptions, PlanService plans, LeaveService leaves,
                                  IdempotencyService idempotency) {
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.leaves = leaves;
        this.idempotency = idempotency;
    }

    @GetMapping("/api/v1/plans")
    @PreAuthorize(Roles.REGISTERED)
    public List<PlanResponse> plans() {
        return plans.activePlans();
    }

    @GetMapping("/api/v1/subscriptions")
    @PreAuthorize(Roles.PARENT)
    public List<SubscriptionResponse> list(@AuthenticationPrincipal CurrentUser user) {
        return subscriptions.list(user.requireUserId());
    }

    @PostMapping("/api/v1/subscriptions")
    @PreAuthorize(Roles.PARENT)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Start a subscription; returns what the Razorpay checkout needs")
    public CheckoutResponse create(@AuthenticationPrincipal CurrentUser user,
                                   @RequestHeader(value = IdempotencyService.HEADER, required = false) String idempotencyKey,
                                   @Valid @RequestBody CreateSubscriptionRequest request) {
        return idempotency.execute(idempotencyKey, user.requireUserId(), "subscription.create", request,
                CheckoutResponse.class, () -> subscriptions.create(user.requireUserId(), request));
    }

    @PostMapping("/api/v1/subscriptions/{subscriptionId}/verify")
    @PreAuthorize(Roles.PARENT)
    public SubscriptionResponse verify(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID subscriptionId,
                                       @RequestHeader(value = IdempotencyService.HEADER, required = false) String idempotencyKey,
                                       @Valid @RequestBody VerifyCheckoutRequest request) {
        return idempotency.execute(idempotencyKey, user.requireUserId(), "subscription.verify", request,
                SubscriptionResponse.class, () -> subscriptions.verifyCheckout(user.requireUserId(), subscriptionId,
                        request.razorpayPaymentId(), request.razorpaySignature()));
    }

    @PutMapping("/api/v1/subscriptions/{subscriptionId}/schedule")
    @PreAuthorize(Roles.PARENT)
    public SubscriptionResponse updateSchedule(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID subscriptionId,
                                               @Valid @RequestBody UpdateScheduleRequest request) {
        return subscriptions.updateSchedule(user.requireUserId(), subscriptionId, request);
    }

    @PostMapping("/api/v1/subscriptions/{subscriptionId}/cancel")
    @PreAuthorize(Roles.PARENT)
    public SubscriptionResponse cancel(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID subscriptionId,
                                       @Valid @RequestBody CancelRequest request) {
        return subscriptions.cancelByParent(user.requireUserId(), subscriptionId, request.reason());
    }

    // ---- Leave days ----

    @GetMapping("/api/v1/children/{childId}/leave-days")
    @PreAuthorize(Roles.PARENT)
    public List<LeaveDayResponse> leaveDays(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID childId,
                                            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return leaves.list(user.requireUserId(), childId, from, to);
    }

    @PostMapping("/api/v1/children/{childId}/leave-days")
    @PreAuthorize(Roles.PARENT)
    @ResponseStatus(HttpStatus.CREATED)
    public LeaveDayResponse addLeave(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID childId,
                                     @Valid @RequestBody LeaveDayRequest request) {
        return leaves.add(user.requireUserId(), childId, request);
    }

    @DeleteMapping("/api/v1/children/{childId}/leave-days/{date}")
    @PreAuthorize(Roles.PARENT)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeLeave(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID childId,
                            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        leaves.remove(user.requireUserId(), childId, date);
    }

    // ---- Admin ----

    @GetMapping("/api/v1/admin/plans")
    @PreAuthorize(Roles.ADMIN_READ)
    public List<PlanResponse> allPlans() {
        return plans.allPlans();
    }

    @PostMapping("/api/v1/admin/plans")
    @PreAuthorize(Roles.SUPER_ADMIN)
    @ResponseStatus(HttpStatus.CREATED)
    public PlanResponse createPlan(@Valid @RequestBody PlanRequest request) {
        return plans.create(request);
    }

    @PutMapping("/api/v1/admin/plans/{planId}")
    @PreAuthorize(Roles.SUPER_ADMIN)
    public PlanResponse updatePlan(@PathVariable UUID planId, @Valid @RequestBody PlanUpdateRequest request) {
        return plans.update(planId, request);
    }

    @GetMapping("/api/v1/admin/subscriptions")
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<AdminSubscriptionResponse> search(@RequestParam(required = false) Subscription.Status status,
                                                          @RequestParam(required = false) Integer page,
                                                          @RequestParam(required = false) Integer size) {
        return subscriptions.search(status, page, size);
    }

    @PostMapping("/api/v1/admin/subscriptions/{subscriptionId}/cancel")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public SubscriptionResponse adminCancel(@PathVariable UUID subscriptionId, @Valid @RequestBody CancelRequest request) {
        return subscriptions.cancelByAdmin(subscriptionId, request.reason());
    }
}
