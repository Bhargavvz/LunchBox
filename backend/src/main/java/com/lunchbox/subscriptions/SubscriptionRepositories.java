package com.lunchbox.subscriptions;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface PlanRepository extends JpaRepository<Plan, UUID> {

    List<Plan> findByActiveTrueOrderByPricePaise();

    List<Plan> findAllByOrderByCreatedAtDesc();

    boolean existsByCodeIgnoreCase(String code);
}

interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {

    List<Subscription> findByParentIdOrderByCreatedAtDesc(UUID parentId);

    Optional<Subscription> findByIdAndParentId(UUID id, UUID parentId);

    Optional<Subscription> findByRazorpaySubscriptionId(String providerId);

    List<Subscription> findByChildIdAndStatusIn(UUID childId, Collection<Subscription.Status> statuses);

    boolean existsByAddressIdAndStatusIn(UUID addressId, Collection<Subscription.Status> statuses);

    @Query("""
            select s from Subscription s
            where s.status = com.lunchbox.subscriptions.Subscription.Status.ACTIVE
              and s.startDate <= :date and (s.endDate is null or s.endDate >= :date)
            """)
    List<Subscription> findActiveOn(@Param("date") LocalDate date);

    @Query("""
            select s from Subscription s
            where (:status is null or s.status = :status)
            """)
    Page<Subscription> search(@Param("status") Subscription.Status status, Pageable pageable);
}

interface LeaveDayRepository extends JpaRepository<LeaveDay, UUID> {

    List<LeaveDay> findByChildIdAndLeaveDateBetweenOrderByLeaveDate(UUID childId, LocalDate from, LocalDate to);

    Optional<LeaveDay> findByChildIdAndLeaveDate(UUID childId, LocalDate date);

    @Query("select l.childId from LeaveDay l where l.leaveDate = :date")
    List<UUID> findChildIdsOnLeave(@Param("date") LocalDate date);

    List<LeaveDay> findByChildIdIn(Collection<UUID> childIds);
}
