package com.lunchbox.notifications;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface NotificationRepository extends JpaRepository<Notification, UUID> {

    Page<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    List<Notification> findByUserId(UUID userId);

    Optional<Notification> findByIdAndUserId(UUID id, UUID userId);

    long countByUserIdAndReadAtIsNull(UUID userId);

    @Modifying
    @Query("update Notification n set n.readAt = :at where n.userId = :userId and n.readAt is null")
    int markAllRead(@Param("userId") UUID userId, @Param("at") Instant at);

    @Modifying
    @Query("delete from Notification n where n.userId = :userId")
    void deleteByUserId(@Param("userId") UUID userId);

    @Modifying
    @Query("delete from Notification n where n.createdAt < :before")
    int deleteOlderThan(@Param("before") Instant before);
}

interface DeviceTokenRepository extends JpaRepository<DeviceToken, UUID> {

    List<DeviceToken> findByUserId(UUID userId);

    Optional<DeviceToken> findByToken(String token);

    /**
     * Registers or re-binds a push token in one statement. The app can send the same token twice at once (start-up
     * and permission grant), and a find-then-insert raced into a duplicate-key 409.
     */
    @Modifying
    @Query(value = """
            INSERT INTO device_tokens (id, user_id, token, platform, app, last_seen_at, created_at, updated_at)
            VALUES (:id, :userId, :token, :platform, :app, :now, :now, :now)
            ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
                app = EXCLUDED.app, last_seen_at = EXCLUDED.last_seen_at, updated_at = EXCLUDED.updated_at
            """, nativeQuery = true)
    void upsert(@Param("id") UUID id, @Param("userId") UUID userId, @Param("token") String token,
                @Param("platform") String platform, @Param("app") String app, @Param("now") Instant now);

    @Modifying
    @Query("delete from DeviceToken d where d.token in :tokens")
    void deleteByTokenIn(@Param("tokens") Collection<String> tokens);

    @Modifying
    @Query("delete from DeviceToken d where d.userId = :userId")
    void deleteByUserId(@Param("userId") UUID userId);

    @Modifying
    @Query("delete from DeviceToken d where d.token = :token and d.userId = :userId")
    int deleteByTokenAndUserId(@Param("token") String token, @Param("userId") UUID userId);
}
