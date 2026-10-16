package com.lunchbox.users;

import com.lunchbox.audit.AuditService;
import com.lunchbox.auth.IdentityProvider;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.privacy.PersonalDataContributor;
import com.lunchbox.common.security.Role;
import com.lunchbox.users.web.UserDtos.DataExportResponse;
import com.lunchbox.users.web.UserDtos.MeResponse;
import com.lunchbox.users.web.UserDtos.UpdateProfileRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AccountService {

    private final UserRepository users;
    private final ParentRepository parents;
    private final RegistrationService registration;
    private final List<PersonalDataContributor> contributors;
    private final IdentityProvider identityProvider;
    private final AuditService audit;
    private final Clock clock;

    public AccountService(UserRepository users, ParentRepository parents, RegistrationService registration,
                          List<PersonalDataContributor> contributors, IdentityProvider identityProvider,
                          AuditService audit, Clock clock) {
        this.users = users;
        this.parents = parents;
        this.registration = registration;
        this.contributors = contributors;
        this.identityProvider = identityProvider;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public MeResponse updateProfile(UUID userId, UpdateProfileRequest request) {
        User user = users.findById(userId).orElseThrow(() -> Errors.notFound("User"));
        if (user.getRole() == Role.PARENT && (request.firstName() != null || request.lastName() != null)) {
            Parent parent = parents.findByUserId(userId).orElseThrow(() -> Errors.notFound("Parent"));
            String first = request.firstName() != null ? request.firstName() : parent.getFirstName();
            String last = request.lastName() != null ? request.lastName() : parent.getLastName();
            parent.rename(first, last);
            user.updateProfile(last == null ? first : first + " " + last, request.preferredLanguage());
        } else {
            user.updateProfile(null, request.preferredLanguage());
        }
        audit.record("user.profile_updated", "User", userId, null,
                Map.of("preferredLanguage", user.getPreferredLanguage()));
        return registration.toMe(user);
    }

    @Transactional
    public DataExportResponse export(UUID userId) {
        Map<String, Object> sections = new LinkedHashMap<>();
        contributors.stream()
                .sorted(Comparator.comparingInt(PersonalDataContributor::order))
                .forEach(c -> sections.put(c.section(), c.export(userId)));
        audit.record("account.exported", "User", userId, null, Map.of("sections", sections.keySet()));
        return new DataExportResponse(clock.instant(), userId, sections);
    }

    /**
     * DPDP right to erasure. Every module erases or anonymises its data in one transaction; any module may veto
     * (e.g. a delivery in progress). The Firebase account is removed only after the commit succeeds.
     */
    @Transactional
    public void deleteAccount(UUID userId) {
        User user = users.findById(userId).orElseThrow(() -> Errors.notFound("User"));
        if (user.getRole() != Role.PARENT) {
            throw Errors.forbidden("Partner and staff accounts are closed by an administrator.");
        }
        contributors.stream()
                .sorted(Comparator.comparingInt(PersonalDataContributor::order))
                .forEach(c -> c.erase(userId));
        String firebaseUid = user.getFirebaseUid();
        user.anonymise(clock.instant());
        audit.record("account.deleted", "User", userId, null, Map.of("status", "DELETED"));
        if (firebaseUid != null) {
            RegistrationService.afterCommit(() -> {
                identityProvider.revokeSessions(firebaseUid);
                identityProvider.deleteUser(firebaseUid);
            });
        }
    }
}
