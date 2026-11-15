package com.lunchbox.common.integration;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.config.LunchBoxProperties.Mode;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class IntegrationModeGuardTest {

    @Test
    void prodAcceptsLiveProvidersWithPayoutsAndSmsOff() {
        assertThatCode(() -> guard(Mode.LIVE, Mode.OFF, Mode.OFF, Mode.LIVE, true).verify()).doesNotThrowAnyException();
    }

    @Test
    void prodRejectsFakes() {
        assertThatThrownBy(() -> guard(Mode.LIVE, Mode.FAKE, Mode.OFF, Mode.LIVE, true).verify())
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("razorpayx");
    }

    @Test
    void prodRejectsPaymentsOrPushSwitchedOff() {
        assertThatThrownBy(() -> guard(Mode.OFF, Mode.OFF, Mode.OFF, Mode.LIVE, true).verify())
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("razorpay");
        assertThatThrownBy(() -> guard(Mode.LIVE, Mode.OFF, Mode.OFF, Mode.OFF, true).verify())
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("fcm");
    }

    @Test
    void prodRequiresAdminMfa() {
        assertThatThrownBy(() -> guard(Mode.LIVE, Mode.LIVE, Mode.LIVE, Mode.LIVE, false).verify())
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("MFA");
    }

    @Test
    void otherProfilesAllowFakes() {
        var properties = properties(Mode.FAKE, Mode.FAKE, Mode.FAKE, Mode.FAKE, false);
        var guard = new IntegrationModeGuard(properties, new MockEnvironment());
        assertThatCode(guard::verify).doesNotThrowAnyException();
    }

    private static IntegrationModeGuard guard(Mode razorpay, Mode razorpayx, Mode msg91, Mode fcm, boolean mfa) {
        var env = new MockEnvironment();
        env.setActiveProfiles("prod");
        return new IntegrationModeGuard(properties(razorpay, razorpayx, msg91, fcm, mfa), env);
    }

    private static LunchBoxProperties properties(Mode razorpay, Mode razorpayx, Mode msg91, Mode fcm, boolean mfa) {
        var properties = mock(LunchBoxProperties.class);
        when(properties.integrations()).thenReturn(new LunchBoxProperties.Integrations(
                new LunchBoxProperties.Razorpay(razorpay, null, null, null, null),
                new LunchBoxProperties.RazorpayX(razorpayx, null, null, null, null, null),
                new LunchBoxProperties.Msg91(msg91, null, null, Map.of()),
                new LunchBoxProperties.Fcm(fcm)));
        when(properties.security()).thenReturn(
                new LunchBoxProperties.Security(List.of(), "k", "q", Duration.ofHours(8), mfa));
        return properties;
    }
}
