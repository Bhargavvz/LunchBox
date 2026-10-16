package com.lunchbox.users;

import com.lunchbox.common.security.Role;

import java.util.UUID;

/**
 * Lets other modules veto first sign-in of a pre-provisioned account (e.g. dispatch only allows KYC-approved
 * partners). Implementations throw an ApiException to block activation.
 */
public interface ActivationPolicy {

    boolean supports(Role role);

    void checkMayActivate(UUID userId);
}
