package com.lunchbox.users;

import com.lunchbox.audit.AuditService;
import com.lunchbox.auth.IdentityProvider;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.privacy.PersonalDataContributor;
import com.lunchbox.common.security.Role;
import com.lunchbox.users.web.UserDtos.DataExportResponse;
import com.lunchbox.users.web.UserDtos.MeResponse;
import com.lunchbox.users.web.UserDtos.PhotoUploadResponse;
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
    private final ProfilePhotoService photos;

    public AccountService(UserRepository users, ParentRepository parents, RegistrationService registration,
                          List<PersonalDataContributor> contributors, IdentityProvider identityProvider,
                          AuditService audit, Clock clock, ProfilePhotoService photos) {
        this.photos = photos;
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
        if (request.email() != null) {
            String email = request.email().trim();
            if (!email.isEmpty()) {
                users.findByEmailIgnoreCaseAndDeletedAtIsNull(email).filter(other -> !other.getId().equals(userId))
                        .ifPresent(other -> {
                            throw Errors.conflict("email_in_use", "This email is already used by another account.");
                        });
            }
            user.changeEmail(email);
        }
        audit.record("user.profile_updated", "User", userId, null,
                Map.of("preferredLanguage", user.getPreferredLanguage(), "emailSet", user.getEmail() != null));
        return registration.toMe(user);
    }

    /** A signed PUT for a new profile photo; the photo only takes effect after {@link #setPhoto}. */
    @Transactional(readOnly = true)
    public PhotoUploadResponse photoUploadUrl(UUID userId) {
        users.findById(userId).orElseThrow(() -> Errors.notFound("User"));
        var upload = photos.uploadUrl(userId);
        return new PhotoUploadResponse(upload.url(), upload.key(), upload.method(), upload.headers(), upload.expiresAt());
    }

    @Transactional
    public MeResponse setPhoto(UUID userId, String key) {
        User user = users.findById(userId).orElseThrow(() -> Errors.notFound("User"));
        photos.verify(userId, key);
        String previous = user.getPhotoKey();
        user.setPhoto(key);
        audit.record("user.photo_updated", "User", userId, null, Map.of("photo", "set"));
        if (previous != null && !previous.equals(key)) {
            RegistrationService.afterCommit(() -> photos.deleteQuietly(previous));
        }
        return registration.toMe(user);
    }

    @Transactional
    public MeResponse removePhoto(UUID userId) {
        User user = users.findById(userId).orElseThrow(() -> Errors.notFound("User"));
        String previous = user.getPhotoKey();
        user.setPhoto(null);
        if (previous != null) {
            audit.record("user.photo_updated", "User", userId, null, Map.of("photo", "removed"));
            RegistrationService.afterCommit(() -> photos.deleteQuietly(previous));
        }
        return registration.toMe(user);
    }

    /**
     * Adopts the phone number on the caller's verified token. The app re-verifies the new number with an OTP and
     * links it to the Firebase account first, so this never trusts a number typed into a form.
     */
    @Transactional
    public MeResponse syncPhone(UUID userId, String verifiedPhone) {
        if (verifiedPhone == null || verifiedPhone.isBlank()) {
            throw Errors.badRequest("phone_not_verified", "Verify the new number with the code we send, then try again.");
        }
        User user = users.findById(userId).orElseThrow(() -> Errors.notFound("User"));
        if (verifiedPhone.equals(user.getPhone())) {
            return registration.toMe(user);
        }
        users.findByPhoneAndDeletedAtIsNull(verifiedPhone).filter(other -> !other.getId().equals(userId))
                .ifPresent(other -> {
                    throw Errors.conflict("phone_in_use", "This phone number already belongs to another account.");
                });
        user.changePhone(verifiedPhone);
        audit.record("user.phone_changed", "User", userId, null, Map.of("phone", "changed"));
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
        String photo = user.getPhotoKey();
        user.anonymise(clock.instant());
        RegistrationService.afterCommit(() -> photos.deleteQuietly(photo));
        audit.record("account.deleted", "User", userId, null, Map.of("status", "DELETED"));
        if (firebaseUid != null) {
            RegistrationService.afterCommit(() -> {
                identityProvider.revokeSessions(firebaseUid);
                identityProvider.deleteUser(firebaseUid);
            });
        }
    }
}
