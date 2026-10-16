package com.lunchbox.dispatch;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "partner_issues")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PartnerIssue extends BaseEntity {

    public enum Type { SOS, ACCIDENT, VEHICLE_BREAKDOWN, PARENT_UNREACHABLE, SCHOOL_CLOSED, OTHER }

    public enum Status { OPEN, ACKNOWLEDGED, RESOLVED }

    @Column(name = "partner_id", nullable = false, updatable = false)
    private UUID partnerId;

    @Column(name = "order_id", updatable = false)
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "issue_type", nullable = false, updatable = false)
    private Type issueType;

    @Column(updatable = false)
    private String description;

    @Column(columnDefinition = "geometry(Point,4326)", updatable = false)
    private Point location;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.OPEN;

    @Column(name = "acknowledged_by")
    private UUID acknowledgedBy;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolution_note")
    private String resolutionNote;

    PartnerIssue(UUID partnerId, UUID orderId, Type type, String description, Point location) {
        this.partnerId = partnerId;
        this.orderId = orderId;
        this.issueType = type;
        this.description = description;
        this.location = location;
    }

    void acknowledge(UUID by) {
        if (status == Status.OPEN) {
            this.status = Status.ACKNOWLEDGED;
            this.acknowledgedBy = by;
        }
    }

    void resolve(UUID by, String note, Instant at) {
        if (acknowledgedBy == null) {
            acknowledgedBy = by;
        }
        this.status = Status.RESOLVED;
        this.resolutionNote = note;
        this.resolvedAt = at;
    }
}
