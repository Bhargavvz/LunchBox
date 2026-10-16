package com.lunchbox.users;

import com.lunchbox.common.security.Role;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByFirebaseUid(String firebaseUid);

    Optional<User> findByPhoneAndDeletedAtIsNull(String phone);

    Optional<User> findByEmailIgnoreCaseAndDeletedAtIsNull(String email);

    boolean existsByRoleAndDeletedAtIsNull(Role role);

    @Query("select u.id from User u where u.role = :role and u.status = com.lunchbox.users.UserStatus.ACTIVE and u.deletedAt is null")
    List<UUID> findActiveIdsByRole(@Param("role") Role role);

    @Query("""
            select u from User u where u.role in :roles and u.deletedAt is null
            and (:q is null or lower(u.email) like lower(concat('%', cast(:q as string), '%'))
                 or lower(u.displayName) like lower(concat('%', cast(:q as string), '%')))
            """)
    Page<User> searchStaff(@Param("roles") Collection<Role> roles, @Param("q") String q, Pageable pageable);
}
