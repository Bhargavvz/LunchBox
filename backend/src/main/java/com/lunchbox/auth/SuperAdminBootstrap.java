package com.lunchbox.auth;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.users.StaffService;
import com.lunchbox.users.web.UserDtos.CreateStaffRequest;
import com.lunchbox.common.security.Role;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Creates the very first SUPER_ADMIN (pending, linked on first verified sign-in) when
 * {@code lunchbox.bootstrap.super-admin-email} is set and no super admin exists yet.
 */
@Slf4j
@Component
public class SuperAdminBootstrap {

    private final LunchBoxProperties properties;
    private final StaffService staff;
    private final JdbcTemplate jdbc;

    public SuperAdminBootstrap(LunchBoxProperties properties, StaffService staff, JdbcTemplate jdbc) {
        this.properties = properties;
        this.staff = staff;
        this.jdbc = jdbc;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void bootstrap() {
        String email = properties.bootstrap() == null ? null : properties.bootstrap().superAdminEmail();
        if (email == null || email.isBlank()) {
            return;
        }
        Integer existing = jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE role = 'SUPER_ADMIN' AND deleted_at IS NULL", Integer.class);
        if (existing != null && existing > 0) {
            return;
        }
        staff.createStaff(new CreateStaffRequest(email, "Super Admin", Role.SUPER_ADMIN, null));
        log.info("Provisioned initial SUPER_ADMIN account for {}", email);
    }
}
