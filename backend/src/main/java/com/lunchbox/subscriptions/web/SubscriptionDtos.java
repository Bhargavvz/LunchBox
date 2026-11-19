package com.lunchbox.subscriptions.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.lunchbox.subscriptions.Coupon;
import com.lunchbox.subscriptions.Plan;
import com.lunchbox.subscriptions.PlanFeatureDefinition;
import com.lunchbox.subscriptions.Subscription;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class SubscriptionDtos {

    private SubscriptionDtos() {
    }

    public record PlanResponse(UUID id, String code, String name, String description, long pricePaise,
                               Plan.BillingPeriod billingPeriod, int maxDaysPerWeek, boolean active,
                               List<String> features, Plan.Visibility visibility, int trialDays, Integer durationPeriods,
                               Integer maxSubscribers, long liveSubscribers, Map<String, JsonNode> entitlements,
                               List<PlanFeatureValue> featureList) {
    }

    /** A feature set on a plan, with its label, for plan cards. */
    public record PlanFeatureValue(String key, String label, String description, PlanFeatureDefinition.ValueType valueType,
                                   JsonNode value, boolean enforced, int displayOrder) {
    }

    public record FeatureDefinitionResponse(String key, String label, String description,
                                            PlanFeatureDefinition.ValueType valueType, boolean enforced,
                                            JsonNode defaultValue, int displayOrder, boolean active) {
    }

    public record FeatureDefinitionRequest(
            @NotBlank @Pattern(regexp = "^[a-z][a-z0-9_]{1,59}$") String key,
            @NotBlank @Size(max = 120) String label,
            @Size(max = 300) String description,
            @NotNull PlanFeatureDefinition.ValueType valueType,
            @Min(0) @Max(10_000) Integer displayOrder,
            boolean active) {
    }

    public record CouponRequest(
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{3,30}$") String code,
            @Size(max = 200) String description,
            @NotNull Coupon.Kind kind,
            @Positive long amount,
            @Positive Long maxDiscountPaise,
            LocalDate validFrom,
            LocalDate validTo,
            @Positive Integer maxRedemptions,
            @Size(max = 50) List<UUID> planIds,
            boolean firstSubscriptionOnly,
            boolean active) {
    }

    public record CouponResponse(UUID id, String code, String description, Coupon.Kind kind, long amount,
                                 Long maxDiscountPaise, LocalDate validFrom, LocalDate validTo, Integer maxRedemptions,
                                 int redeemed, List<UUID> planIds, boolean firstSubscriptionOnly, boolean active,
                                 Instant createdAt) {
    }

    public record QuoteRequest(@NotNull UUID planId, @Size(max = 30) String couponCode) {
    }

    /** What a parent will pay now: price, coupon discount, and whether a free trial applies instead. */
    public record QuoteResponse(UUID planId, long pricePaise, long discountPaise, long payablePaise, String couponCode,
                                int trialDays) {
    }

    public record RenewRequest(@Size(max = 30) String couponCode) {
    }

    public record PlanRequest(
            @NotBlank @Size(max = 40) @Pattern(regexp = "^[A-Z0-9_]+$") String code,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 500) String description,
            @Positive long pricePaise,
            @NotNull Plan.BillingPeriod billingPeriod,
            @Min(1) @Max(7) int maxDaysPerWeek,
            @Size(max = 8) List<@NotBlank @Size(max = 80) String> features,
            Plan.Visibility visibility,
            @Min(0) @Max(30) int trialDays,
            @Min(1) @Max(36) Integer durationPeriods,
            @Positive Integer maxSubscribers,
            Map<String, JsonNode> entitlements) {
    }

    public record PlanUpdateRequest(
            @NotBlank @Size(max = 120) String name,
            @Size(max = 500) String description,
            @Min(1) @Max(7) int maxDaysPerWeek,
            boolean active,
            @Size(max = 8) List<@NotBlank @Size(max = 80) String> features,
            /* Fields left out (null) keep their current value. */
            Plan.Visibility visibility,
            @Min(0) @Max(30) Integer trialDays,
            /* 0 = renews until cancelled. */
            @Min(0) @Max(36) Integer durationPeriods,
            /* 0 = no limit. */
            @Min(0) Integer maxSubscribers,
            Map<String, JsonNode> entitlements) {
    }

    public record CreateSubscriptionRequest(
            @NotNull UUID childId,
            @NotNull UUID planId,
            @NotNull UUID addressId,
            @NotEmpty @Size(max = 7) Set<DayOfWeek> daysOfWeek,
            @NotNull LocalDate startDate,
            @Size(max = 30) String couponCode) {
    }

    public record UpdateScheduleRequest(@NotNull UUID addressId, @NotEmpty @Size(max = 7) Set<DayOfWeek> daysOfWeek) {
    }

    public record CheckoutResponse(
            UUID subscriptionId,
            String providerSubscriptionId,
            String razorpayKeyId,
            String shortUrl,
            long amountPaise,
            String planName,
            String prefillName,
            String prefillContact,
            /* Prepaid billing: the Razorpay order the checkout pays (providerSubscriptionId is then null). */
            String providerOrderId,
            long discountPaise,
            String couponCode,
            /* Set when the plan started with a free trial: nothing to pay now (no order). */
            Instant trialEndsAt) {
    }

    public record VerifyCheckoutRequest(
            @NotBlank @Size(max = 64) String razorpayPaymentId,
            @NotBlank @Size(max = 128) String razorpaySignature) {
    }

    public record CancelRequest(@NotBlank @Size(max = 300) String reason) {
    }

    public record SubscriptionResponse(
            UUID id,
            UUID childId,
            String childName,
            UUID planId,
            String planName,
            long pricePaise,
            UUID addressId,
            Set<DayOfWeek> daysOfWeek,
            LocalDate startDate,
            LocalDate endDate,
            Subscription.Status status,
            Instant currentPeriodEnd,
            Instant cancelledAt,
            String cancelReason,
            Instant trialEndsAt,
            int periodsPaid,
            boolean cancellationAllowed) {
    }

    public record LeaveDayRequest(@NotNull LocalDate date, @Size(max = 200) String reason) {
    }

    public record LeaveDayResponse(UUID id, UUID childId, LocalDate date, String reason) {
    }

    public record AdminSubscriptionResponse(UUID id, UUID parentId, UUID childId, String childName, String planName,
                                            Subscription.Status status, Set<DayOfWeek> daysOfWeek, LocalDate startDate,
                                            LocalDate endDate, Instant currentPeriodEnd, Instant createdAt) {
    }
}
