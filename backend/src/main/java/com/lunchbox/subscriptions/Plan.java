package com.lunchbox.subscriptions;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.List;

@Getter
@Entity
@Table(name = "plans")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Plan extends BaseEntity {

    public enum BillingPeriod { MONTHLY, QUARTERLY }

    /** HIDDEN plans are not listed to parents but can still be bought by id (e.g. a link from ops) and keep working. */
    public enum Visibility { PUBLIC, HIDDEN }

    @Column(nullable = false, unique = true, updatable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    private String description;

    /** Price per billing period in paise. Immutable once a Razorpay plan exists; create a new plan instead. */
    @Column(name = "price_paise", nullable = false, updatable = false)
    private long pricePaise;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_period", nullable = false, updatable = false)
    private BillingPeriod billingPeriod;

    @Column(name = "max_days_per_week", nullable = false)
    private int maxDaysPerWeek;

    @Column(name = "razorpay_plan_id")
    private String razorpayPlanId;

    @Column(nullable = false)
    private boolean active = true;

    /** Short bullets shown on the plan card ("Pickup on school days", "Live tracking"). */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "features", nullable = false)
    private List<String> features = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Visibility visibility = Visibility.PUBLIC;

    /** Free days for a parent's first subscription on this plan before the first payment (0 = no trial). */
    @Column(name = "trial_days", nullable = false)
    private int trialDays;

    /** Number of paid periods after which the plan ends instead of renewing; null = until cancelled. */
    @Column(name = "duration_periods")
    private Integer durationPeriods;

    /** Most live subscriptions this plan may have; null = no limit. */
    @Column(name = "max_subscribers")
    private Integer maxSubscribers;

    /** Feature key → typed value (see plan_feature_definitions), as JSON. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String entitlements = "{}";

    Plan(String code, String name, String description, long pricePaise, BillingPeriod billingPeriod, int maxDaysPerWeek) {
        this.code = code;
        this.name = name;
        this.description = description;
        this.pricePaise = pricePaise;
        this.billingPeriod = billingPeriod;
        this.maxDaysPerWeek = maxDaysPerWeek;
    }

    void linkProviderPlan(String providerPlanId) {
        this.razorpayPlanId = providerPlanId;
    }

    void describe(List<String> features) {
        this.features = features == null ? new ArrayList<>() : new ArrayList<>(features);
    }

    void configure(Visibility visibility, int trialDays, Integer durationPeriods, Integer maxSubscribers,
                   String entitlementsJson) {
        this.visibility = visibility == null ? Visibility.PUBLIC : visibility;
        this.trialDays = trialDays;
        this.durationPeriods = durationPeriods;
        this.maxSubscribers = maxSubscribers;
        this.entitlements = entitlementsJson == null ? "{}" : entitlementsJson;
    }

    void update(String name, String description, int maxDaysPerWeek, boolean active) {
        this.name = name;
        this.description = description;
        this.maxDaysPerWeek = maxDaysPerWeek;
        this.active = active;
    }
}
