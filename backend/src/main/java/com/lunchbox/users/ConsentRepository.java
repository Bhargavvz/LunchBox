package com.lunchbox.users;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface ConsentRepository extends JpaRepository<Consent, UUID> {

    List<Consent> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<Consent> findFirstByUserIdAndPurposeOrderByCreatedAtDesc(UUID userId, ConsentPurpose purpose);
}
