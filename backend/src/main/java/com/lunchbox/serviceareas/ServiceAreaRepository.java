package com.lunchbox.serviceareas;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

interface ServiceAreaRepository extends JpaRepository<ServiceArea, UUID> {

    /** Point-in-polygon via PostGIS (GiST-indexed). */
    @Query(value = """
            SELECT * FROM service_areas
            WHERE active AND ST_Contains(boundary, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
            """, nativeQuery = true)
    List<ServiceArea> findContaining(@Param("lat") double lat, @Param("lng") double lng);

    List<ServiceArea> findAllByOrderByCityAscNameAsc();
}
