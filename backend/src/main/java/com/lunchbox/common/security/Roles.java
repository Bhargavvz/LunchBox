package com.lunchbox.common.security;

/** SpEL expressions for {@code @PreAuthorize}; compile-time constants so they can be used in annotations. */
public final class Roles {

    public static final String PARENT = "hasRole('PARENT')";
    public static final String PARTNER = "hasRole('PARTNER')";
    public static final String SUPER_ADMIN = "hasRole('SUPER_ADMIN')";
    /** Operations staff that may change data. */
    public static final String ADMIN_WRITE = "hasAnyRole('SUPER_ADMIN','OPS_ADMIN')";
    /** Platform staff that may read data (support is read-mostly). */
    public static final String ADMIN_READ = "hasAnyRole('SUPER_ADMIN','OPS_ADMIN','SUPPORT')";
    public static final String SCHOOL_ADMIN = "hasRole('SCHOOL_ADMIN')";
    public static final String REGISTERED = "hasAnyRole('PARENT','PARTNER','SUPER_ADMIN','OPS_ADMIN','SUPPORT','SCHOOL_ADMIN')";

    private Roles() {
    }
}
