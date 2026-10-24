package com.lunchbox.common.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Validated
@ConfigurationProperties(prefix = "lunchbox")
public record LunchBoxProperties(
        @NotNull @Valid Security security,
        @NotNull @Valid Replica replica,
        @NotNull @Valid Storage storage,
        @NotNull @Valid Stomp stomp,
        @NotNull @Valid Firebase firebase,
        @NotNull @Valid Integrations integrations,
        @NotNull @Valid Tracking tracking,
        @NotNull @Valid Jobs jobs,
        Bootstrap bootstrap,
        @Valid Routing routing) {

    public enum Mode { FAKE, LIVE }

    public record Security(
            List<String> corsAllowedOrigins,
            @NotBlank String piiKey,
            @NotBlank String qrSigningKey,
            @NotNull Duration adminSessionMaxAge,
            boolean requireAdminMfa) {
    }

    public record Replica(@NotBlank String url, String username, String password) {
    }

    public record Storage(
            @NotBlank String region,
            String endpoint,
            boolean pathStyle,
            @NotBlank String handoverBucket,
            @NotBlank String kycBucket,
            String kmsKeyId,
            @NotNull Duration presignTtl) {
    }

    public record Stomp(
            @NotBlank String relayHost,
            int relayPort,
            boolean relaySsl,
            String clientLogin,
            String clientPasscode,
            String systemLogin,
            String systemPasscode,
            List<String> allowedOrigins) {
    }

    /** {@code emulatorHost} (or env FIREBASE_AUTH_EMULATOR_HOST) switches to emulator credentials. */
    public record Firebase(@NotBlank String projectId, String emulatorHost) {
    }

    public record Integrations(
            @NotNull Razorpay razorpay,
            @NotNull RazorpayX razorpayx,
            @NotNull Msg91 msg91,
            @NotNull Exotel exotel,
            @NotNull Idfy idfy,
            @NotNull Fcm fcm) {
    }

    public record Razorpay(Mode mode, String baseUrl, String keyId, String keySecret, String webhookSecret) {
    }

    public record RazorpayX(Mode mode, String baseUrl, String keyId, String keySecret, String accountNumber,
                            String webhookSecret) {
    }

    public record Msg91(Mode mode, String baseUrl, String authKey, Map<String, String> templateIds) {
    }

    public record Exotel(Mode mode, String baseUrl, String sid, String apiKey, String apiToken, String callerId) {
    }

    public record Idfy(Mode mode, String baseUrl, String accountId, String apiKey) {
    }

    public record Fcm(Mode mode) {
    }

    public record Tracking(
            @NotNull Duration flushInterval,
            int retentionDays,
            double maxSpeedKmph,
            int maxAccuracyM,
            @NotNull Duration maxPingAge,
            double averageSpeedKmph) {
    }

    public record Jobs(
            @NotBlank String orderGenerationCron,
            @NotBlank String assignmentCron,
            @NotBlank String noShowCron,
            @NotBlank String payoutCron,
            @NotBlank String partitionCron,
            @NotBlank String retentionCron) {
    }

    public record Bootstrap(String superAdminEmail) {
    }

    /** Absent or {@code or-tools}: in-process solver. {@code google}: Route Optimization API with OR-Tools failover. */
    public record Routing(Provider provider, Google google) {

        public enum Provider { OR_TOOLS, GOOGLE }

        /** {@code credentialsJson} empty → Application Default Credentials. */
        public record Google(String projectId, String credentialsJson, String baseUrl, Duration timeout) {
        }
    }
}
