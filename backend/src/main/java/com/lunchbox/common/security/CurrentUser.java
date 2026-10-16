package com.lunchbox.common.security;

import com.lunchbox.common.error.Errors;

import java.util.UUID;

/**
 * The authenticated caller. {@code userId} and {@code role} are null for a Firebase user that has
 * not yet completed registration in LunchBox.
 */
public record CurrentUser(UUID userId, String firebaseUid, Role role, UUID schoolId, String phone, String email) {

    public boolean registered() {
        return userId != null && role != null;
    }

    public boolean is(Role r) {
        return role == r;
    }

    public boolean isAdmin() {
        return role != null && role.isAdmin();
    }

    public boolean isPlatformStaff() {
        return role != null && role.isPlatformStaff();
    }

    public UUID requireUserId() {
        if (userId == null) {
            throw Errors.forbidden("Complete registration first.");
        }
        return userId;
    }
}
