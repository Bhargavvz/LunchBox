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
                                  Instant createdAt,
                                  /* Razorpay payment id (pay_...), shown to parents as the transaction ID. */
                                  String transactionId) {
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

    /** A payment as ops see it: who paid, for what, how, and the Razorpay reference. */
    public record AdminPaymentResponse(UUID id, UUID parentId, String parentName, UUID subscriptionId, String description,
                                       long amountPaise, Payment.Status status, String method, String failureReason,
                                       Instant paidAt, Instant createdAt, String transactionId) {
    }

    public record PaymentTotals(long count, long capturedPaise, long failedCount) {
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminPaymentResponse> adminSearch(Payment.Status status, Instant from, Instant to, String q,
                                                          Integer page, Integer size) {
        org.springframework.data.jpa.domain.Specification<Payment> spec = (root, query, cb) -> {
            java.util.List<jakarta.persistence.criteria.Predicate> p = new java.util.ArrayList<>();
            if (status != null) {
                p.add(cb.equal(root.get("status"), status));
            }
            if (from != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from));
            }
            if (to != null) {
                p.add(cb.lessThan(root.get("createdAt"), to));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(java.util.Locale.ROOT) + "%";
                p.add(cb.or(cb.like(cb.lower(root.get("razorpayPaymentId")), like), cb.like(cb.lower(root.get("description")), like)));
            }
            return cb.and(p.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        var result = payments.findAll(spec, Pagination.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        java.util.Map<UUID, String> names = new java.util.HashMap<>();
        result.getContent().forEach(pay -> names.computeIfAbsent(pay.getParentId(), id -> {
            try {
                UserDirectory.ParentInfo info = users.requireParent(id);
                return info.lastName() == null ? info.firstName() : info.firstName() + " " + info.lastName();
            } catch (RuntimeException e) {
                return null;
            }
        }));
        return PageResponse.of(result, pay -> new AdminPaymentResponse(pay.getId(), pay.getParentId(), names.get(pay.getParentId()),
                pay.getSubscriptionId(), pay.getDescription(), pay.getAmountPaise(), pay.getStatus(), pay.getMethod(),
                pay.getFailureReason(), pay.getPaidAt(), pay.getCreatedAt(), pay.getRazorpayPaymentId()));
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
                p.getCurrency(), p.getStatus(), p.getMethod(), p.getFailureReason(), p.getPaidAt(), p.getCreatedAt(),
                p.getRazorpayPaymentId());
    }
}
