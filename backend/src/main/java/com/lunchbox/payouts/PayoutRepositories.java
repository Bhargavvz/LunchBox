package com.lunchbox.payouts;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface PayoutRepository extends JpaRepository<Payout, UUID> {

    Page<Payout> findByPartnerIdOrderByCreatedAtDesc(UUID partnerId, Pageable pageable);

    Page<Payout> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<Payout> findByStatusOrderByCreatedAtDesc(Payout.Status status, Pageable pageable);

    Optional<Payout> findByProviderPayoutId(String providerPayoutId);

    Optional<Payout> findFirstByPartnerIdOrderByPeriodEndDesc(UUID partnerId);
}

interface LedgerRepository extends JpaRepository<LedgerEntry, UUID> {

    @Query("select coalesce(sum(e.amountPaise), 0) from LedgerEntry e where e.partnerId = :partnerId and e.earningDate <= :upTo")
    long balanceUpTo(@Param("partnerId") UUID partnerId, @Param("upTo") LocalDate upTo);

    @Query("""
            select coalesce(sum(e.amountPaise), 0) from LedgerEntry e
            where e.partnerId = :partnerId and e.earningDate between :from and :to
              and e.entryType not in (com.lunchbox.payouts.LedgerEntry.Type.PAYOUT, com.lunchbox.payouts.LedgerEntry.Type.PAYOUT_REVERSAL)
            """)
    long earnedBetween(@Param("partnerId") UUID partnerId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    List<LedgerEntry> findByPartnerIdAndEarningDateBetweenOrderByCreatedAtDesc(UUID partnerId, LocalDate from, LocalDate to);

    @Query("select min(e.earningDate) from LedgerEntry e where e.partnerId = :partnerId")
    Optional<LocalDate> firstEarningDate(@Param("partnerId") UUID partnerId);
}
