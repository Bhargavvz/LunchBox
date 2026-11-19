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

interface PlanFeatureDefinitionRepository extends JpaRepository<PlanFeatureDefinition, String> {

    List<PlanFeatureDefinition> findAllByOrderByDisplayOrderAscKeyAsc();
}

interface CouponRepository extends JpaRepository<Coupon, UUID> {

    Optional<Coupon> findByCodeIgnoreCase(String code);

    boolean existsByCodeIgnoreCase(String code);

    List<Coupon> findAllByOrderByCreatedAtDesc();
}

interface CouponRedemptionRepository extends JpaRepository<CouponRedemption, UUID> {

    boolean existsByCouponIdAndParentId(UUID couponId, UUID parentId);
}

interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {

    long countByPlanIdAndStatusIn(UUID planId, Collection<Subscription.Status> statuses);

    long countByParentIdAndPlanIdAndStatusIn(UUID parentId, UUID planId, Collection<Subscription.Status> statuses);

    boolean existsByParentIdAndTrialEndsAtIsNotNull(UUID parentId);

    boolean existsByParentId(UUID parentId);

    List<Subscription> findByIdIn(Collection<UUID> ids);

    List<Subscription> findByParentIdOrderByCreatedAtDesc(UUID parentId);

    Optional<Subscription> findByIdAndParentId(UUID id, UUID parentId);

    Optional<Subscription> findByRazorpaySubscriptionId(String providerId);

    Optional<Subscription> findByRazorpayOrderId(String razorpayOrderId);

    List<Subscription> findByChildIdAndStatusIn(UUID childId, Collection<Subscription.Status> statuses);

    boolean existsByAddressIdAndStatusIn(UUID addressId, Collection<Subscription.Status> statuses);

    @Query("""
            select s from Subscription s
            where s.status = com.lunchbox.subscriptions.Subscription.Status.ACTIVE
              and s.startDate <= :date and (s.endDate is null or s.endDate >= :date)
              and (s.currentPeriodEnd is null or s.currentPeriodEnd > :dayStart)
            """)
    List<Subscription> findActiveOn(@Param("date") LocalDate date, @Param("dayStart") java.time.Instant dayStart);

    /** Active prepaid plans whose paid period ends before {@code before}. */
    @Query("""
            select s from Subscription s
            where s.status = com.lunchbox.subscriptions.Subscription.Status.ACTIVE
              and s.razorpaySubscriptionId is null and s.currentPeriodEnd is not null and s.currentPeriodEnd < :before
            """)
    List<Subscription> findPrepaidEndingBefore(@Param("before") java.time.Instant before);

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

    long countByChildIdAndLeaveDateBetween(UUID childId, LocalDate from, LocalDate to);
}
