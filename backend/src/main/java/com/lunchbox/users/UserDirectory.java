package com.lunchbox.users;

import com.lunchbox.common.security.Role;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Public API of the users module for other modules. */
public interface UserDirectory {

    Optional<AuthPrincipal> findPrincipal(String firebaseUid);

    Optional<UserSummary> findUser(UUID userId);

    UserSummary requireUser(UUID userId);

    /** Parent id for a parent user, or 403 if the user is not a registered parent. */
    UUID requireParentId(UUID userId);

    ParentInfo requireParent(UUID parentId);

    List<UUID> activeUserIdsByRole(Role role);

    /** User ids for the given parent ids (missing parents are skipped). */
    List<UUID> userIdsForParents(java.util.Collection<UUID> parentIds);

    boolean hasActiveConsent(UUID userId, ConsentPurpose purpose);

    /** Creates a PENDING user for a partner who will sign in with this phone number. */
    UUID provisionPartnerUser(String phone, String displayName);

    void suspendUser(UUID userId);

    void reactivateUser(UUID userId);

    record AuthPrincipal(UUID userId, Role role, UserStatus status, UUID schoolId, String phone, String email) {
    }

    record UserSummary(UUID id, Role role, UserStatus status, String phone, String email, String displayName,
                       String preferredLanguage, UUID schoolId) {
    }

    record ParentInfo(UUID parentId, UUID userId, String firstName, String lastName, String phone,
                      String preferredLanguage) {
    }
}
