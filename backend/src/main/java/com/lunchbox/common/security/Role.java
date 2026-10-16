package com.lunchbox.common.security;

public enum Role {
    PARENT,
    PARTNER,
    SUPER_ADMIN,
    OPS_ADMIN,
    SUPPORT,
    SCHOOL_ADMIN;

    public boolean isAdmin() {
        return this == SUPER_ADMIN || this == OPS_ADMIN || this == SUPPORT || this == SCHOOL_ADMIN;
    }

    /** Platform-wide staff (excludes school admins who are scoped to one school). */
    public boolean isPlatformStaff() {
        return this == SUPER_ADMIN || this == OPS_ADMIN || this == SUPPORT;
    }

    public String authority() {
        return "ROLE_" + name();
    }
}
