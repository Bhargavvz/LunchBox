package com.lunchbox.dispatch;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.security.Role;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.dispatch.web.DispatchDtos.AdminPartnerResponse;
import com.lunchbox.dispatch.web.DispatchDtos.BankAccountRequest;
import com.lunchbox.dispatch.web.DispatchDtos.CreatePartnerRequest;
import com.lunchbox.dispatch.web.DispatchDtos.PartnerProfileRequest;
import com.lunchbox.users.ActivationPolicy;
import com.lunchbox.users.UserDirectory;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class PartnerService implements PartnerDirectory, ActivationPolicy {

    private final DeliveryPartnerRepository partners;
    private final UserDirectory users;
    private final PayoutAccountRegistrar payoutAccounts;
    private final AuditService audit;

    public PartnerService(DeliveryPartnerRepository partners, UserDirectory users, PayoutAccountRegistrar payoutAccounts,
                          AuditService audit) {
        this.partners = partners;
        this.users = users;
        this.payoutAccounts = payoutAccounts;
        this.audit = audit;
    }

    // ---- PartnerDirectory ----

    @Override
    @Transactional(readOnly = true)
    public Optional<PartnerInfo> find(UUID partnerId) {
        return partners.findById(partnerId).map(PartnerService::info);
    }

    @Override
    @Transactional(readOnly = true)
    public PartnerInfo require(UUID partnerId) {
        return find(partnerId).orElseThrow(() -> Errors.notFound("Partner"));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<PartnerInfo> findByUserId(UUID userId) {
        return partners.findByUserId(userId).map(PartnerService::info);
    }

    @Override
    @Transactional(readOnly = true)
    public PartnerInfo requireWorkingPartner(UUID userId) {
        DeliveryPartner p = partners.findByUserId(userId)
                .orElseThrow(() -> Errors.forbidden("This account is not a delivery partner."));
        if (!p.canWork()) {
            throw Errors.forbidden("Your partner account is not active. Contact LunchBox operations.");
        }
        return info(p);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, PartnerInfo> findAll(Collection<UUID> partnerIds) {
        if (partnerIds.isEmpty()) {
            return Map.of();
        }
        return partners.findByIdIn(partnerIds).stream().map(PartnerService::info)
                .collect(Collectors.toMap(PartnerInfo::id, Function.identity()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<PartnerInfo> payoutEligiblePartners() {
        return partners.findAll().stream()
                .filter(p -> p.getDeletedAt() == null && p.getPayoutFundAccountId() != null)
                .map(PartnerService::info).toList();
    }

    // ---- ActivationPolicy: only KYC-approved partners may sign in ----

    @Override
    public boolean supports(Role role) {
        return role == Role.PARTNER;
    }

    @Override
    @Transactional(readOnly = true)
    public void checkMayActivate(UUID userId) {
        requireWorkingPartner(userId);
    }

    // ---- Admin ----

    @Transactional(readOnly = true)
    public PageResponse<AdminPartnerResponse> search(String q, DeliveryPartner.KycStatus kyc, Integer page, Integer size) {
        return PageResponse.of(partners.search(q == null || q.isBlank() ? null : q.trim(), kyc,
                Pagination.of(page, size, Sort.by("firstName"))), this::toAdmin);
    }

    @Transactional(readOnly = true)
    public AdminPartnerResponse get(UUID partnerId) {
        return toAdmin(partners.findById(partnerId).orElseThrow(() -> Errors.notFound("Partner")));
    }

    @Transactional
    public AdminPartnerResponse create(CreatePartnerRequest request) {
        PartnerProfileRequest pr = request.profile();
        String name = pr.lastName() == null ? pr.firstName() : pr.firstName() + " " + pr.lastName();
        UUID userId = users.provisionPartnerUser(request.phone(), name);
        DeliveryPartner partner = new DeliveryPartner(userId);
        apply(partner, pr);
        partner = partners.save(partner);
        AdminPartnerResponse response = toAdmin(partner);
        audit.record("partner.created", "Partner", partner.getId(), null, auditView(partner));
        return response;
    }

    @Transactional
    public AdminPartnerResponse update(UUID partnerId, PartnerProfileRequest request) {
        DeliveryPartner partner = partners.findById(partnerId).orElseThrow(() -> Errors.notFound("Partner"));
        Map<String, Object> before = auditView(partner);
        apply(partner, request);
        audit.record("partner.updated", "Partner", partnerId, before, auditView(partner));
        return toAdmin(partner);
    }

    @Transactional
    public AdminPartnerResponse setActive(UUID partnerId, boolean active) {
        DeliveryPartner partner = partners.findById(partnerId).orElseThrow(() -> Errors.notFound("Partner"));
        partner.setActive(active);
        if (active) {
            users.reactivateUser(partner.getUserId());
        } else {
            users.suspendUser(partner.getUserId());
        }
        audit.record(active ? "partner.activated" : "partner.deactivated", "Partner", partnerId, null,
                Map.of("active", active));
        return toAdmin(partner);
    }

    @Transactional
    public AdminPartnerResponse linkBankAccount(UUID partnerId, BankAccountRequest request) {
        DeliveryPartner partner = partners.findById(partnerId).orElseThrow(() -> Errors.notFound("Partner"));
        String phone = users.requireUser(partner.getUserId()).phone();
        PayoutAccountRegistrar.Registered registered = payoutAccounts.register(partnerId,
                partner.getFirstName() + (partner.getLastName() == null ? "" : " " + partner.getLastName()), phone,
                request.accountHolder(), request.accountNumber(), request.ifsc());
        partner.setBankAccount(request.accountHolder(), request.accountNumber(), request.ifsc(), registered.contactId(),
                registered.fundAccountId());
        String last4 = request.accountNumber().substring(request.accountNumber().length() - 4);
        audit.record("partner.bank_linked", "Partner", partnerId, null, Map.of("accountLast4", last4, "ifsc", request.ifsc()));
        return toAdmin(partner);
    }

    @Transactional
    public void recordRating(UUID partnerId, int stars) {
        if (stars < 1 || stars > 5) {
            throw Errors.badRequest("invalid_rating", "Rating must be between 1 and 5.");
        }
        partners.findForUpdate(partnerId).ifPresent(p -> p.addRating(stars));
    }

    private static void apply(DeliveryPartner p, PartnerProfileRequest r) {
        p.updateProfile(r.firstName().trim(), r.lastName() == null ? null : r.lastName().trim(), r.vehicleType(),
                r.vehicleNumber(), r.capacity(), Geo.point(r.homeZone()), r.serviceRadiusM());
    }

    static PartnerInfo info(DeliveryPartner p) {
        return new PartnerInfo(p.getId(), p.getUserId(), p.getFirstName(), p.getLastName(), p.getVehicleType(),
                p.getVehicleNumber(), p.getCapacity(), p.getHomeZone(), p.getServiceRadiusM(), p.getKycStatus(),
                p.isActive(), p.getRating(), p.getPhotoKey(), p.getPayoutFundAccountId());
    }

    private AdminPartnerResponse toAdmin(DeliveryPartner p) {
        String phone = users.findUser(p.getUserId()).map(UserDirectory.UserSummary::phone).orElse(null);
        return new AdminPartnerResponse(p.getId(), p.getUserId(), p.getFirstName(), p.getLastName(), phone,
                p.getVehicleType(), p.getVehicleNumber(), p.getCapacity(), Geo.toGeoPoint(p.getHomeZone()),
                p.getServiceRadiusM(), p.getKycStatus(), p.getKycNotes(), p.getRating(), p.getRatingCount(), p.isActive(),
                p.getPayoutFundAccountId() != null, p.getCreatedAt());
    }

    private static Map<String, Object> auditView(DeliveryPartner p) {
        return Map.of("vehicleType", p.getVehicleType().name(), "capacity", p.getCapacity(),
                "serviceRadiusM", p.getServiceRadiusM(), "active", p.isActive());
    }
}
