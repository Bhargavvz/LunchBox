package com.lunchbox.subscriptions.web;

import com.lunchbox.subscriptions.Plan;
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
import java.util.Set;
import java.util.UUID;

public final class SubscriptionDtos {

    private SubscriptionDtos() {
    }

    public record PlanResponse(UUID id, String code, String name, String description, long pricePaise,
                               Plan.BillingPeriod billingPeriod, int maxDaysPerWeek, boolean active) {
    }

    public record PlanRequest(
            @NotBlank @Size(max = 40) @Pattern(regexp = "^[A-Z0-9_]+$") String code,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 500) String description,
            @Positive long pricePaise,
            @NotNull Plan.BillingPeriod billingPeriod,
            @Min(1) @Max(6) int maxDaysPerWeek) {
    }

    public record PlanUpdateRequest(
            @NotBlank @Size(max = 120) String name,
            @Size(max = 500) String description,
            @Min(1) @Max(6) int maxDaysPerWeek,
            boolean active) {
    }

    public record CreateSubscriptionRequest(
            @NotNull UUID childId,
            @NotNull UUID planId,
            @NotNull UUID addressId,
            @NotEmpty @Size(max = 6) Set<DayOfWeek> daysOfWeek,
            @NotNull LocalDate startDate) {
    }

    public record UpdateScheduleRequest(@NotNull UUID addressId, @NotEmpty @Size(max = 6) Set<DayOfWeek> daysOfWeek) {
    }

    public record CheckoutResponse(
            UUID subscriptionId,
            String providerSubscriptionId,
            String razorpayKeyId,
            String shortUrl,
            long amountPaise,
            String planName,
            String prefillName,
            String prefillContact) {
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
            String cancelReason) {
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
