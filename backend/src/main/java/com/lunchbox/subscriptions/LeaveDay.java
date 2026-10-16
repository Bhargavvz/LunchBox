package com.lunchbox.subscriptions;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.UUID;

@Getter
@Entity
@Table(name = "leave_days")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LeaveDay extends BaseEntity {

    @Column(name = "child_id", nullable = false, updatable = false)
    private UUID childId;

    @Column(name = "leave_date", nullable = false, updatable = false)
    private LocalDate leaveDate;

    private String reason;

    @Column(name = "created_by")
    private UUID createdBy;

    LeaveDay(UUID childId, LocalDate leaveDate, String reason, UUID createdBy) {
        this.childId = childId;
        this.leaveDate = leaveDate;
        this.reason = reason;
        this.createdBy = createdBy;
    }
}
