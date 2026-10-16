package com.lunchbox.addresses;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.privacy.PersonalDataContributor;
import com.lunchbox.common.web.Validation;
import com.lunchbox.serviceareas.ServiceAreaDirectory;
import com.lunchbox.users.UserDirectory;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class AddressService implements AddressDirectory, PersonalDataContributor {

    static final int MAX_ADDRESSES = 5;

    private final AddressRepository addresses;
    private final ServiceAreaDirectory serviceAreas;
    private final UserDirectory users;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public AddressService(AddressRepository addresses, ServiceAreaDirectory serviceAreas, UserDirectory users,
                          AuditService audit, ApplicationEventPublisher events, Clock clock) {
        this.addresses = addresses;
        this.serviceAreas = serviceAreas;
        this.users = users;
        this.audit = audit;
        this.events = events;
        this.clock = clock;
    }

    public record AddressRequest(
            @NotBlank @Size(max = 40) String label,
            @NotBlank @Size(max = 200) String line1,
            @Size(max = 200) String line2,
            @Size(max = 160) String landmark,
            @NotBlank @Size(max = 80) String city,
            @NotBlank @Pattern(regexp = Validation.PINCODE) String pincode,
            @NotNull @Valid GeoPoint location,
            @Size(max = 500) String instructions,
            boolean makeDefault) {
    }

    public record AddressResponse(UUID id, String label, String line1, String line2, String landmark, String city,
                                  String pincode, GeoPoint location, String instructions, boolean isDefault,
                                  Instant createdAt) {
    }

    // ---- AddressDirectory ----

    @Override
    @Transactional(readOnly = true)
    public AddressInfo require(UUID addressId) {
        return addresses.findById(addressId).map(AddressService::info).orElseThrow(() -> Errors.notFound("Address"));
    }

    @Override
    @Transactional(readOnly = true)
    public AddressInfo requireOwned(UUID addressId, UUID parentId) {
        return addresses.findByIdAndParentIdAndDeletedAtIsNull(addressId, parentId).map(AddressService::info)
                .orElseThrow(() -> Errors.notFound("Address"));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, AddressInfo> findAll(Collection<UUID> addressIds) {
        if (addressIds.isEmpty()) {
            return Map.of();
        }
        return addresses.findByIdIn(addressIds).stream().map(AddressService::info)
                .collect(Collectors.toMap(AddressInfo::id, Function.identity()));
    }

    // ---- Parent API ----

    @Transactional(readOnly = true)
    public List<AddressResponse> list(UUID parentUserId) {
        UUID parentId = users.requireParentId(parentUserId);
        return addresses.findByParentIdAndDeletedAtIsNullOrderByCreatedAt(parentId).stream()
                .map(AddressService::toResponse).toList();
    }

    @Transactional
    public AddressResponse create(UUID parentUserId, AddressRequest request) {
        UUID parentId = users.requireParentId(parentUserId);
        long count = addresses.countByParentIdAndDeletedAtIsNull(parentId);
        if (count >= MAX_ADDRESSES) {
            throw Errors.unprocessable("too_many_addresses", "You can save up to " + MAX_ADDRESSES + " addresses.");
        }
        requireServiceable(request.location());
        Address address = new Address(parentId);
        apply(address, request);
        boolean makeDefault = request.makeDefault() || count == 0;
        if (makeDefault) {
            clearDefault(parentId);
        }
        address.markDefault(makeDefault);
        address = addresses.save(address);
        audit.record("address.created", "Address", address.getId(), null, auditView(address));
        return toResponse(address);
    }

    @Transactional
    public AddressResponse update(UUID parentUserId, UUID addressId, AddressRequest request) {
        UUID parentId = users.requireParentId(parentUserId);
        Address address = addresses.findByIdAndParentIdAndDeletedAtIsNull(addressId, parentId)
                .orElseThrow(() -> Errors.notFound("Address"));
        Map<String, Object> before = auditView(address);
        requireServiceable(request.location());
        apply(address, request);
        if (request.makeDefault() && !address.isDefaultAddress()) {
            clearDefault(parentId);
            address.markDefault(true);
        }
        audit.record("address.updated", "Address", addressId, before, auditView(address));
        return toResponse(address);
    }

    @Transactional
    public void delete(UUID parentUserId, UUID addressId) {
        UUID parentId = users.requireParentId(parentUserId);
        Address address = addresses.findByIdAndParentIdAndDeletedAtIsNull(addressId, parentId)
                .orElseThrow(() -> Errors.notFound("Address"));
        events.publishEvent(new AddressRemoving(addressId, parentId));
        boolean wasDefault = address.isDefaultAddress();
        address.softDelete(clock.instant());
        addresses.flush();
        if (wasDefault) {
            addresses.findByParentIdAndDeletedAtIsNullOrderByCreatedAt(parentId).stream().findFirst()
                    .ifPresent(a -> a.markDefault(true));
        }
        audit.record("address.deleted", "Address", addressId, auditView(address), null);
    }

    // ---- PersonalDataContributor ----

    @Override
    public String section() {
        return "addresses";
    }

    @Override
    public int order() {
        return 60;
    }

    @Override
    @Transactional(readOnly = true)
    public Object export(UUID userId) {
        return list(userId);
    }

    @Override
    @Transactional
    public void erase(UUID userId) {
        UUID parentId = users.requireParentId(userId);
        addresses.findByParentId(parentId).forEach(a -> a.anonymise(clock.instant()));
    }

    private void requireServiceable(GeoPoint p) {
        if (!serviceAreas.isServiceable(p.lat(), p.lng())) {
            throw Errors.unprocessable("not_serviceable", "Sorry, LunchBox does not serve this location yet.");
        }
    }

    private void clearDefault(UUID parentId) {
        addresses.findByParentIdAndDeletedAtIsNullOrderByCreatedAt(parentId).forEach(a -> a.markDefault(false));
        addresses.flush();
    }

    private static void apply(Address a, AddressRequest r) {
        a.update(r.label().trim(), r.line1().trim(), blank(r.line2()), blank(r.landmark()), r.city().trim(),
                r.pincode(), Geo.point(r.location()), blank(r.instructions()));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static AddressInfo info(Address a) {
        return new AddressInfo(a.getId(), a.getParentId(), a.getLabel(), a.getLine1(), a.getLine2(), a.getLandmark(),
                a.getCity(), a.getPincode(), a.getLocation(), a.getInstructions(), a.isDeleted());
    }

    private static AddressResponse toResponse(Address a) {
        return new AddressResponse(a.getId(), a.getLabel(), a.getLine1(), a.getLine2(), a.getLandmark(), a.getCity(),
                a.getPincode(), Geo.toGeoPoint(a.getLocation()), a.getInstructions(), a.isDefaultAddress(),
                a.getCreatedAt());
    }

    /** Audit snapshot without the street address. */
    private static Map<String, Object> auditView(Address a) {
        return Map.of("label", a.getLabel(), "city", a.getCity(), "pincode", a.getPincode(), "isDefault", a.isDefaultAddress());
    }
}
