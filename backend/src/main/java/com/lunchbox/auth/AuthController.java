package com.lunchbox.auth;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.users.RegistrationService;
import com.lunchbox.users.web.UserDtos.MeResponse;
import com.lunchbox.users.web.UserDtos.RegisterParentRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Auth")
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final RegistrationService registration;
    private final PrincipalResolver principalResolver;

    public AuthController(RegistrationService registration, PrincipalResolver principalResolver) {
        this.registration = registration;
        this.principalResolver = principalResolver;
    }

    @GetMapping("/me")
    @Operation(summary = "Current user. Links a pre-provisioned partner/staff account on first sign-in.",
            description = "After a link (registered changes to true) the client must force-refresh its ID token to pick up role claims.")
    public MeResponse me(Authentication authentication) {
        CurrentUser user = (CurrentUser) authentication.getPrincipal();
        VerifiedToken token = (VerifiedToken) authentication.getDetails();
        MeResponse me = registration.me(user, token.emailVerified());
        if (!user.registered() && me.registered()) {
            principalResolver.evict(user.firebaseUid());
        }
        return me;
    }

    @PostMapping("/register/parent")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register the signed-in phone user as a parent, recording DPDP consents")
    public MeResponse registerParent(Authentication authentication, @Valid @RequestBody RegisterParentRequest request) {
        CurrentUser user = (CurrentUser) authentication.getPrincipal();
        MeResponse me = registration.registerParent(user, request);
        principalResolver.evict(user.firebaseUid());
        return me;
    }
}
