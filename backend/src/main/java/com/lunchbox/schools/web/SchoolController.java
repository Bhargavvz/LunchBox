package com.lunchbox.schools.web;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.schools.SchoolService;
import com.lunchbox.schools.web.SchoolDtos.HolidayRequest;
import com.lunchbox.schools.web.SchoolDtos.HolidayResponse;
import com.lunchbox.schools.web.SchoolDtos.SchoolRequest;
import com.lunchbox.schools.web.SchoolDtos.SchoolResponse;
import com.lunchbox.schools.web.SchoolDtos.SchoolSummaryResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Tag(name = "Schools")
@RestController
public class SchoolController {

    private final SchoolService schools;

    public SchoolController(SchoolService schools) {
        this.schools = schools;
    }

    @GetMapping("/api/v1/schools")
    @PreAuthorize(Roles.REGISTERED)
    public PageResponse<SchoolSummaryResponse> search(@RequestParam(required = false) String q,
                                                      @RequestParam(required = false) String city,
                                                      @RequestParam(required = false) Integer page,
                                                      @RequestParam(required = false) Integer size) {
        return schools.searchForParents(q, city, page, size);
    }

    @GetMapping("/api/v1/schools/{schoolId}/holidays")
    @PreAuthorize(Roles.REGISTERED)
    public List<HolidayResponse> holidays(@PathVariable UUID schoolId,
                                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return schools.holidays(schoolId, from, to);
    }

    // ---- Admin ----

    @GetMapping("/api/v1/admin/schools")
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<SchoolResponse> adminSearch(@RequestParam(required = false) String q,
                                                    @RequestParam(required = false) String city,
                                                    @RequestParam(required = false) Integer page,
                                                    @RequestParam(required = false) Integer size) {
        return schools.searchForAdmin(q, city, page, size);
    }

    @GetMapping("/api/v1/admin/schools/{schoolId}")
    @PreAuthorize(Roles.ADMIN_READ)
    public SchoolResponse get(@PathVariable UUID schoolId) {
        return schools.get(schoolId);
    }

    @PostMapping("/api/v1/admin/schools")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.CREATED)
    public SchoolResponse create(@Valid @RequestBody SchoolRequest request) {
        return schools.create(request);
    }

    @PutMapping("/api/v1/admin/schools/{schoolId}")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public SchoolResponse update(@PathVariable UUID schoolId, @Valid @RequestBody SchoolRequest request) {
        return schools.update(schoolId, request);
    }

    @DeleteMapping("/api/v1/admin/schools/{schoolId}")
    @PreAuthorize(Roles.SUPER_ADMIN)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID schoolId) {
        schools.delete(schoolId);
    }

    @PostMapping("/api/v1/admin/schools/{schoolId}/holidays")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.CREATED)
    public HolidayResponse addHoliday(@PathVariable UUID schoolId, @Valid @RequestBody HolidayRequest request,
                                      @AuthenticationPrincipal CurrentUser user) {
        return schools.addHoliday(schoolId, request, user);
    }

    @DeleteMapping("/api/v1/admin/schools/{schoolId}/holidays/{holidayId}")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeHoliday(@PathVariable UUID schoolId, @PathVariable UUID holidayId) {
        schools.removeHoliday(schoolId, holidayId);
    }
}
