package com.lunchbox.dispatch.web;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.dispatch.calls.MaskedCallService;
import com.lunchbox.dispatch.web.DispatchDtos.CallResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@Tag(name = "Orders")
@RestController
public class ParentCallController {

    private final MaskedCallService calls;

    public ParentCallController(MaskedCallService calls) {
        this.calls = calls;
    }

    @PostMapping("/api/v1/orders/{orderId}/call-partner")
    @PreAuthorize(Roles.PARENT)
    public CallResponse callPartner(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID orderId) {
        calls.parentCallsPartner(user.requireUserId(), orderId);
        return new CallResponse("RINGING", "Your phone will ring first; then we connect you to your delivery partner.");
    }
}
