package com.lunchbox.verification;

import com.lunchbox.common.crypto.Hmac;
import com.lunchbox.common.crypto.PiiCipher;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.geo.Geo;
import com.lunchbox.common.geo.GeoPoint;
import com.lunchbox.common.ratelimit.RateLimitPolicy;
import com.lunchbox.common.ratelimit.RateLimiter;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.orders.OrderQueries;
import com.lunchbox.orders.OrderStatus;
import com.lunchbox.orders.OrderView;
import com.lunchbox.users.UserDirectory;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

@Service
public class PickupVerificationService implements PickupVerifier {

    static final int MAX_OTP_ATTEMPTS = 5;
    private static final Set<OrderStatus> CODE_VISIBLE = EnumSet.of(OrderStatus.SCHEDULED, OrderStatus.ASSIGNED,
            OrderStatus.REASSIGNED, OrderStatus.PARTNER_EN_ROUTE);

    private final VerificationRepository verifications;
    private final OrderQueries orders;
    private final UserDirectory users;
    private final PiiCipher cipher;
    private final QrTokens qrTokens;
    private final RateLimiter rateLimiter;
    private final MeterRegistry meters;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public PickupVerificationService(VerificationRepository verifications, OrderQueries orders, UserDirectory users,
                                     PiiCipher cipher, QrTokens qrTokens, RateLimiter rateLimiter, MeterRegistry meters,
                                     Clock clock) {
        this.verifications = verifications;
        this.orders = orders;
        this.users = users;
        this.cipher = cipher;
        this.qrTokens = qrTokens;
        this.rateLimiter = rateLimiter;
        this.meters = meters;
        this.clock = clock;
    }

    public record PickupCodeResponse(UUID orderId, String otp, String qrToken, Instant qrExpiresAt, Instant otpExpiresAt) {
    }

    /** Parent: today's pickup OTP and a fresh signed QR for one of their orders. */
    @Transactional
    public PickupCodeResponse pickupCode(UUID parentUserId, UUID orderId) {
        UUID parentId = users.requireParentId(parentUserId);
        OrderView order = orders.requireOwnedByParent(orderId, parentId);
        if (!order.scheduledDate().equals(TimeZones.todayIst(clock)) || !CODE_VISIBLE.contains(order.status())) {
            throw Errors.unprocessable("code_unavailable", "A pickup code is available on the day of pickup until it is collected.");
        }
        Verification otp = verifications.findFirstByOrderIdAndTypeAndStatus(orderId, Verification.Type.PICKUP_OTP,
                        Verification.Status.PENDING)
                .orElseGet(() -> verifications.save(Verification.pendingOtp(orderId,
                        cipher.encrypt(String.format("%06d", random.nextInt(1_000_000))), order.deliveryDeadline())));
        QrTokens.Issued qr = qrTokens.issue(orderId);
        return new PickupCodeResponse(orderId, cipher.decrypt(otp.getCodeCiphertext()), qr.token(), qr.expiresAt(),
                otp.getExpiresAt());
    }

    /**
     * Runs in its own transaction so failed attempts (and the lock-out) persist even though the caller's transaction
     * rolls back on the thrown error. A retry after an already-verified code (e.g. offline queue replay) succeeds.
     */
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, noRollbackFor = ApiException.class)
    public void verifyPickup(UUID orderId, UUID partnerUserId, Method method, String code, GeoPoint at) {
        rateLimiter.consume(RateLimitPolicy.PICKUP_VERIFY, partnerUserId + ":" + orderId);
        Instant now = clock.instant();
        var location = at == null ? null : Geo.point(at);
        if (method == Method.QR) {
            UUID tokenOrder = qrTokens.verify(code).orElseThrow(() -> invalid("This QR code is invalid or has expired. Ask the parent to refresh it."));
            if (!tokenOrder.equals(orderId)) {
                meters.counter("lunchbox.verification.qr_mismatch").increment();
                throw invalid("This QR code belongs to a different lunchbox.");
            }
            verifications.findFirstByOrderIdAndTypeAndStatus(orderId, Verification.Type.PICKUP_OTP, Verification.Status.PENDING)
                    .ifPresent(Verification::expire);
            verifications.save(Verification.verified(orderId, Verification.Type.PICKUP_QR, partnerUserId, now, location,
                    null, null, null));
            meters.counter("lunchbox.verification.pickup", "method", "qr").increment();
            return;
        }
        var alreadyVerified = verifications.findFirstByOrderIdAndTypeAndStatusOrderByCreatedAtDesc(orderId,
                Verification.Type.PICKUP_OTP, Verification.Status.VERIFIED);
        if (alreadyVerified.isPresent() && code != null
                && Hmac.constantTimeEquals(cipher.decrypt(alreadyVerified.get().getCodeCiphertext()), code.trim())) {
            return;
        }
        Verification otp = verifications.findFirstByOrderIdAndTypeAndStatus(orderId, Verification.Type.PICKUP_OTP,
                        Verification.Status.PENDING)
                .orElseThrow(() -> invalid("The parent has not opened today's pickup code yet. Ask them to open the LunchBox app."));
        if (otp.getExpiresAt() != null && otp.getExpiresAt().isBefore(now)) {
            otp.expire();
            throw invalid("This pickup code has expired.");
        }
        int attempts = otp.recordAttempt();
        String expected = cipher.decrypt(otp.getCodeCiphertext());
        if (code == null || !Hmac.constantTimeEquals(expected, code.trim())) {
            meters.counter("lunchbox.verification.otp_failed").increment();
            if (attempts >= MAX_OTP_ATTEMPTS) {
                otp.lock();
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "otp_locked",
                        "Too many wrong codes. Scan the parent's QR code instead or contact support.");
            }
            throw invalid("Wrong code. " + (MAX_OTP_ATTEMPTS - attempts) + " attempts left.");
        }
        otp.markVerified(partnerUserId, now, location);
        meters.counter("lunchbox.verification.pickup", "method", "otp").increment();
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "pickup_verification_failed", message);
    }
}
