package com.lunchbox.payments;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByRazorpayPaymentId(String razorpayPaymentId);

    Page<Payment> findByParentIdOrderByCreatedAtDesc(UUID parentId, Pageable pageable);

    List<Payment> findByParentId(UUID parentId);

    Optional<Payment> findByIdAndParentId(UUID id, UUID parentId);
}
