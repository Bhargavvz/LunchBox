package com.lunchbox.serviceareas;

import com.lunchbox.common.security.Roles;
import com.lunchbox.serviceareas.ServiceAreaService.ServiceAreaRequest;
import com.lunchbox.serviceareas.ServiceAreaService.ServiceAreaResponse;
import com.lunchbox.serviceareas.ServiceAreaService.ServiceabilityResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@Tag(name = "Service areas")
@RestController
public class ServiceAreaController {

    private final ServiceAreaService service;

    public ServiceAreaController(ServiceAreaService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/service-areas/check")
    @PreAuthorize(Roles.REGISTERED)
    public ServiceabilityResponse check(@RequestParam @DecimalMin("-90") @DecimalMax("90") double lat,
                                        @RequestParam @DecimalMin("-180") @DecimalMax("180") double lng) {
        return new ServiceabilityResponse(service.isServiceable(lat, lng));
    }

    @GetMapping("/api/v1/admin/service-areas")
    @PreAuthorize(Roles.ADMIN_READ)
    public List<ServiceAreaResponse> list() {
        return service.list();
    }

    @PostMapping("/api/v1/admin/service-areas")
    @PreAuthorize(Roles.ADMIN_WRITE)
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceAreaResponse create(@Valid @RequestBody ServiceAreaRequest request) {
        return service.create(request);
    }

    @PutMapping("/api/v1/admin/service-areas/{id}")
    @PreAuthorize(Roles.ADMIN_WRITE)
    public ServiceAreaResponse update(@PathVariable UUID id, @Valid @RequestBody ServiceAreaRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/api/v1/admin/service-areas/{id}")
    @PreAuthorize(Roles.SUPER_ADMIN)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
