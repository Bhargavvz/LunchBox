package com.lunchbox.verification;

import com.lunchbox.common.config.LunchBoxProperties;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class QrTokensTest {

    private static final String KEY = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
    private final Instant now = Instant.parse("2026-10-19T03:30:00Z");

    private QrTokens tokens(Instant at) {
        LunchBoxProperties p = Mockito.mock(LunchBoxProperties.class);
        Mockito.when(p.security()).thenReturn(new LunchBoxProperties.Security(List.of(),
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", KEY, Duration.ofHours(12), true));
        return new QrTokens(p, Clock.fixed(at, ZoneOffset.UTC));
    }

    @Test
    void validTokenVerifies() {
        UUID order = UUID.randomUUID();
        var issued = tokens(now).issue(order);
        assertThat(tokens(now.plusSeconds(60)).verify(issued.token())).contains(order);
    }

    @Test
    void expiredTokenRejected() {
        var issued = tokens(now).issue(UUID.randomUUID());
        assertThat(tokens(now.plus(QrTokens.TTL).plusSeconds(1)).verify(issued.token())).isEmpty();
    }

    @Test
    void tamperedOrderIdRejected() {
        UUID order = UUID.randomUUID();
        String token = tokens(now).issue(order).token();
        String forged = token.replace(order.toString(), UUID.randomUUID().toString());
        assertThat(tokens(now).verify(forged)).isEmpty();
    }

    @Test
    void tamperedExpiryRejected() {
        String token = tokens(now).issue(UUID.randomUUID()).token();
        String[] parts = token.split("\\.");
        parts[2] = String.valueOf(Long.parseLong(parts[2]) + 3600);
        assertThat(tokens(now).verify(String.join(".", parts))).isEmpty();
    }

    @Test
    void garbageRejected() {
        assertThat(tokens(now).verify("not-a-token")).isEmpty();
        assertThat(tokens(now).verify(null)).isEmpty();
        assertThat(tokens(now).verify("LB1.x.y.z.w")).isEmpty();
    }
}
