package com.lunchbox.payouts;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.payouts.PayoutService.AdjustmentRequest;
import com.lunchbox.payouts.PayoutService.EarningsSummaryResponse;
import com.lunchbox.payouts.PayoutService.LedgerEntryResponse;
import com.lunchbox.payouts.PayoutService.PayoutResponse;
import com.lunchbox.payouts.PayoutService.PayoutRunResult;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

@Tag(name = "Earnings & payouts")
@RestController
public class PayoutController {

    private final PayoutService payouts;
    private final Clock clock;

    public PayoutController(PayoutService payouts, Clock clock) {
        this.payouts = payouts;
        this.clock = clock;
    }

    @GetMapping("/api/v1/partner/earnings")
    @PreAuthorize(Roles.PARTNER)
    public EarningsSummaryResponse earnings(@AuthenticationPrincipal CurrentUser user,
                                            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        LocalDate today = TimeZones.todayIst(clock);
        return payouts.earnings(user.requireUserId(), from == null ? today.minusDays(6) : from, to == null ? today : to);
    }

    @GetMapping("/api/v1/partner/earnings/monthly")
    @PreAuthorize(Roles.PARTNER)
    public EarningsSummaryResponse monthly(@AuthenticationPrincipal CurrentUser user,
                                           @RequestParam(required = false) String month) {
        YearMonth ym = month == null ? YearMonth.from(TimeZones.todayIst(clock)) : YearMonth.parse(month);
        return payouts.monthly(user.requireUserId(), ym);
    }

    @GetMapping("/api/v1/partner/payouts")
    @PreAuthorize(Roles.PARTNER)
    public PageResponse<PayoutResponse> partnerPayouts(@AuthenticationPrincipal CurrentUser user,
                                                       @RequestParam(required = false) Integer page,
                                                       @RequestParam(required = false) Integer size) {
        return payouts.partnerPayouts(user.requireUserId(), page, size);
    }

    @GetMapping("/api/v1/admin/payouts")
    @PreAuthorize(Roles.ADMIN_READ)
    public PageResponse<PayoutResponse> adminPayouts(@RequestParam(required = false) Payout.Status status,
                                                     @RequestParam(required = false) Integer page,
                                                     @RequestParam(required = false) Integer size) {
        return payouts.adminPayouts(status, page, size);
    }

    @PostMapping("/api/v1/admin/payouts/run")
    @PreAuthorize(Roles.SUPER_ADMIN)
    public PayoutRunResult run(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodEnd) {
        return payouts.run(periodEnd);
    }

    @PostMapping("/api/v1/admin/partners/{partnerId}/earnings/adjustments")
    @PreAuthorize(Roles.SUPER_ADMIN)
    public LedgerEntryResponse adjust(@PathVariable UUID partnerId, @Valid @RequestBody AdjustmentRequest request,
                                      @AuthenticationPrincipal CurrentUser user) {
        return payouts.adjust(partnerId, request, user);
    }

    @Hidden
    @PostMapping(value = "/api/v1/webhooks/razorpayx", consumes = "application/json")
    public ResponseEntity<Void> webhook(@RequestBody String rawBody,
                                        @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature,
                                        @RequestHeader(value = "X-Razorpay-Event-Id", required = false) String eventId) {
        payouts.webhook(rawBody, signature, eventId);
        return ResponseEntity.ok().build();
    }
}
