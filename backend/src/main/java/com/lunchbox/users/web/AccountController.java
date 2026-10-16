package com.lunchbox.users.web;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.users.AccountService;
import com.lunchbox.users.ConsentService;
import com.lunchbox.users.web.UserDtos.ConsentResponse;
import com.lunchbox.users.web.UserDtos.DataExportResponse;
import com.lunchbox.users.web.UserDtos.MeResponse;
import com.lunchbox.users.web.UserDtos.RecordConsentRequest;
import com.lunchbox.users.web.UserDtos.UpdateProfileRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Account")
@RestController
@RequestMapping("/api/v1/me")
@PreAuthorize(Roles.REGISTERED)
public class AccountController {

    private final AccountService accounts;
    private final ConsentService consents;

    public AccountController(AccountService accounts, ConsentService consents) {
        this.accounts = accounts;
        this.consents = consents;
    }

    @PatchMapping
    @Operation(summary = "Update name or preferred language")
    public MeResponse update(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody UpdateProfileRequest request) {
        return accounts.updateProfile(user.requireUserId(), request);
    }

    @GetMapping("/consents")
    public List<ConsentResponse> listConsents(@AuthenticationPrincipal CurrentUser user) {
        return consents.list(user.requireUserId());
    }

    @PostMapping("/consents")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Grant or withdraw consent for a purpose (DPDP)")
    public ConsentResponse recordConsent(@AuthenticationPrincipal CurrentUser user,
                                         @Valid @RequestBody RecordConsentRequest request) {
        return consents.record(user.requireUserId(), request.purpose(), request.granted(), request.policyVersion());
    }

    @GetMapping("/export")
    @PreAuthorize(Roles.PARENT)
    @Operation(summary = "Download all personal data held about me (DPDP right to access)")
    public DataExportResponse export(@AuthenticationPrincipal CurrentUser user) {
        return accounts.export(user.requireUserId());
    }

    @DeleteMapping
    @PreAuthorize(Roles.PARENT)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete my account and erase personal data (DPDP right to erasure)")
    public void delete(@AuthenticationPrincipal CurrentUser user) {
        accounts.deleteAccount(user.requireUserId());
    }
}
