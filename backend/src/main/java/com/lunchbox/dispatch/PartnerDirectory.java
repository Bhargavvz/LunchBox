package com.lunchbox.dispatch;

import org.locationtech.jts.geom.Point;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Public API of the dispatch module for partner lookups. */
public interface PartnerDirectory {

    Optional<PartnerInfo> find(UUID partnerId);

    PartnerInfo require(UUID partnerId);

    Optional<PartnerInfo> findByUserId(UUID userId);

    /** The working partner for this user (active and KYC-approved), or 403. */
    PartnerInfo requireWorkingPartner(UUID userId);

    Map<UUID, PartnerInfo> findAll(Collection<UUID> partnerIds);

    List<PartnerInfo> payoutEligiblePartners();

    record PartnerInfo(
            UUID id,
            UUID userId,
            String firstName,
            String lastName,
            DeliveryPartner.VehicleType vehicleType,
            String vehicleNumber,
            int capacity,
            Point homeZone,
            int serviceRadiusM,
            DeliveryPartner.KycStatus kycStatus,
            boolean active,
            BigDecimal rating,
            String photoKey,
            String payoutFundAccountId) {

        public String displayName() {
            return lastName == null ? firstName : firstName + " " + lastName;
        }
    }
}
