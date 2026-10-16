package com.lunchbox.users;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

interface ParentRepository extends JpaRepository<Parent, UUID> {

    Optional<Parent> findByUserId(UUID userId);

    @Query(value = """
            select p.* from parents p join users u on u.id = p.user_id
            where u.deleted_at is null
              and (cast(:q as text) is null
                   or (p.first_name || ' ' || coalesce(p.last_name, '')) ilike '%' || cast(:q as text) || '%'
                   or u.phone like '%' || cast(:q as text) || '%')
            order by p.created_at desc
            """,
            countQuery = """
            select count(*) from parents p join users u on u.id = p.user_id
            where u.deleted_at is null
              and (cast(:q as text) is null
                   or (p.first_name || ' ' || coalesce(p.last_name, '')) ilike '%' || cast(:q as text) || '%'
                   or u.phone like '%' || cast(:q as text) || '%')
            """,
            nativeQuery = true)
    Page<Parent> search(@Param("q") String q, Pageable pageable);
}
