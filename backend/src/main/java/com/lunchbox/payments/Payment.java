package com.lunchbox.payments;

import com.lunchbox.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Getter
@Entity
@Table(name = "payments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Payment extends BaseEntity {

    public enum Status { CREATED, AUTHORIZED, CAPTURED, FAILED, REFUNDED }

    @Column(name = "parent_id", nullable = false, updatable = false)
    private UUID parentId;

    @Column(name = "subscription_id", updatable = false)
    private UUID subscriptionId;

    @Column(name = "razorpay_payment_id", updatable = false)
    private String razorpayPaymentId;

    @Column(name = "razorpay_invoice_id")
    private String razorpayInvoiceId;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(nullable = false)
    private String currency = "INR";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    private String method;

    @Column(nullable = false)
    private String description;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "paid_at")
    private Instant paidAt;

    Payment(UUID parentId, UUID subscriptionId, String razorpayPaymentId, long amountPaise, String description) {
        this.parentId = parentId;
        this.subscriptionId = subscriptionId;
        this.razorpayPaymentId = razorpayPaymentId;
        this.amountPaise = amountPaise;
        this.description = description;
        this.status = Status.CREATED;
    }

    void captured(String invoiceId, String method, long amountPaise, Instant paidAt) {
        this.status = Status.CAPTURED;
        this.razorpayInvoiceId = invoiceId;
        this.method = method;
        this.amountPaise = amountPaise;
        this.paidAt = paidAt;
        this.failureReason = null;
    }

    void authorized() {
        if (status == Status.CREATED) {
            this.status = Status.AUTHORIZED;
        }
    }

    void failed(String reason) {
        if (status != Status.CAPTURED && status != Status.REFUNDED) {
            this.status = Status.FAILED;
            this.failureReason = reason;
        }
    }
}
