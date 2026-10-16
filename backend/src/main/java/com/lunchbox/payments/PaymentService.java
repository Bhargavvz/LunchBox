package com.lunchbox.payments;

import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.privacy.PersonalDataContributor;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.users.UserDirectory;
import com.lunchbox.users.UserDirectory.ParentInfo;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.UUID;

@Service
public class PaymentService implements PaymentRecorder, PersonalDataContributor {

    private static final DateTimeFormatter INVOICE_MONTH = DateTimeFormatter.ofPattern("yyyyMM");

    private final PaymentRepository payments;
    private final UserDirectory users;
    private final AuditService audit;

    public PaymentService(PaymentRepository payments, UserDirectory users, AuditService audit) {
        this.payments = payments;
        this.users = users;
        this.audit = audit;
    }

    public record PaymentResponse(UUID id, UUID subscriptionId, String description, long amountPaise, String currency,
                                  Payment.Status status, String method, String failureReason, Instant paidAt,
                                  Instant createdAt) {
    }

    public record InvoiceResponse(String invoiceNumber, UUID paymentId, String providerPaymentId, Instant issuedAt,
                                  String billedTo, String description, long amountPaise, String currency,
                                  String method, String seller) {
    }

    // ---- PaymentRecorder ----

    @Override
    @Transactional
    public void recordCaptured(UUID parentId, UUID subscriptionId, String providerPaymentId, String providerInvoiceId,
                               long amountPaise, String method, String description, Instant paidAt) {
        Payment payment = payments.findByRazorpayPaymentId(providerPaymentId)
                .orElseGet(() -> payments.save(new Payment(parentId, subscriptionId, providerPaymentId, amountPaise, description)));
        boolean wasCaptured = payment.getStatus() == Payment.Status.CAPTURED;
        payment.captured(providerInvoiceId, method, amountPaise, paidAt);
        if (!wasCaptured) {
            audit.record("payment.captured", "Payment", payment.getId(), null,
                    Map.of("amountPaise", amountPaise, "subscriptionId", String.valueOf(subscriptionId)));
        }
    }

    @Override
    @Transactional
    public void recordAuthorized(UUID parentId, UUID subscriptionId, String providerPaymentId, long amountPaise,
                                 String description) {
        Payment payment = payments.findByRazorpayPaymentId(providerPaymentId)
                .orElseGet(() -> payments.save(new Payment(parentId, subscriptionId, providerPaymentId, amountPaise, description)));
        payment.authorized();
    }

    @Override
    @Transactional
    public void recordFailed(String providerPaymentId, String reason) {
        payments.findByRazorpayPaymentId(providerPaymentId).ifPresent(p -> {
            p.failed(reason);
            audit.record("payment.failed", "Payment", p.getId(), null, Map.of("reason", String.valueOf(reason)));
        });
    }

    // ---- Parent ----

    @Transactional(readOnly = true)
    public PageResponse<PaymentResponse> list(UUID parentUserId, Integer page, Integer size) {
        UUID parentId = users.requireParentId(parentUserId);
        return PageResponse.of(payments.findByParentIdOrderByCreatedAtDesc(parentId, Pagination.of(page, size, Sort.unsorted())),
                PaymentService::toResponse);
    }

    @Transactional(readOnly = true)
    public InvoiceResponse invoice(UUID parentUserId, UUID paymentId) {
        UUID parentId = users.requireParentId(parentUserId);
        Payment p = payments.findByIdAndParentId(paymentId, parentId).orElseThrow(() -> Errors.notFound("Payment"));
        if (p.getStatus() != Payment.Status.CAPTURED && p.getStatus() != Payment.Status.REFUNDED) {
            throw Errors.unprocessable("no_invoice", "An invoice is available once the payment succeeds.");
        }
        ParentInfo parent = users.requireParent(parentId);
        Instant issued = p.getPaidAt() == null ? p.getCreatedAt() : p.getPaidAt();
        String number = "LB-" + INVOICE_MONTH.format(issued.atZone(TimeZones.IST)) + "-"
                + p.getId().toString().substring(p.getId().toString().length() - 8).toUpperCase();
        String billedTo = parent.lastName() == null ? parent.firstName() : parent.firstName() + " " + parent.lastName();
        return new InvoiceResponse(number, p.getId(), p.getRazorpayPaymentId(), issued, billedTo, p.getDescription(),
                p.getAmountPaise(), p.getCurrency(), p.getMethod(), "LunchBox Technologies Pvt. Ltd.");
    }

    // ---- PersonalDataContributor ----

    @Override
    public String section() {
        return "payments";
    }

    @Override
    public int order() {
        return 30;
    }

    @Override
    @Transactional(readOnly = true)
    public Object export(UUID userId) {
        UUID parentId = users.requireParentId(userId);
        return payments.findByParentId(parentId).stream().map(PaymentService::toResponse).toList();
    }

    /** Payment records are retained for statutory accounting (they hold no direct identifiers beyond parent id). */
    @Override
    public void erase(UUID userId) {
        // Intentionally retained: tax and accounting law require keeping transaction records.
    }

    static PaymentResponse toResponse(Payment p) {
        return new PaymentResponse(p.getId(), p.getSubscriptionId(), p.getDescription(), p.getAmountPaise(),
                p.getCurrency(), p.getStatus(), p.getMethod(), p.getFailureReason(), p.getPaidAt(), p.getCreatedAt());
    }
}
