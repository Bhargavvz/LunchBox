package com.lunchbox.users;

import com.lunchbox.common.persistence.BaseEntity;
import com.lunchbox.common.security.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "users")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User extends BaseEntity {

    @Column(name = "firebase_uid")
    private String firebaseUid;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    private String phone;

    private String email;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "school_id")
    private UUID schoolId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status;

    @Column(name = "preferred_language", nullable = false)
    private String preferredLanguage;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    public static User registered(String firebaseUid, Role role, String phone, String email, String displayName,
                                  String language) {
        User u = new User();
        u.firebaseUid = firebaseUid;
        u.role = role;
        u.phone = phone;
        u.email = email == null ? null : email.toLowerCase();
        u.displayName = displayName;
        u.status = UserStatus.ACTIVE;
        u.preferredLanguage = language == null ? "en" : language;
        return u;
    }

    /** A pre-provisioned account (partner or staff) that is linked to Firebase on first sign-in. */
    public static User provisioned(Role role, String phone, String email, String displayName, UUID schoolId) {
        User u = registered(null, role, phone, email, displayName, "en");
        u.status = UserStatus.PENDING;
        u.schoolId = schoolId;
        return u;
    }

    public void linkFirebase(String uid) {
        this.firebaseUid = uid;
        if (status == UserStatus.PENDING) {
            status = UserStatus.ACTIVE;
        }
    }

    public void touchLogin(Instant at) {
        this.lastLoginAt = at;
    }

    public void updateProfile(String displayName, String language) {
        if (displayName != null) {
            this.displayName = displayName;
        }
        if (language != null) {
            this.preferredLanguage = language;
        }
    }

    public void changeRole(Role role, UUID schoolId) {
        this.role = role;
        this.schoolId = schoolId;
    }

    public void suspend() {
        this.status = UserStatus.SUSPENDED;
    }

    public void reactivate() {
        this.status = firebaseUid == null ? UserStatus.PENDING : UserStatus.ACTIVE;
    }

    /** DPDP erasure: keep the row for referential integrity, drop every identifier. */
    public void anonymise(Instant at) {
        this.status = UserStatus.DELETED;
        this.deletedAt = at;
        this.phone = null;
        this.email = null;
        this.displayName = null;
        this.firebaseUid = null;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }
}
