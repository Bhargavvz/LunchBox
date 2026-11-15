package com.lunchbox.common.integration;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.config.LunchBoxProperties.Mode;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** Refuses to start the prod profile with any sandbox fake wired in place of a real provider. */
@Component
public class IntegrationModeGuard {

    private final LunchBoxProperties properties;
    private final Environment environment;

    public IntegrationModeGuard(LunchBoxProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void verify() {
        if (!environment.acceptsProfiles(Profiles.of("prod"))) {
            return;
        }
        var i = properties.integrations();
        Map<String, Mode> modes = new LinkedHashMap<>();
        modes.put("razorpay", i.razorpay().mode());
        modes.put("razorpayx", i.razorpayx().mode());
        modes.put("msg91", i.msg91().mode());
        modes.put("fcm", i.fcm().mode());
        // Payments and push are essential; SMS fallback and payouts may be switched OFF, but never faked.
        Set<String> mayBeOff = Set.of("razorpayx", "msg91");
        modes.forEach((name, mode) -> {
            boolean ok = mode == Mode.LIVE || (mode == Mode.OFF && mayBeOff.contains(name));
            if (!ok) {
                throw new IllegalStateException("Integration '" + name + "' must be LIVE"
                        + (mayBeOff.contains(name) ? " or OFF" : "") + " in the prod profile");
            }
        });
        if (!properties.security().requireAdminMfa()) {
            throw new IllegalStateException("Admin MFA cannot be disabled in the prod profile");
        }
    }
}
