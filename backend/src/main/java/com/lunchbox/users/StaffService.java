package com.lunchbox.users;

import com.lunchbox.audit.AuditService;
import com.lunchbox.auth.IdentityProvider;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.security.Role;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.users.web.UserDtos.AdminParentResponse;
import com.lunchbox.users.web.UserDtos.CreateStaffRequest;
import com.lunchbox.users.web.UserDtos.StaffResponse;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;

/** Admin-side management of parents and staff accounts. */
@Service
public class StaffService {

    private final UserRepository users;
    private final ParentRepository parents;
    private final IdentityProvider identityProvider;
    private final AuditService audit;

    public StaffService(UserRepository users, ParentRepository parents, IdentityProvider identityProvider,
                        AuditService audit) {
        this.users = users;
        this.parents = parents;
        this.identityProvider = identityProvider;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminParentResponse> searchParents(String q, Integer page, Integer size) {
        return PageResponse.of(parents.search(blankToNull(q), Pagination.of(page, size, Sort.unsorted())), p -> {
            User u = users.findById(p.getUserId()).orElseThrow();
            return new AdminParentResponse(p.getId(), u.getId(), p.getFirstName(), p.getLastName(), u.getPhone(),
                    u.getStatus(), p.getCreatedAt());
        });
    }

    @Transactional(readOnly = true)
    public PageResponse<StaffResponse> searchStaff(String q, Integer page, Integer size) {
        var roles = EnumSet.of(Role.SUPER_ADMIN, Role.OPS_ADMIN, Role.SUPPORT, Role.SCHOOL_ADMIN);
        return PageResponse.of(users.searchStaff(roles, blankToNull(q), Pagination.of(page, size, Sort.by("createdAt").descending())),
                StaffService::toStaff);
    }

    /**
     * Staff sign in with email + MFA in Firebase. A super admin pre-provisions the LunchBox account; it is linked on
     * first sign-in with a verified email. If the Firebase user already exists, claims are set immediately.
     */
    @Transactional
    public StaffResponse createStaff(CreateStaffRequest request) {
        if (!request.role().isAdmin()) {
            throw Errors.badRequest("invalid_role", "Staff accounts must have an admin role.");
        }
        if (request.role() == Role.SCHOOL_ADMIN && request.schoolId() == null) {
            throw Errors.badRequest("school_required", "A school admin must be linked to a school.");
        }
        users.findByEmailIgnoreCaseAndDeletedAtIsNull(request.email()).ifPresent(u -> {
            throw Errors.conflict("email_in_use", "A user with this email already exists.");
        });
        User user = User.provisioned(request.role(), null, request.email(), request.displayName(),
                request.role() == Role.SCHOOL_ADMIN ? request.schoolId() : null);
        identityProvider.findByEmail(request.email())
                .filter(IdentityProvider.IdpUser::emailVerified)
                .ifPresent(idp -> user.linkFirebase(idp.uid()));
        User saved = users.save(user);
        if (saved.getFirebaseUid() != null) {
            String uid = saved.getFirebaseUid();
            RegistrationService.afterCommit(() -> identityProvider.setClaims(uid, saved.getRole(), saved.getId(), saved.getSchoolId()));
        }
        audit.record("staff.created", "User", saved.getId(), null,
                Map.of("role", saved.getRole().name(), "email", saved.getEmail()));
        return toStaff(saved);
    }

    @Transactional
    public StaffResponse changeRole(UUID userId, Role role, UUID schoolId) {
        User user = users.findById(userId).orElseThrow(() -> Errors.notFound("User"));
        if (!user.getRole().isAdmin() || !role.isAdmin()) {
            throw Errors.badRequest("invalid_role", "Only staff roles can be changed here.");
        }
        Role before = user.getRole();
        user.changeRole(role, role == Role.SCHOOL_ADMIN ? schoolId : null);
        if (user.getFirebaseUid() != null) {
            String uid = user.getFirebaseUid();
            RegistrationService.afterCommit(() -> {
                identityProvider.setClaims(uid, role, user.getId(), user.getSchoolId());
                identityProvider.revokeSessions(uid);
            });
        }
        audit.record("staff.role_changed", "User", userId, Map.of("role", before.name()), Map.of("role", role.name()));
        return toStaff(user);
    }

    private static StaffResponse toStaff(User u) {
        return new StaffResponse(u.getId(), u.getEmail(), u.getDisplayName(), u.getRole(), u.getStatus(), u.getSchoolId(),
                u.getLastLoginAt());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
