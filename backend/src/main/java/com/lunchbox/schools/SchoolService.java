package com.lunchbox.schools;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.schools.web.SchoolDtos.HolidayRequest;
import com.lunchbox.schools.web.SchoolDtos.HolidayResponse;
import com.lunchbox.schools.web.SchoolDtos.SchoolRequest;
import com.lunchbox.schools.web.SchoolDtos.SchoolResponse;
import com.lunchbox.schools.web.SchoolDtos.SchoolSummaryResponse;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class SchoolService implements SchoolDirectory {

    private final SchoolRepository schools;
    private final SchoolHolidayRepository holidays;
    private final SchoolMapper mapper;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public SchoolService(SchoolRepository schools, SchoolHolidayRepository holidays, SchoolMapper mapper,
                         AuditService audit, ApplicationEventPublisher events, Clock clock) {
        this.schools = schools;
        this.holidays = holidays;
        this.mapper = mapper;
        this.audit = audit;
        this.events = events;
        this.clock = clock;
    }

    // ---- SchoolDirectory ----

    @Override
    @Transactional(readOnly = true)
    public Optional<SchoolInfo> find(UUID schoolId) {
        return schools.findByIdAndDeletedAtIsNull(schoolId).map(mapper::toInfo);
    }

    @Override
    @Transactional(readOnly = true)
    public SchoolInfo require(UUID schoolId) {
        return find(schoolId).orElseThrow(() -> Errors.notFound("School"));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, SchoolInfo> findAll(Collection<UUID> schoolIds) {
        if (schoolIds.isEmpty()) {
            return Map.of();
        }
        return schools.findByIdIn(schoolIds).stream().map(mapper::toInfo)
                .collect(Collectors.toMap(SchoolInfo::id, Function.identity()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SchoolInfo> activeSchools() {
        return schools.findAllActive().stream().map(mapper::toInfo).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isSchoolDay(UUID schoolId, LocalDate date) {
        SchoolInfo school = require(schoolId);
        return school.active() && school.workingDays().contains(date.getDayOfWeek())
                && !holidays.existsBySchoolIdAndHolidayDate(schoolId, date);
    }

    // ---- Parent-facing ----

    @Transactional(readOnly = true)
    public PageResponse<SchoolSummaryResponse> searchForParents(String q, String city, Integer page, Integer size) {
        return PageResponse.of(schools.search(blankToNull(q), blankToNull(city), true,
                Pagination.of(page, size, Sort.by("name"))), mapper::toSummary);
    }

    @Transactional(readOnly = true)
    public List<HolidayResponse> holidays(UUID schoolId, LocalDate from, LocalDate to) {
        if (from.plusDays(400).isBefore(to)) {
            throw Errors.badRequest("range_too_large", "Holiday range may not exceed 400 days.");
        }
        return holidays.findBySchoolIdAndHolidayDateBetweenOrderByHolidayDate(schoolId, from, to).stream()
                .map(mapper::toResponse).toList();
    }

    // ---- Admin ----

    @Transactional(readOnly = true)
    public PageResponse<SchoolResponse> searchForAdmin(String q, String city, Integer page, Integer size) {
        return PageResponse.of(schools.search(blankToNull(q), blankToNull(city), false,
                Pagination.of(page, size, Sort.by("name"))), mapper::toResponse);
    }

    @Transactional(readOnly = true)
    public SchoolResponse get(UUID id) {
        return mapper.toResponse(schools.findByIdAndDeletedAtIsNull(id).orElseThrow(() -> Errors.notFound("School")));
    }

    @Transactional
    public SchoolResponse create(SchoolRequest request) {
        if (schools.existsByCodeIgnoreCase(request.code())) {
            throw Errors.conflict("duplicate_code", "A school with this code already exists.");
        }
        School school = School.create(request.code());
        apply(school, request);
        try {
            school = schools.saveAndFlush(school);
        } catch (DataIntegrityViolationException e) {
            throw Errors.conflict("duplicate_code", "A school with this code already exists.");
        }
        SchoolResponse response = mapper.toResponse(school);
        audit.record("school.created", "School", school.getId(), null, response);
        return response;
    }

    @Transactional
    public SchoolResponse update(UUID id, SchoolRequest request) {
        School school = schools.findByIdAndDeletedAtIsNull(id).orElseThrow(() -> Errors.notFound("School"));
        SchoolResponse before = mapper.toResponse(school);
        if (!school.getCode().equalsIgnoreCase(request.code())) {
            throw Errors.badRequest("code_immutable", "A school's code cannot be changed.");
        }
        apply(school, request);
        SchoolResponse after = mapper.toResponse(school);
        audit.record("school.updated", "School", id, before, after);
        return after;
    }

    @Transactional
    public void delete(UUID id) {
        School school = schools.findByIdAndDeletedAtIsNull(id).orElseThrow(() -> Errors.notFound("School"));
        school.softDelete(clock.instant());
        audit.record("school.deleted", "School", id, mapper.toResponse(school), null);
    }

    @Transactional
    public HolidayResponse addHoliday(UUID schoolId, HolidayRequest request, CurrentUser actor) {
        require(schoolId);
        if (holidays.existsBySchoolIdAndHolidayDate(schoolId, request.date())) {
            throw Errors.conflict("duplicate_holiday", "A holiday already exists on this date.");
        }
        SchoolHoliday holiday = holidays.save(new SchoolHoliday(schoolId, request.date(), request.reason(), actor.userId()));
        HolidayResponse response = mapper.toResponse(holiday);
        audit.record("school.holiday_added", "School", schoolId, null, response);
        events.publishEvent(new HolidayDeclared(schoolId, request.date(), request.reason()));
        return response;
    }

    @Transactional
    public void removeHoliday(UUID schoolId, UUID holidayId) {
        SchoolHoliday holiday = holidays.findById(holidayId)
                .filter(h -> h.getSchoolId().equals(schoolId))
                .orElseThrow(() -> Errors.notFound("Holiday"));
        holidays.delete(holiday);
        audit.record("school.holiday_removed", "School", schoolId, mapper.toResponse(holiday), null);
    }

    private void apply(School s, SchoolRequest r) {
        if (!r.deliveryWindowStart().isBefore(r.deliveryWindowEnd())) {
            throw Errors.badRequest("invalid_window", "Delivery window start must be before its end.");
        }
        if (r.deliveryWindowEnd().isAfter(r.lunchTime())) {
            throw Errors.badRequest("invalid_window", "Delivery window must close by lunch time.");
        }
        s.setName(r.name().trim());
        s.setAddressLine(r.addressLine().trim());
        s.setCity(r.city().trim());
        s.setPincode(r.pincode());
        s.setLocation(Geo.point(r.location()));
        s.setGeofence(r.geofence() == null || r.geofence().isEmpty() ? null : Geo.polygon(r.geofence()));
        if (s.getGeofence() != null && !s.getGeofence().contains(s.getLocation())) {
            throw Errors.badRequest("invalid_geofence", "The school location must be inside its geofence.");
        }
        s.setGeofenceRadiusM(r.geofenceRadiusM());
        s.setLunchTime(r.lunchTime());
        s.setDeliveryWindowStart(r.deliveryWindowStart());
        s.setDeliveryWindowEnd(r.deliveryWindowEnd());
        s.setWorkingDays(r.workingDays());
        s.setContactName(r.contactName());
        s.setContactPhone(r.contactPhone());
        s.setHandoverInstructions(r.handoverInstructions());
        s.setActive(r.active());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
