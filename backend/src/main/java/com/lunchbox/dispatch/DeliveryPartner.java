package com.lunchbox.dispatch;

import com.lunchbox.common.crypto.EncryptedStringConverter;
import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.locationtech.jts.geom.Point;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "delivery_partners")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DeliveryPartner extends BaseEntity {

    public enum VehicleType { BICYCLE, SCOOTER, MOTORCYCLE, EV_SCOOTER, CAR }

    public enum KycStatus { NOT_STARTED, SUBMITTED, IN_REVIEW, APPROVED, REJECTED }

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name")
    private String lastName;

    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_type", nullable = false)
    private VehicleType vehicleType;

    @Column(name = "vehicle_number")
    private String vehicleNumber;

    @Column(nullable = false)
    private int capacity;

    @Column(name = "home_zone", nullable = false, columnDefinition = "geometry(Point,4326)")
    private Point homeZone;

    @Column(name = "service_radius_m", nullable = false)
    private int serviceRadiusM;

    @Enumerated(EnumType.STRING)
    @Column(name = "kyc_status", nullable = false)
    private KycStatus kycStatus = KycStatus.NOT_STARTED;

    @Column(name = "kyc_reviewed_by")
    private UUID kycReviewedBy;

    @Column(name = "kyc_reviewed_at")
    private Instant kycReviewedAt;

    @Column(name = "kyc_notes")
    private String kycNotes;

    private BigDecimal rating;

    @Column(name = "rating_count", nullable = false)
    private int ratingCount;

    @Column(name = "photo_key")
    private String photoKey;

    @Column(name = "bank_account_name")
    private String bankAccountName;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "bank_account_number", columnDefinition = "text")
    private String bankAccountNumber;

    @Column(name = "bank_ifsc")
    private String bankIfsc;

    @Column(name = "payout_contact_id")
    private String payoutContactId;

    @Column(name = "payout_fund_account_id")
    private String payoutFundAccountId;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    DeliveryPartner(UUID userId) {
        this.userId = userId;
    }

    void updateProfile(String firstName, String lastName, VehicleType vehicleType, String vehicleNumber, int capacity,
                       Point homeZone, int serviceRadiusM) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.vehicleType = vehicleType;
        this.vehicleNumber = vehicleNumber;
        this.capacity = capacity;
        this.homeZone = homeZone;
        this.serviceRadiusM = serviceRadiusM;
    }

    void kycSubmitted() {
        if (kycStatus == KycStatus.NOT_STARTED || kycStatus == KycStatus.REJECTED) {
            kycStatus = KycStatus.SUBMITTED;
        }
    }

    void kycInReview() {
        kycStatus = KycStatus.IN_REVIEW;
    }

    void kycDecision(boolean approved, UUID reviewer, String notes, Instant at) {
        this.kycStatus = approved ? KycStatus.APPROVED : KycStatus.REJECTED;
        this.kycReviewedBy = reviewer;
        this.kycNotes = notes;
        this.kycReviewedAt = at;
    }

    void setPhoto(String key) {
        this.photoKey = key;
    }

    void setBankAccount(String name, String number, String ifsc, String contactId, String fundAccountId) {
        this.bankAccountName = name;
        this.bankAccountNumber = number;
        this.bankIfsc = ifsc;
        this.payoutContactId = contactId;
        this.payoutFundAccountId = fundAccountId;
    }

    void setActive(boolean active) {
        this.active = active;
    }

    void addRating(int stars) {
        BigDecimal current = rating == null ? BigDecimal.ZERO : rating;
        BigDecimal total = current.multiply(BigDecimal.valueOf(ratingCount)).add(BigDecimal.valueOf(stars));
        ratingCount++;
        rating = total.divide(BigDecimal.valueOf(ratingCount), 2, RoundingMode.HALF_UP);
    }

    public boolean canWork() {
        return active && deletedAt == null && kycStatus == KycStatus.APPROVED;
    }
}
