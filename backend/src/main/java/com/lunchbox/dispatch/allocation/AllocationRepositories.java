package com.lunchbox.dispatch.allocation;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

interface AllocationRunRepository extends JpaRepository<AllocationRun, UUID> {

    List<AllocationRun> findByRunDateOrderByStartedAtDesc(LocalDate date, Pageable page);

    List<AllocationRun> findAllByOrderByStartedAtDesc(Pageable page);
}

interface AllocationDecisionRepository extends JpaRepository<AllocationDecision, UUID> {

    List<AllocationDecision> findByOrderIdOrderByCreatedAtDesc(UUID orderId);

    List<AllocationDecision> findByRunIdOrderByCreatedAt(UUID runId);

    @Query("""
            select d.orderId as orderId, d.partnerId as partnerId from AllocationDecision d
            where d.outcome = com.lunchbox.dispatch.allocation.AllocationDecision.Outcome.DECLINED
              and d.orderId in :orderIds
            """)
    List<OrderPartner> declinedFor(@Param("orderIds") Collection<UUID> orderIds);

    @Query("""
            select d.partnerId as partnerId, count(d) as declines from AllocationDecision d
            where d.outcome = com.lunchbox.dispatch.allocation.AllocationDecision.Outcome.DECLINED
              and d.partnerId in :partnerIds and d.createdAt >= :since
            group by d.partnerId
            """)
    List<PartnerCount> declineCounts(@Param("partnerIds") Collection<UUID> partnerIds, @Param("since") Instant since);

    @Query(value = """
            SELECT DISTINCT ON (order_id) order_id AS orderId, outcome AS outcome, reason_code AS reasonCode
            FROM allocation_decisions WHERE order_id IN (:orderIds) ORDER BY order_id, created_at DESC
            """, nativeQuery = true)
    List<Latest> latest(@Param("orderIds") Collection<UUID> orderIds);

    interface Latest {
        UUID getOrderId();

        String getOutcome();

        String getReasonCode();
    }

    interface OrderPartner {
        UUID getOrderId();

        UUID getPartnerId();
    }

    interface PartnerCount {
        UUID getPartnerId();

        long getDeclines();
    }
}
