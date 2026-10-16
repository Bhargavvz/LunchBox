package com.lunchbox.children;

import com.lunchbox.common.crypto.EncryptedStringConverter;
import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "children")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Child extends BaseEntity {

    @Column(name = "parent_id", nullable = false, updatable = false)
    private UUID parentId;

    @Column(name = "school_id", nullable = false)
    private UUID schoolId;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name")
    private String lastName;

    @Column(name = "class_name", nullable = false)
    private String className;

    private String section;

    @Column(name = "roll_number")
    private String rollNumber;

    /** Health information: encrypted at rest, visible only to the parent and platform staff. */
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "allergies_note", columnDefinition = "text")
    private String allergiesNote;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    Child(UUID parentId) {
        this.parentId = parentId;
    }

    void update(UUID schoolId, String firstName, String lastName, String className, String section, String rollNumber,
                String allergiesNote) {
        this.schoolId = schoolId;
        this.firstName = firstName;
        this.lastName = lastName;
        this.className = className;
        this.section = section;
        this.rollNumber = rollNumber;
        this.allergiesNote = allergiesNote;
    }

    void softDelete(Instant at) {
        this.deletedAt = at;
    }

    /** DPDP erasure. Orders keep a reference to this row; the row no longer identifies the child. */
    void anonymise(Instant at) {
        this.firstName = "Deleted";
        this.lastName = null;
        this.rollNumber = null;
        this.section = null;
        this.allergiesNote = null;
        this.deletedAt = deletedAt == null ? at : deletedAt;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }
}
