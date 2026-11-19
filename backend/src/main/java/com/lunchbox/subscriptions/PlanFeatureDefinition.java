package com.lunchbox.subscriptions;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * A kind of plan feature. Built-in ones ({@code enforced}) are applied by the backend; admins can add their own,
 * which are typed, validated and shown to parents on the plan card.
 */
@Getter
@Entity
@Table(name = "plan_feature_definitions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlanFeatureDefinition {

    public enum ValueType { BOOLEAN, INTEGER, DAYS, TEXT, MONEY }

    @Id
    private String key;

    @Column(nullable = false)
    private String label;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "value_type", nullable = false, updatable = false)
    private ValueType valueType;

    @Column(nullable = false, updatable = false)
    private boolean enforced;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "default_value")
    private String defaultValue;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    PlanFeatureDefinition(String key, String label, String description, ValueType valueType, int displayOrder, Instant at) {
        this.key = key;
        this.label = label;
        this.description = description;
        this.valueType = valueType;
        this.enforced = false;
        this.displayOrder = displayOrder;
        this.createdAt = at;
        this.updatedAt = at;
    }

    void update(String label, String description, int displayOrder, boolean active, Instant at) {
        this.label = label;
        this.description = description;
        this.displayOrder = displayOrder;
        this.active = active;
        this.updatedAt = at;
    }
}
