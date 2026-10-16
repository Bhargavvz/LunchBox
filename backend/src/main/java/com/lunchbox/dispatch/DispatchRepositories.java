package com.lunchbox.dispatch;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface DeliveryPartnerRepository extends JpaRepository<DeliveryPartner, UUID> {

    Optional<DeliveryPartner> findByUserId(UUID userId);

    List<DeliveryPartner> findByIdIn(Collection<UUID> ids);

    @Query("""
            select p from DeliveryPartner p where p.deletedAt is null
            and (:kyc is null or p.kycStatus = :kyc)
            and (:q is null or lower(concat(p.firstName, ' ', coalesce(p.lastName, ''))) like lower(concat('%', cast(:q as string), '%'))
                 or lower(p.vehicleNumber) like lower(concat('%', cast(:q as string), '%')))
            """)
    Page<DeliveryPartner> search(@Param("q") String q, @Param("kyc") DeliveryPartner.KycStatus kyc, Pageable pageable);
}

interface KycDocumentRepository extends JpaRepository<KycDocument, UUID> {

    List<KycDocument> findByPartnerIdOrderByCreatedAt(UUID partnerId);

    List<KycDocument> findByStatus(KycDocument.Status status);

    Optional<KycDocument> findByPartnerIdAndDocType(UUID partnerId, KycDocument.DocType type);
}

interface PartnerShiftRepository extends JpaRepository<PartnerShift, UUID> {

    Optional<PartnerShift> findByPartnerIdAndShiftDate(UUID partnerId, LocalDate date);

    List<PartnerShift> findByShiftDateAndStatusIn(LocalDate date, Collection<PartnerShift.Status> statuses);

    List<PartnerShift> findByPartnerIdAndShiftDateBetweenOrderByShiftDate(UUID partnerId, LocalDate from, LocalDate to);

    List<PartnerShift> findByShiftDate(LocalDate date);
}

interface RouteRepository extends JpaRepository<Route, UUID> {

    Optional<Route> findByPartnerIdAndRouteDate(UUID partnerId, LocalDate date);

    List<Route> findByRouteDate(LocalDate date);
}

interface RouteStopRepository extends JpaRepository<RouteStop, UUID> {

    List<RouteStop> findByRouteIdOrderBySequence(UUID routeId);

    Optional<RouteStop> findFirstByOrderIdOrderByCreatedAtDesc(UUID orderId);

    @Modifying
    @Query("delete from RouteStop s where s.routeId = :routeId")
    void deleteByRouteId(@Param("routeId") UUID routeId);
}

interface AssignmentRepository extends JpaRepository<Assignment, UUID> {

    Optional<Assignment> findByOrderIdAndStatus(UUID orderId, Assignment.Status status);

    List<Assignment> findByPartnerIdAndStatus(UUID partnerId, Assignment.Status status);

    List<Assignment> findByOrderIdInAndStatus(Collection<UUID> orderIds, Assignment.Status status);
}

interface PartnerIssueRepository extends JpaRepository<PartnerIssue, UUID> {

    Page<PartnerIssue> findByStatusInOrderByCreatedAtDesc(Collection<PartnerIssue.Status> statuses, Pageable pageable);
}
