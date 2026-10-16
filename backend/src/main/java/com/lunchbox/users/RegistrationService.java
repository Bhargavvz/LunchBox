package com.lunchbox.users;

import com.lunchbox.audit.AuditService;
import com.lunchbox.auth.IdentityProvider;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Role;
import com.lunchbox.users.web.UserDtos.ConsentInput;
import com.lunchbox.users.web.UserDtos.MeResponse;
import com.lunchbox.users.web.UserDtos.ParentProfileResponse;
import com.lunchbox.users.web.UserDtos.RegisterParentRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
public class RegistrationService {

    private final UserRepository users;
    private final ParentRepository parents;
    private final ConsentService consentService;
    private final IdentityProvider identityProvider;
    private final List<ActivationPolicy> activationPolicies;
    private final AuditService audit;
    private final Clock clock;

    public RegistrationService(UserRepository users, ParentRepository parents, ConsentService consentService,
                               IdentityProvider identityProvider, List<ActivationPolicy> activationPolicies,
                               AuditService audit, Clock clock) {
        this.users = users;
        this.parents = parents;
        this.consentService = consentService;
        this.identityProvider = identityProvider;
        this.activationPolicies = activationPolicies;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * Returns the caller's profile. For a Firebase user without a LunchBox account, links a pre-provisioned
     * partner (matched by verified phone) or staff account (matched by verified email) if one exists.
     */
    @Transactional
    public MeResponse me(CurrentUser caller, boolean emailVerified) {
        if (caller.registered()) {
            User user = users.findById(caller.userId()).orElseThrow(() -> Errors.notFound("User"));
            user.touchLogin(clock.instant());
            return toMe(user);
        }
        Optional<User> provisioned = findProvisioned(caller, emailVerified);
        if (provisioned.isEmpty()) {
            return new MeResponse(false, null, null, null, null, caller.phone(), caller.email(), null, "en", null, List.of());
        }
        User user = provisioned.get();
        activationPolicies.stream().filter(p -> p.supports(user.getRole())).forEach(p -> p.checkMayActivate(user.getId()));
        user.linkFirebase(caller.firebaseUid());
        user.touchLogin(clock.instant());
        audit.record("user.linked", "User", user.getId(), null, Map.of("role", user.getRole().name()));
        afterCommit(() -> identityProvider.setClaims(caller.firebaseUid(), user.getRole(), user.getId(), user.getSchoolId()));
        return toMe(user);
    }

    @Transactional
    public MeResponse registerParent(CurrentUser caller, RegisterParentRequest request) {
        if (caller.registered()) {
            throw Errors.conflict("already_registered", "This account is already registered.");
        }
        if (caller.phone() == null) {
            throw Errors.badRequest("phone_required", "Sign in with your mobile number to register as a parent.");
        }
        boolean serviceConsent = request.consents().stream()
                .anyMatch(c -> c.purpose() == ConsentPurpose.ACCOUNT_AND_SERVICE && c.granted());
        if (!serviceConsent) {
            throw Errors.unprocessable("consent_required", "You must accept the terms and privacy policy to continue.");
        }
        users.findByPhoneAndDeletedAtIsNull(caller.phone()).ifPresent(u -> {
            throw Errors.conflict("phone_in_use", "This phone number already belongs to another account.");
        });
        String displayName = request.lastName() == null ? request.firstName() : request.firstName() + " " + request.lastName();
        User user = users.save(User.registered(caller.firebaseUid(), Role.PARENT, caller.phone(), caller.email(),
                displayName, request.preferredLanguage()));
        parents.save(new Parent(user.getId(), request.firstName(), request.lastName()));
        for (ConsentInput consent : request.consents()) {
            consentService.record(user.getId(), consent.purpose(), consent.granted(), request.policyVersion());
        }
        audit.record("parent.registered", "User", user.getId(), null, Map.of("role", "PARENT"));
        afterCommit(() -> identityProvider.setClaims(caller.firebaseUid(), Role.PARENT, user.getId(), null));
        return toMe(user);
    }

    private Optional<User> findProvisioned(CurrentUser caller, boolean emailVerified) {
        if (caller.phone() != null) {
            Optional<User> byPhone = users.findByPhoneAndDeletedAtIsNull(caller.phone())
                    .filter(u -> u.getFirebaseUid() == null && u.getStatus() == UserStatus.PENDING);
            if (byPhone.isPresent()) {
                return byPhone;
            }
        }
        if (caller.email() != null && emailVerified) {
            return users.findByEmailIgnoreCaseAndDeletedAtIsNull(caller.email())
                    .filter(u -> u.getFirebaseUid() == null && u.getStatus() == UserStatus.PENDING && u.getRole().isAdmin());
        }
        return Optional.empty();
    }

    @Transactional(readOnly = true)
    public MeResponse toMe(User user) {
        ParentProfileResponse parent = user.getRole() == Role.PARENT
                ? parents.findByUserId(user.getId()).map(p -> new ParentProfileResponse(p.getId(), p.getFirstName(), p.getLastName())).orElse(null)
                : null;
        return new MeResponse(true, user.getId(), user.getRole(), user.getStatus(), user.getDisplayName(), user.getPhone(),
                user.getEmail(), user.getSchoolId(), user.getPreferredLanguage(), parent, consentService.list(user.getId()));
    }

    static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        action.run();
                    } catch (RuntimeException e) {
                        log.error("Post-commit identity provider call failed", e);
                    }
                }
            });
        } else {
            action.run();
        }
    }
}
