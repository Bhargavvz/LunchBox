package com.lunchbox.notifications;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.privacy.PersonalDataContributor;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.notifications.channels.PushSender;
import com.lunchbox.notifications.channels.SmsSender;
import com.lunchbox.users.UserDirectory;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.context.MessageSource;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
public class NotificationService implements PersonalDataContributor {

    private static final Duration RETENTION = Duration.ofDays(180);

    private final NotificationRepository notifications;
    private final DeviceTokenRepository tokens;
    private final PushSender push;
    private final SmsSender sms;
    private final UserDirectory users;
    private final MessageSource messages;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meters;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, DeviceTokenRepository tokens, PushSender push,
                               SmsSender sms, UserDirectory users, MessageSource messages, ObjectMapper objectMapper,
                               MeterRegistry meters, Clock clock) {
        this.notifications = notifications;
        this.tokens = tokens;
        this.push = push;
        this.sms = sms;
        this.users = users;
        this.messages = messages;
        this.objectMapper = objectMapper;
        this.meters = meters;
        this.clock = clock;
    }

    public record NotificationResponse(UUID id, String category, String title, String body, Map<String, String> data,
                                       Instant createdAt, Instant readAt) {
    }

    public record UnreadCountResponse(long unread) {
    }

    public record RegisterDeviceRequest(@NotBlank @Size(max = 512) String token,
                                        @NotNull DeviceToken.Platform platform,
                                        @NotNull DeviceToken.App app) {
    }

    /**
     * Stores the notification (notification centre) and delivers it by push; when push is impossible and the
     * template is safety-relevant, falls back to SMS.
     */
    @Transactional
    public void notify(UUID userId, NotificationTemplate template, Object[] args, Map<String, String> data) {
        var user = users.findUser(userId).orElse(null);
        if (user == null || user.status() == com.lunchbox.users.UserStatus.DELETED) {
            return;
        }
        Locale locale = Locale.forLanguageTag(user.preferredLanguage() == null ? "en" : user.preferredLanguage());
        String title = messages.getMessage("notification." + template.key() + ".title", args, locale);
        String body = messages.getMessage("notification." + template.key() + ".body", args, locale);
        notifyRaw(userId, template, title, body, data, user.phone(), args);
    }

    /** Variant for already-rendered text (admin broadcasts). */
    @Transactional
    public void notifyText(UUID userId, String title, String body, Map<String, String> data) {
        var user = users.findUser(userId).orElse(null);
        if (user == null || user.status() == com.lunchbox.users.UserStatus.DELETED) {
            return;
        }
        notifyRaw(userId, NotificationTemplate.BROADCAST, title, body, data, null, new Object[0]);
    }

    private void notifyRaw(UUID userId, NotificationTemplate template, String title, String body, Map<String, String> data,
                           String phone, Object[] args) {
        Map<String, String> payload = new HashMap<>(data == null ? Map.of() : data);
        payload.put("category", template.name());
        Notification n = notifications.save(new Notification(userId, template.name(), title, body, json(payload)));
        payload.put("notificationId", n.getId().toString());

        List<String> deviceTokens = tokens.findByUserId(userId).stream().map(DeviceToken::getToken).toList();
        boolean pushed = false;
        if (!deviceTokens.isEmpty()) {
            try {
                PushSender.Result result = push.send(deviceTokens, title, body, payload, template.highPriority());
                if (!result.invalidTokens().isEmpty()) {
                    tokens.deleteByTokenIn(result.invalidTokens());
                }
                pushed = result.successCount() > 0;
            } catch (RuntimeException e) {
                log.warn("Push failed for user {}: {}", userId, e.getMessage());
            }
        }
        if (pushed) {
            n.delivered(Notification.Channel.PUSH);
            meters.counter("lunchbox.notifications.sent", "channel", "push", "template", template.name()).increment();
            return;
        }
        if (template.smsTemplate() != null && phone != null) {
            try {
                Map<String, String> vars = new HashMap<>();
                for (int i = 0; i < args.length; i++) {
                    vars.put("var" + (i + 1), String.valueOf(args[i]));
                }
                if (sms.send(phone, template.smsTemplate(), vars)) {
                    n.delivered(Notification.Channel.SMS);
                    meters.counter("lunchbox.notifications.sent", "channel", "sms", "template", template.name()).increment();
                    return;
                }
            } catch (RuntimeException e) {
                log.warn("SMS fallback failed for user {}: {}", userId, e.getMessage());
            }
        }
        if (!deviceTokens.isEmpty() || template.smsTemplate() != null) {
            n.failed();
            meters.counter("lunchbox.notifications.failed", "template", template.name()).increment();
        }
    }

    // ---- Notification centre ----

    @Transactional(readOnly = true)
    public PageResponse<NotificationResponse> list(UUID userId, Integer page, Integer size) {
        return PageResponse.of(notifications.findByUserIdOrderByCreatedAtDesc(userId, Pagination.of(page, size, Sort.unsorted())),
                this::toResponse);
    }

    @Transactional(readOnly = true)
    public UnreadCountResponse unread(UUID userId) {
        return new UnreadCountResponse(notifications.countByUserIdAndReadAtIsNull(userId));
    }

    @Transactional
    public void markRead(UUID userId, UUID notificationId) {
        notifications.findByIdAndUserId(notificationId, userId).orElseThrow(() -> Errors.notFound("Notification"))
                .markRead(clock.instant());
    }

    @Transactional
    public void markAllRead(UUID userId) {
        notifications.markAllRead(userId, clock.instant());
    }

    @Transactional
    public void registerDevice(UUID userId, RegisterDeviceRequest request) {
        Instant now = clock.instant();
        tokens.findByToken(request.token()).ifPresentOrElse(
                t -> t.rebind(userId, request.platform(), request.app(), now),
                () -> tokens.save(new DeviceToken(userId, request.token(), request.platform(), request.app(), now)));
    }

    @Transactional
    public void unregisterDevice(UUID userId, String token) {
        tokens.deleteByTokenAndUserId(token, userId);
    }

    @Scheduled(cron = "0 15 3 * * *", zone = "Asia/Kolkata")
    @SchedulerLock(name = "notificationRetention", lockAtMostFor = "PT10M")
    @Transactional
    public void purgeOld() {
        int deleted = notifications.deleteOlderThan(clock.instant().minus(RETENTION));
        log.info("Purged {} notifications older than {} days", deleted, RETENTION.toDays());
    }

    // ---- PersonalDataContributor ----

    @Override
    public String section() {
        return "notifications";
    }

    @Override
    public int order() {
        return 70;
    }

    @Override
    @Transactional(readOnly = true)
    public Object export(UUID userId) {
        return notifications.findByUserId(userId).stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional
    public void erase(UUID userId) {
        notifications.deleteByUserId(userId);
        tokens.deleteByUserId(userId);
    }

    @SuppressWarnings("unchecked")
    private NotificationResponse toResponse(Notification n) {
        Map<String, String> data = Map.of();
        if (n.getData() != null) {
            try {
                data = objectMapper.readValue(n.getData(), Map.class);
            } catch (JsonProcessingException e) {
                data = Map.of();
            }
        }
        return new NotificationResponse(n.getId(), n.getCategory(), n.getTitle(), n.getBody(), data, n.getCreatedAt(),
                n.getReadAt());
    }

    private String json(Map<String, String> data) {
        try {
            return objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
