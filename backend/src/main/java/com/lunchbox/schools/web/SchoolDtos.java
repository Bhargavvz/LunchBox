package com.lunchbox.schools.web;

import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.web.Validation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class SchoolDtos {

    private SchoolDtos() {
    }

    /** What parents see when choosing a school. */
    public record SchoolSummaryResponse(UUID id, String name, String addressLine, String city, String pincode,
                                        LocalTime lunchTime, Set<DayOfWeek> workingDays) {
    }

    public record SchoolResponse(
            UUID id,
            String code,
            String name,
            String addressLine,
            String city,
            String pincode,
            GeoPoint location,
            List<GeoPoint> geofence,
            Integer geofenceRadiusM,
            LocalTime lunchTime,
            LocalTime deliveryWindowStart,
            LocalTime deliveryWindowEnd,
            Set<DayOfWeek> workingDays,
            String contactName,
            String contactPhone,
            String handoverInstructions,
            boolean active,
            Instant createdAt) {
    }

    public record SchoolRequest(
            @NotBlank @Size(max = 30) @Pattern(regexp = "^[A-Z0-9-]+$") String code,
            @NotBlank @Size(max = 160) String name,
            @NotBlank @Size(max = 300) String addressLine,
            @NotBlank @Size(max = 80) String city,
            @NotBlank @Pattern(regexp = Validation.PINCODE) String pincode,
            @NotNull @Valid GeoPoint location,
            @Size(min = 3, max = 200) List<@Valid GeoPoint> geofence,
            @Min(20) @Max(2000) Integer geofenceRadiusM,
            @NotNull LocalTime lunchTime,
            @NotNull LocalTime deliveryWindowStart,
            @NotNull LocalTime deliveryWindowEnd,
            @NotEmpty Set<DayOfWeek> workingDays,
            @Size(max = 120) String contactName,
            @Pattern(regexp = Validation.INDIAN_MOBILE) String contactPhone,
            @Size(max = 500) String handoverInstructions,
            boolean active) {
    }

    public record HolidayResponse(UUID id, UUID schoolId, LocalDate date, String reason) {
    }

    public record HolidayRequest(@NotNull @FutureOrPresent LocalDate date, @NotBlank @Size(max = 200) String reason) {
    }
}
