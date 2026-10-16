package com.lunchbox.payments;

import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.security.Roles;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.payments.PaymentService.InvoiceResponse;
import com.lunchbox.payments.PaymentService.PaymentResponse;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;
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

import java.util.UUID;

@Tag(name = "Payments")
@RestController
public class PaymentController {

    private final PaymentService payments;
    private final RazorpayWebhookService webhooks;

    public PaymentController(PaymentService payments, RazorpayWebhookService webhooks) {
        this.payments = payments;
        this.webhooks = webhooks;
    }

    @GetMapping("/api/v1/payments")
    @PreAuthorize(Roles.PARENT)
    public PageResponse<PaymentResponse> list(@AuthenticationPrincipal CurrentUser user,
                                              @RequestParam(required = false) Integer page,
                                              @RequestParam(required = false) Integer size) {
        return payments.list(user.requireUserId(), page, size);
    }

    @GetMapping("/api/v1/payments/{paymentId}/invoice")
    @PreAuthorize(Roles.PARENT)
    public InvoiceResponse invoice(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID paymentId) {
        return payments.invoice(user.requireUserId(), paymentId);
    }

    /** Razorpay webhook. Authenticated by HMAC signature over the raw body, not by a bearer token. */
    @Hidden
    @PostMapping(value = "/api/v1/webhooks/razorpay", consumes = "application/json")
    public ResponseEntity<Void> razorpayWebhook(@RequestBody String rawBody,
                                                @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature,
                                                @RequestHeader(value = "X-Razorpay-Event-Id", required = false) String eventId) {
        webhooks.receive(rawBody, signature, eventId);
        return ResponseEntity.ok().build();
    }
}
