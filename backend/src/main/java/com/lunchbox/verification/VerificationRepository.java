package com.lunchbox.verification;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface VerificationRepository extends JpaRepository<Verification, UUID> {

    Optional<Verification> findFirstByOrderIdAndTypeAndStatus(UUID orderId, Verification.Type type,
                                                             Verification.Status status);

    Optional<Verification> findFirstByOrderIdAndTypeAndStatusOrderByCreatedAtDesc(UUID orderId, Verification.Type type,
                                                                                  Verification.Status status);

    List<Verification> findByOrderIdOrderByCreatedAt(UUID orderId);
}
