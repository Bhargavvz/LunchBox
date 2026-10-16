package com.lunchbox.schools;

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

interface SchoolRepository extends JpaRepository<School, UUID> {

    Optional<School> findByIdAndDeletedAtIsNull(UUID id);

    boolean existsByCodeIgnoreCase(String code);

    List<School> findByIdIn(Collection<UUID> ids);

    @Query("""
            select s from School s where s.deletedAt is null
            and (:activeOnly = false or s.active = true)
            and (:q is null or lower(s.name) like lower(concat('%', cast(:q as string), '%'))
                 or lower(s.code) like lower(concat('%', cast(:q as string), '%')))
            and (:city is null or lower(s.city) = lower(cast(:city as string)))
            """)
    Page<School> search(@Param("q") String q, @Param("city") String city, @Param("activeOnly") boolean activeOnly,
                        Pageable pageable);

    @Query("select s from School s where s.deletedAt is null and s.active = true")
    List<School> findAllActive();
}

interface SchoolHolidayRepository extends JpaRepository<SchoolHoliday, UUID> {

    List<SchoolHoliday> findBySchoolIdAndHolidayDateBetweenOrderByHolidayDate(UUID schoolId, LocalDate from, LocalDate to);

    boolean existsBySchoolIdAndHolidayDate(UUID schoolId, LocalDate date);

    @Query("select h.schoolId from SchoolHoliday h where h.holidayDate = :date")
    List<UUID> findSchoolIdsWithHoliday(@Param("date") LocalDate date);
}
