package com.lunchbox.orders;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface OrderRepository extends JpaRepository<Order, UUID>, JpaSpecificationExecutor<Order> {

    /** Row lock so concurrent transitions (partner action vs. geofence auto-transition) serialise instead of failing. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("select o from DeliveryOrder o where o.id = :id")
    Optional<Order> findForUpdate(@Param("id") UUID id);

    /** Free-text rating comments are personal data; stars stay as anonymous service-quality history. */
    @Modifying
    @Query("update DeliveryOrder o set o.ratingComment = null where o.parentId = :parentId and o.ratingComment is not null")
    int clearRatingComments(@Param("parentId") UUID parentId);

    List<Order> findByScheduledDateAndStatusIn(LocalDate date, Collection<OrderStatus> statuses);

    List<Order> findBySchoolIdAndScheduledDateAndStatusIn(UUID schoolId, LocalDate date, Collection<OrderStatus> statuses);

    List<Order> findBySchoolIdAndScheduledDate(UUID schoolId, LocalDate date);

    List<Order> findByPartnerIdAndScheduledDate(UUID partnerId, LocalDate date);

    List<Order> findByPartnerIdAndScheduledDateAndStatusIn(UUID partnerId, LocalDate date, Collection<OrderStatus> statuses);

    List<Order> findByParentIdAndScheduledDateOrderByPickupWindowStart(UUID parentId, LocalDate date);

    Optional<Order> findByChildIdAndScheduledDate(UUID childId, LocalDate date);

    List<Order> findBySubscriptionIdAndScheduledDateGreaterThanEqualAndStatusIn(UUID subscriptionId, LocalDate from,
                                                                                Collection<OrderStatus> statuses);

    List<Order> findByChildIdAndScheduledDateGreaterThanEqualAndStatusIn(UUID childId, LocalDate from,
                                                                         Collection<OrderStatus> statuses);

    List<Order> findByIdIn(Collection<UUID> ids);

    boolean existsByParentIdAndStatusIn(UUID parentId, Collection<OrderStatus> statuses);

    List<Order> findByParentId(UUID parentId);

    @Query("""
            select o from DeliveryOrder o where o.parentId = :parentId
            and (:childId is null or o.childId = :childId)
            and o.scheduledDate between :from and :to
            """)
    Page<Order> findForParent(@Param("parentId") UUID parentId, @Param("childId") UUID childId,
                              @Param("from") LocalDate from, @Param("to") LocalDate to, Pageable pageable);
}

interface OrderStatusHistoryRepository extends JpaRepository<OrderStatusHistory, UUID> {

    List<OrderStatusHistory> findByOrderIdOrderByOccurredAt(UUID orderId);

    List<OrderStatusHistory> findByOrderIdInOrderByOccurredAt(Collection<UUID> orderIds);
}
