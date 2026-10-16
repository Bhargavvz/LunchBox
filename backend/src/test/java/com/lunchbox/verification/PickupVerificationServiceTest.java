package com.lunchbox.verification;

import com.lunchbox.common.crypto.PiiCipher;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.ratelimit.RateLimiter;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.users.UserDirectory;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PickupVerificationServiceTest {

    private final Instant now = Instant.parse("2026-10-19T04:30:00Z");
    private final UUID orderId = UUID.randomUUID();
    private final UUID partnerUser = UUID.randomUUID();

    private VerificationRepository repo;
    private PiiCipher cipher;
    private QrTokens qr;
    private PickupVerificationService service;
    private Verification pendingOtp;

    @BeforeEach
    void setUp() {
        repo = mock(VerificationRepository.class);
        cipher = mock(PiiCipher.class);
        qr = mock(QrTokens.class);
        when(cipher.decrypt("cipher-123456")).thenReturn("123456");
        pendingOtp = Verification.pendingOtp(orderId, "cipher-123456", now.plusSeconds(7200));
        when(repo.findFirstByOrderIdAndTypeAndStatusOrderByCreatedAtDesc(eq(orderId), eq(Verification.Type.PICKUP_OTP),
                eq(Verification.Status.VERIFIED))).thenReturn(Optional.empty());
        when(repo.findFirstByOrderIdAndTypeAndStatus(orderId, Verification.Type.PICKUP_OTP, Verification.Status.PENDING))
                .thenReturn(Optional.of(pendingOtp));
        when(repo.save(any(Verification.class))).thenAnswer(i -> i.getArgument(0));
        service = new PickupVerificationService(repo, mock(OrderQueries.class), mock(UserDirectory.class), cipher, qr,
                mock(RateLimiter.class), new SimpleMeterRegistry(), Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void correctOtpVerifies() {
        service.verifyPickup(orderId, partnerUser, PickupVerifier.Method.OTP, "123456", null);
        assertThat(pendingOtp.getStatus()).isEqualTo(Verification.Status.VERIFIED);
        assertThat(pendingOtp.getVerifiedBy()).isEqualTo(partnerUser);
    }

    @Test
    void wrongOtpCountsAttemptsThenLocks() {
        for (int i = 1; i < PickupVerificationService.MAX_OTP_ATTEMPTS; i++) {
            assertThatThrownBy(() -> service.verifyPickup(orderId, partnerUser, PickupVerifier.Method.OTP, "000000", null))
                    .isInstanceOf(ApiException.class)
                    .extracting(e -> ((ApiException) e).getCode()).isEqualTo("pickup_verification_failed");
        }
        assertThatThrownBy(() -> service.verifyPickup(orderId, partnerUser, PickupVerifier.Method.OTP, "000000", null))
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("otp_locked");
        assertThat(pendingOtp.getStatus()).isEqualTo(Verification.Status.FAILED);
    }

    @Test
    void expiredOtpRejected() {
        Verification expired = Verification.pendingOtp(orderId, "cipher-123456", now.minusSeconds(1));
        when(repo.findFirstByOrderIdAndTypeAndStatus(orderId, Verification.Type.PICKUP_OTP, Verification.Status.PENDING))
                .thenReturn(Optional.of(expired));
        assertThatThrownBy(() -> service.verifyPickup(orderId, partnerUser, PickupVerifier.Method.OTP, "123456", null))
                .isInstanceOf(ApiException.class);
        assertThat(expired.getStatus()).isEqualTo(Verification.Status.EXPIRED);
    }

    @Test
    void qrForAnotherOrderRejected() {
        when(qr.verify("token")).thenReturn(Optional.of(UUID.randomUUID()));
        assertThatThrownBy(() -> service.verifyPickup(orderId, partnerUser, PickupVerifier.Method.QR, "token", null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("different lunchbox");
    }

    @Test
    void validQrVerifiesAndRetiresOtp() {
        when(qr.verify("token")).thenReturn(Optional.of(orderId));
        service.verifyPickup(orderId, partnerUser, PickupVerifier.Method.QR, "token", null);
        assertThat(pendingOtp.getStatus()).isEqualTo(Verification.Status.EXPIRED);
    }
}
