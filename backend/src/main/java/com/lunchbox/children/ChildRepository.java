package com.lunchbox.children;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface ChildRepository extends JpaRepository<Child, UUID> {

    List<Child> findByParentIdAndDeletedAtIsNullOrderByCreatedAt(UUID parentId);

    List<Child> findByParentId(UUID parentId);

    Optional<Child> findByIdAndParentIdAndDeletedAtIsNull(UUID id, UUID parentId);

    List<Child> findByIdIn(Collection<UUID> ids);

    long countByParentIdAndDeletedAtIsNull(UUID parentId);

    @Query("select distinct c.parentId from Child c where c.schoolId = :schoolId and c.deletedAt is null")
    List<UUID> findParentIdsAtSchool(@Param("schoolId") UUID schoolId);

    @Query("""
            select c from Child c where c.deletedAt is null
            and (:schoolId is null or c.schoolId = :schoolId)
            and (:q is null or lower(concat(c.firstName, ' ', coalesce(c.lastName, ''))) like lower(concat('%', cast(:q as string), '%'))
                 or lower(c.rollNumber) = lower(cast(:q as string)))
            """)
    Page<Child> search(@Param("schoolId") UUID schoolId, @Param("q") String q, Pageable pageable);
}
