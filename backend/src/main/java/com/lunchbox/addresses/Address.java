package com.lunchbox.addresses;

import com.lunchbox.common.crypto.EncryptedStringConverter;
import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "addresses")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Address extends BaseEntity {

    @Column(name = "parent_id", nullable = false, updatable = false)
    private UUID parentId;

    @Column(nullable = false)
    private String label;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(nullable = false, columnDefinition = "text")
    private String line1;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(columnDefinition = "text")
    private String line2;

    private String landmark;

    @Column(nullable = false)
    private String city;

    @Column(nullable = false)
    private String pincode;

    @Column(nullable = false, columnDefinition = "geometry(Point,4326)")
    private Point location;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(columnDefinition = "text")
    private String instructions;

    @Column(name = "is_default", nullable = false)
    private boolean defaultAddress;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    Address(UUID parentId) {
        this.parentId = parentId;
    }

    void update(String label, String line1, String line2, String landmark, String city, String pincode, Point location,
                String instructions) {
        this.label = label;
        this.line1 = line1;
        this.line2 = line2;
        this.landmark = landmark;
        this.city = city;
        this.pincode = pincode;
        this.location = location;
        this.instructions = instructions;
    }

    void markDefault(boolean value) {
        this.defaultAddress = value;
    }

    void softDelete(Instant at) {
        this.deletedAt = at;
        this.defaultAddress = false;
    }

    void anonymise(Instant at) {
        this.line1 = "Deleted";
        this.line2 = null;
        this.landmark = null;
        this.instructions = null;
        this.label = "Deleted";
        softDelete(deletedAt == null ? at : deletedAt);
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }
}
