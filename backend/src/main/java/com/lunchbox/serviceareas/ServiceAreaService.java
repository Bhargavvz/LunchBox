package com.lunchbox.serviceareas;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class ServiceAreaService implements ServiceAreaDirectory {

    private final ServiceAreaRepository repository;
    private final AuditService audit;

    public ServiceAreaService(ServiceAreaRepository repository, AuditService audit) {
        this.repository = repository;
        this.audit = audit;
    }

    public record ServiceAreaResponse(UUID id, String name, String city, List<GeoPoint> boundary, boolean active,
                                      Instant updatedAt) {
    }

    public record ServiceAreaRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Size(max = 80) String city,
            @NotNull @Size(min = 3, max = 500) List<@Valid GeoPoint> boundary,
            boolean active) {
    }

    public record ServiceabilityResponse(boolean serviceable) {
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isServiceable(double lat, double lng) {
        return !repository.findContaining(lat, lng).isEmpty();
    }

    @Transactional(readOnly = true)
    public List<ServiceAreaResponse> list() {
        return repository.findAllByOrderByCityAscNameAsc().stream().map(ServiceAreaService::toResponse).toList();
    }

    @Transactional
    public ServiceAreaResponse create(ServiceAreaRequest request) {
        ServiceArea area = repository.save(new ServiceArea(request.name().trim(), request.city().trim(),
                Geo.polygon(request.boundary()), request.active()));
        ServiceAreaResponse response = toResponse(area);
        audit.record("service_area.created", "ServiceArea", area.getId(), null, response);
        return response;
    }

    @Transactional
    public ServiceAreaResponse update(UUID id, ServiceAreaRequest request) {
        ServiceArea area = repository.findById(id).orElseThrow(() -> Errors.notFound("Service area"));
        ServiceAreaResponse before = toResponse(area);
        area.update(request.name().trim(), request.city().trim(), Geo.polygon(request.boundary()), request.active());
        ServiceAreaResponse after = toResponse(area);
        audit.record("service_area.updated", "ServiceArea", id, before, after);
        return after;
    }

    @Transactional
    public void delete(UUID id) {
        ServiceArea area = repository.findById(id).orElseThrow(() -> Errors.notFound("Service area"));
        repository.delete(area);
        audit.record("service_area.deleted", "ServiceArea", id, toResponse(area), null);
    }

    private static ServiceAreaResponse toResponse(ServiceArea a) {
        return new ServiceAreaResponse(a.getId(), a.getName(), a.getCity(), Geo.vertices(a.getBoundary()), a.isActive(),
                a.getUpdatedAt());
    }
}
