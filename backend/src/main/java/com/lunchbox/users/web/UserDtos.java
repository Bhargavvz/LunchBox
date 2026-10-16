package com.lunchbox.users.web;

import com.lunchbox.common.security.Role;
import com.lunchbox.users.ConsentPurpose;
import com.lunchbox.users.UserStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class UserDtos {

    public static final String LANGUAGE_PATTERN = "^(en|hi)$";

    private UserDtos() {
    }

    public record ConsentInput(@NotNull ConsentPurpose purpose, boolean granted) {
    }

    public record RegisterParentRequest(
            @NotBlank @Size(max = 80) String firstName,
            @Size(max = 80) String lastName,
            @Pattern(regexp = LANGUAGE_PATTERN) String preferredLanguage,
            @NotBlank @Size(max = 20) String policyVersion,
            @NotEmpty List<@Valid ConsentInput> consents) {
    }

    public record UpdateProfileRequest(
            @Size(min = 1, max = 80) String firstName,
            @Size(max = 80) String lastName,
            @Pattern(regexp = LANGUAGE_PATTERN) String preferredLanguage) {
    }

    public record RecordConsentRequest(
            @NotNull ConsentPurpose purpose,
            boolean granted,
            @NotBlank @Size(max = 20) String policyVersion) {
    }

    public record ConsentResponse(UUID id, ConsentPurpose purpose, String policyVersion, boolean granted,
                                  Instant grantedAt, Instant withdrawnAt) {
    }

    public record ParentProfileResponse(UUID parentId, String firstName, String lastName) {
    }

    public record MeResponse(
            boolean registered,
            UUID userId,
            Role role,
            UserStatus status,
            String displayName,
            String phone,
            String email,
            UUID schoolId,
            String preferredLanguage,
            ParentProfileResponse parent,
            List<ConsentResponse> consents) {
    }

    public record DataExportResponse(Instant generatedAt, UUID userId, Map<String, Object> sections) {
    }

    public record AdminParentResponse(UUID parentId, UUID userId, String firstName, String lastName, String phone,
                                      UserStatus status, Instant createdAt) {
    }

    public record StaffResponse(UUID userId, String email, String displayName, Role role, UserStatus status,
                                UUID schoolId, Instant lastLoginAt) {
    }

    public record CreateStaffRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 120) String displayName,
            @NotNull Role role,
            UUID schoolId) {
    }

    public enum StatusAction { SUSPEND, REACTIVATE }

    public record ChangeStatusRequest(@NotNull StatusAction action) {
    }
}
