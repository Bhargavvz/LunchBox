package com.lunchbox.schools;

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
@Table(name = "school_holidays")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SchoolHoliday extends BaseEntity {

    @Column(name = "school_id", nullable = false, updatable = false)
    private UUID schoolId;

    @Column(name = "holiday_date", nullable = false, updatable = false)
    private LocalDate holidayDate;

    @Column(nullable = false)
    private String reason;

    @Column(name = "created_by")
    private UUID createdBy;

    SchoolHoliday(UUID schoolId, LocalDate holidayDate, String reason, UUID createdBy) {
        this.schoolId = schoolId;
        this.holidayDate = holidayDate;
        this.reason = reason;
        this.createdBy = createdBy;
    }
}
