package com.lunchbox.schools;

import com.lunchbox.common.geo.GeoMapping;
import com.lunchbox.schools.web.SchoolDtos.HolidayResponse;
import com.lunchbox.schools.web.SchoolDtos.SchoolResponse;
import com.lunchbox.schools.web.SchoolDtos.SchoolSummaryResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(uses = GeoMapping.class)
interface SchoolMapper {

    SchoolResponse toResponse(School school);

    SchoolSummaryResponse toSummary(School school);

    @Mapping(target = "date", source = "holidayDate")
    HolidayResponse toResponse(SchoolHoliday holiday);

    default SchoolDirectory.SchoolInfo toInfo(School s) {
        return new SchoolDirectory.SchoolInfo(s.getId(), s.getName(), s.getAddressLine(), s.getLocation(), s.getGeofence(),
                s.getGeofenceRadiusM(), s.getLunchTime(), s.getDeliveryWindowStart(), s.getDeliveryWindowEnd(),
                s.getWorkingDays(), s.getHandoverInstructions(), s.isActive());
    }
}
