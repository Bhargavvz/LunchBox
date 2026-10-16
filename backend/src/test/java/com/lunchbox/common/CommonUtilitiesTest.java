package com.lunchbox.common;

import com.lunchbox.common.config.LunchBoxProperties;
import com.lunchbox.common.crypto.Hmac;
import com.lunchbox.common.crypto.PiiCipher;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.persistence.UuidV7;
import com.lunchbox.common.web.Validation;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

class CommonUtilitiesTest {

    @Test
    void uuidV7IsVersion7AndTimeOrdered() throws InterruptedException {
        UUID a = UuidV7.generate();
        Thread.sleep(2);
        UUID b = UuidV7.generate();
        assertThat(a.version()).isEqualTo(7);
        assertThat(a.variant()).isEqualTo(2);
        assertThat(UuidV7.timestampMillis(b)).isGreaterThan(UuidV7.timestampMillis(a));
        assertThat(a.toString().compareTo(b.toString())).isNegative();
    }

    @Test
    void uuidV7IsUnique() {
        Set<UUID> seen = new HashSet<>();
        for (int i = 0; i < 10_000; i++) {
            assertThat(seen.add(UuidV7.generate())).isTrue();
        }
    }

    @Test
    void piiCipherRoundTripsAndRandomisesIv() {
        PiiCipher cipher = new PiiCipher(props("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="));
        String c1 = cipher.encrypt("Flat 4B, Lotus Residency");
        String c2 = cipher.encrypt("Flat 4B, Lotus Residency");
        assertThat(c1).startsWith("v1:").isNotEqualTo(c2);
        assertThat(cipher.decrypt(c1)).isEqualTo("Flat 4B, Lotus Residency");
        assertThat(cipher.encrypt(null)).isNull();
    }

    @Test
    void piiCipherRejectsShortKey() {
        assertThatThrownBy(() -> new PiiCipher(props("AAAA"))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void piiCipherDetectsTampering() {
        PiiCipher cipher = new PiiCipher(props("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="));
        String c = cipher.encrypt("secret");
        String tampered = c.substring(0, c.length() - 2) + (c.endsWith("A") ? "B" : "A") + "=";
        assertThatThrownBy(() -> cipher.decrypt(tampered)).isInstanceOf(RuntimeException.class);
    }

    @Test
    void haversineMatchesKnownDistance() {
        // Bengaluru MG Road to Indiranagar ≈ 3.8 km
        double d = Geo.haversineMeters(12.9756, 77.6066, 12.9719, 77.6412);
        assertThat(d).isCloseTo(3770, within(150.0));
    }

    @Test
    void geofencePolygonContainment() {
        var fence = Geo.polygon(List.of(new GeoPoint(12.0, 77.0), new GeoPoint(12.0, 77.01),
                new GeoPoint(12.01, 77.01), new GeoPoint(12.01, 77.0)));
        assertThat(Geo.insideGeofence(fence, null, 0, 12.005, 77.005)).isTrue();
        assertThat(Geo.insideGeofence(fence, null, 0, 12.02, 77.005)).isFalse();
        var centre = Geo.point(12.0, 77.0);
        assertThat(Geo.insideGeofence(null, centre, 150, 12.001, 77.0)).isTrue();
        assertThat(Geo.insideGeofence(null, centre, 50, 12.001, 77.0)).isFalse();
    }

    @Test
    void selfIntersectingPolygonRejected() {
        assertThatThrownBy(() -> Geo.polygon(List.of(new GeoPoint(0.0, 0.0), new GeoPoint(1.0, 1.0),
                new GeoPoint(0.0, 1.0), new GeoPoint(1.0, 0.0)))).hasMessageContaining("cross");
    }

    @Test
    void phoneMasking() {
        assertThat(Validation.maskPhone("+919876543210")).isEqualTo("+91 98XXXXXX10");
        assertThat(Validation.maskPhone(null)).isNull();
    }

    @Test
    void hmacConstantTimeCompare() {
        String sig = Hmac.sha256Hex("secret", "payload");
        assertThat(Hmac.constantTimeEquals(sig, Hmac.sha256Hex("secret", "payload"))).isTrue();
        assertThat(Hmac.constantTimeEquals(sig, Hmac.sha256Hex("other", "payload"))).isFalse();
        assertThat(Hmac.constantTimeEquals(sig, null)).isFalse();
    }

    static LunchBoxProperties props(String piiKey) {
        LunchBoxProperties p = Mockito.mock(LunchBoxProperties.class);
        Mockito.when(p.security()).thenReturn(new LunchBoxProperties.Security(List.of(), piiKey,
                "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", Duration.ofHours(12), true));
        return p;
    }
}
