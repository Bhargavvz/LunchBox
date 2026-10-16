package com.lunchbox.children.web;

import com.lunchbox.common.web.Validation;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class ChildDtos {

    private ChildDtos() {
    }

    public record ChildRequest(
            @NotNull UUID schoolId,
            @NotBlank @Pattern(regexp = Validation.PERSON_NAME) String firstName,
            @Pattern(regexp = Validation.PERSON_NAME) String lastName,
            @NotBlank @Size(max = 20) String className,
            @Size(max = 10) String section,
            @Size(max = 20) @Pattern(regexp = "^[A-Za-z0-9/-]*$") String rollNumber,
            @Size(max = 1000) String allergiesNote) {
    }

    public record ChildResponse(
            UUID id,
            UUID schoolId,
            String schoolName,
            String firstName,
            String lastName,
            String className,
            String section,
            String rollNumber,
            String allergiesNote,
            Instant createdAt) {
    }

    public record AdminChildResponse(
            UUID id,
            UUID parentId,
            UUID schoolId,
            String schoolName,
            String firstName,
            String lastName,
            String className,
            String section,
            String rollNumber,
            Instant createdAt) {
    }
}
