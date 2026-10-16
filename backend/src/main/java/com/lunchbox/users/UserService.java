package com.lunchbox.users;

import com.lunchbox.audit.AuditService;
import com.lunchbox.auth.IdentityProvider;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.security.Role;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class UserService implements UserDirectory {

    private final UserRepository users;
    private final ParentRepository parents;
    private final ConsentRepository consents;
    private final IdentityProvider identityProvider;
    private final AuditService audit;
    private final Clock clock;

    public UserService(UserRepository users, ParentRepository parents, ConsentRepository consents,
                       IdentityProvider identityProvider, AuditService audit, Clock clock) {
        this.users = users;
        this.parents = parents;
        this.consents = consents;
        this.identityProvider = identityProvider;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AuthPrincipal> findPrincipal(String firebaseUid) {
        return users.findByFirebaseUid(firebaseUid)
                .filter(u -> !u.isDeleted())
                .map(u -> new AuthPrincipal(u.getId(), u.getRole(), u.getStatus(), u.getSchoolId(), u.getPhone(), u.getEmail()));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UserSummary> findUser(UUID userId) {
        return users.findById(userId).map(UserService::summary);
    }

    @Override
    @Transactional(readOnly = true)
    public UserSummary requireUser(UUID userId) {
        return findUser(userId).orElseThrow(() -> Errors.notFound("User"));
    }

    @Override
    @Transactional(readOnly = true)
    public UUID requireParentId(UUID userId) {
        return parents.findByUserId(userId).map(Parent::getId)
                .orElseThrow(() -> Errors.forbidden("Only registered parents can do this."));
    }

    @Override
    @Transactional(readOnly = true)
    public ParentInfo requireParent(UUID parentId) {
        Parent p = parents.findById(parentId).orElseThrow(() -> Errors.notFound("Parent"));
        User u = users.findById(p.getUserId()).orElseThrow(() -> Errors.notFound("User"));
        return new ParentInfo(p.getId(), u.getId(), p.getFirstName(), p.getLastName(), u.getPhone(), u.getPreferredLanguage());
    }

    @Override
    @Transactional(readOnly = true)
    public List<UUID> activeUserIdsByRole(Role role) {
        return users.findActiveIdsByRole(role);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UUID> userIdsForParents(java.util.Collection<UUID> parentIds) {
        if (parentIds.isEmpty()) {
            return List.of();
        }
        return parents.findAllById(parentIds).stream().map(Parent::getUserId).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public boolean hasActiveConsent(UUID userId, ConsentPurpose purpose) {
        return consents.findFirstByUserIdAndPurposeOrderByCreatedAtDesc(userId, purpose)
                .map(Consent::isActive).orElse(false);
    }

    @Override
    @Transactional
    public UUID provisionPartnerUser(String phone, String displayName) {
        users.findByPhoneAndDeletedAtIsNull(phone).ifPresent(u -> {
            throw Errors.conflict("phone_in_use", "This phone number already belongs to an account.");
        });
        User user = users.save(User.provisioned(Role.PARTNER, phone, null, displayName, null));
        audit.record("user.provisioned", "User", user.getId(), null, Map.of("role", Role.PARTNER.name()));
        return user.getId();
    }

    @Override
    @Transactional
    public void suspendUser(UUID userId) {
        User user = users.findById(userId).orElseThrow(() -> Errors.notFound("User"));
        String before = user.getStatus().name();
        user.suspend();
        if (user.getFirebaseUid() != null) {
            identityProvider.revokeSessions(user.getFirebaseUid());
        }
        audit.record("user.suspended", "User", userId, Map.of("status", before), Map.of("status", user.getStatus().name()));
    }

    @Override
    @Transactional
    public void reactivateUser(UUID userId) {
        User user = users.findById(userId).orElseThrow(() -> Errors.notFound("User"));
        String before = user.getStatus().name();
        user.reactivate();
        audit.record("user.reactivated", "User", userId, Map.of("status", before), Map.of("status", user.getStatus().name()));
    }

    @Transactional
    public void touchLogin(UUID userId) {
        users.findById(userId).ifPresent(u -> u.touchLogin(clock.instant()));
    }

    static UserSummary summary(User u) {
        return new UserSummary(u.getId(), u.getRole(), u.getStatus(), u.getPhone(), u.getEmail(), u.getDisplayName(),
                u.getPreferredLanguage(), u.getSchoolId());
    }
}
