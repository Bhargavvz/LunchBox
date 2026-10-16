package com.lunchbox.payouts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.audit.AuditService;
import com.lunchbox.common.crypto.Hmac;
import com.lunchbox.common.error.Errors;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.common.security.CurrentUser;
import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.common.time.TimeZones;
import com.lunchbox.common.web.PageResponse;
import com.lunchbox.common.web.Pagination;
import com.lunchbox.dispatch.PartnerDirectory;
import com.lunchbox.notifications.NotificationService;
import com.lunchbox.notifications.NotificationTemplate;
import com.lunchbox.payments.WebhookInbox;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Weekly payouts: the outstanding ledger balance becomes a payout plus an equal negative PAYOUT ledger entry in one
 * transaction (so money can never be paid twice), then a worker submits it to RazorpayX with the payout id as the
 * idempotency key. Failed or reversed payouts credit the balance back with a PAYOUT_REVERSAL entry.
 */
@Slf4j
@Service
public class PayoutService {

    private final PayoutRepository payouts;
    private final LedgerRepository ledgerRepo;
    private final EarningsLedger ledger;
    private final PayoutGateway gateway;
    private final PartnerDirectory partners;
    private final PlatformSettings settings;
    private final OutboxPublisher outbox;
    private final WebhookInbox inbox;
    private final NotificationService notifications;
    private final AuditService audit;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;
    private final Clock clock;

    public PayoutService(PayoutRepository payouts, LedgerRepository ledgerRepo, EarningsLedger ledger,
                         PayoutGateway gateway, PartnerDirectory partners, PlatformSettings settings,
                         OutboxPublisher outbox, WebhookInbox inbox,
                         NotificationService notifications, AuditService audit, ObjectMapper objectMapper,
                         PlatformTransactionManager txManager, Clock clock) {
        this.payouts = payouts;
        this.ledgerRepo = ledgerRepo;
        this.ledger = ledger;
        this.gateway = gateway;
        this.partners = partners;
        this.settings = settings;
        this.outbox = outbox;
        this.inbox = inbox;
        this.notifications = notifications;
        this.audit = audit;
        this.objectMapper = objectMapper;
        this.tx = new TransactionTemplate(txManager);
        this.clock = clock;
    }

    public record PayoutRequested(UUID payoutId) {
    }

    public record PayoutResponse(UUID id, UUID partnerId, LocalDate periodStart, LocalDate periodEnd, long amountPaise,
                                 Payout.Status status, String utr, String failureReason, Instant processedAt,
                                 Instant createdAt) {
    }

    public record LedgerEntryResponse(UUID id, LedgerEntry.Type type, long amountPaise, LocalDate earningDate,
                                      UUID orderId, String description, Instant createdAt) {
    }

    public record EarningsSummaryResponse(LocalDate from, LocalDate to, long earnedPaise, long balancePaise,
                                          List<DailyEarning> days, List<LedgerEntryResponse> entries) {
    }

    public record DailyEarning(LocalDate date, long amountPaise) {
    }

    public record AdjustmentRequest(@NotNull LocalDate date, long amountPaise, @NotBlank @Size(max = 300) String reason) {
    }

    public record PayoutRunResult(LocalDate periodEnd, int created, long totalPaise) {
    }

    // ---- Weekly run ----

    @Scheduled(cron = "${lunchbox.jobs.payout-cron}", zone = "Asia/Kolkata")
    @SchedulerLock(name = "weeklyPayouts", lockAtMostFor = "PT30M")
    public void scheduledRun() {
        run(TimeZones.todayIst(clock).minusDays(1));
    }

    public PayoutRunResult run(LocalDate periodEnd) {
        long min = settings.payRates().minPayoutPaise();
        int created = 0;
        long total = 0;
        for (PartnerDirectory.PartnerInfo partner : partners.payoutEligiblePartners()) {
            try {
                Long amount = tx.execute(s -> createPayout(partner.id(), periodEnd, min));
                if (amount != null && amount > 0) {
                    created++;
                    total += amount;
                }
            } catch (DataIntegrityViolationException e) {
                log.info("Payout for partner {} up to {} already exists", partner.id(), periodEnd);
            }
        }
        log.info("Payout run up to {}: {} payouts, {} paise", periodEnd, created, total);
        return new PayoutRunResult(periodEnd, created, total);
    }

    private long createPayout(UUID partnerId, LocalDate periodEnd, long minPaise) {
        long balance = ledgerRepo.balanceUpTo(partnerId, periodEnd);
        if (balance < minPaise) {
            return 0;
        }
        LocalDate periodStart = payouts.findFirstByPartnerIdOrderByPeriodEndDesc(partnerId)
                .map(p -> p.getPeriodEnd().plusDays(1))
                .or(() -> ledgerRepo.firstEarningDate(partnerId))
                .orElse(periodEnd);
        if (periodStart.isAfter(periodEnd)) {
            periodStart = periodEnd;
        }
        Payout payout = payouts.saveAndFlush(new Payout(partnerId, periodStart, periodEnd, balance));
        ledger.append(new EarningsLedger.Entry(partnerId, LedgerEntry.Type.PAYOUT, -balance, periodEnd, null, null,
                payout.getId(), "Payout " + periodStart + " – " + periodEnd, null, "PAYOUT:" + payout.getId()));
        outbox.publish("Payout", payout.getId(), Messaging.PAYOUT_REQUESTED, new PayoutRequested(payout.getId()));
        audit.record("payout.created", "Payout", payout.getId(), null, Map.of("partnerId", partnerId, "amountPaise", balance));
        return balance;
    }

    @RabbitListener(queues = Messaging.JOB_PAYOUT)
    public void submit(PayoutRequested job, @Header(Messaging.HEADER_EVENT_ID) String eventId) {
        Payout payout = payouts.findById(job.payoutId()).orElse(null);
        if (payout == null || payout.getStatus() != Payout.Status.PENDING) {
            return;
        }
        PartnerDirectory.PartnerInfo partner = partners.require(payout.getPartnerId());
        if (partner.payoutFundAccountId() == null) {
            tx.executeWithoutResult(s -> fail(payout.getId(), Payout.Status.FAILED, "No bank account linked"));
            return;
        }
        PayoutGateway.ProviderPayout result = gateway.createPayout(partner.payoutFundAccountId(), payout.getAmountPaise(),
                "payout_" + payout.getId(), payout.getId().toString());
        tx.executeWithoutResult(s -> payouts.findById(payout.getId()).ifPresent(p -> p.submitted(result.id())));
    }

    // ---- RazorpayX webhook ----

    @Transactional
    public void webhook(String rawBody, String signature, String eventIdHeader) {
        if (!gateway.verifyWebhookSignature(rawBody, signature)) {
            throw Errors.unauthorized("Invalid webhook signature.");
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(rawBody);
        } catch (Exception e) {
            throw Errors.badRequest("invalid_payload", "Malformed webhook payload.");
        }
        String event = root.path("event").asText();
        String eventId = eventIdHeader != null && !eventIdHeader.isBlank() ? eventIdHeader : Hmac.sha256Digest(rawBody);
        if (!inbox.accept("razorpayx", eventId, event, rawBody)) {
            return;
        }
        JsonNode entity = root.path("payload").path("payout").path("entity");
        String providerId = entity.path("id").asText();
        payouts.findByProviderPayoutId(providerId).ifPresent(p -> {
            switch (event) {
                case "payout.processed" -> {
                    if (p.processed(entity.path("utr").asText(null), clock.instant())) {
                        partners.find(p.getPartnerId()).ifPresent(partner -> notifications.notify(partner.userId(),
                                NotificationTemplate.PAYOUT_PROCESSED,
                                new Object[]{String.format("%.2f", p.getAmountPaise() / 100.0)},
                                Map.of("payoutId", p.getId().toString())));
                    }
                }
                case "payout.failed", "payout.rejected" -> fail(p.getId(), Payout.Status.FAILED,
                        entity.path("failure_reason").asText(entity.path("status_details").path("description").asText(event)));
                case "payout.reversed" -> fail(p.getId(), Payout.Status.REVERSED,
                        entity.path("status_details").path("description").asText("Reversed by bank"));
                default -> {
                }
            }
        });
        inbox.markProcessed("razorpayx", eventId);
    }

    private void fail(UUID payoutId, Payout.Status target, String reason) {
        Payout p = payouts.findById(payoutId).orElseThrow();
        if (p.failed(target, reason)) {
            ledger.append(new EarningsLedger.Entry(p.getPartnerId(), LedgerEntry.Type.PAYOUT_REVERSAL, p.getAmountPaise(),
                    TimeZones.todayIst(clock), null, null, p.getId(), "Payout " + target.name().toLowerCase() + ": " + reason,
                    null, "REVERSAL:" + p.getId()));
            audit.record("payout." + target.name().toLowerCase(), "Payout", p.getId(), null, Map.of("reason", reason));
        }
    }

    // ---- Partner views ----

    @Transactional(readOnly = true)
    public EarningsSummaryResponse earnings(UUID partnerUserId, LocalDate from, LocalDate to) {
        UUID partnerId = partners.requireWorkingPartner(partnerUserId).id();
        if (to.isBefore(from) || from.plusDays(93).isBefore(to)) {
            throw Errors.badRequest("invalid_range", "Choose a range of up to three months.");
        }
        List<LedgerEntry> entries = ledgerRepo.findByPartnerIdAndEarningDateBetweenOrderByCreatedAtDesc(partnerId, from, to);
        List<DailyEarning> days = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            final LocalDate day = d;
            long sum = entries.stream()
                    .filter(e -> e.getEarningDate().equals(day))
                    .filter(e -> e.getEntryType() != LedgerEntry.Type.PAYOUT && e.getEntryType() != LedgerEntry.Type.PAYOUT_REVERSAL)
                    .mapToLong(LedgerEntry::getAmountPaise).sum();
            days.add(new DailyEarning(day, sum));
        }
        long earned = ledgerRepo.earnedBetween(partnerId, from, to);
        long balance = ledgerRepo.balanceUpTo(partnerId, TimeZones.todayIst(clock));
        return new EarningsSummaryResponse(from, to, earned, balance, days,
                entries.stream().map(PayoutService::toEntry).toList());
    }

    @Transactional(readOnly = true)
    public EarningsSummaryResponse monthly(UUID partnerUserId, YearMonth month) {
        return earnings(partnerUserId, month.atDay(1), month.atEndOfMonth());
    }

    @Transactional(readOnly = true)
    public PageResponse<PayoutResponse> partnerPayouts(UUID partnerUserId, Integer page, Integer size) {
        UUID partnerId = partners.requireWorkingPartner(partnerUserId).id();
        return PageResponse.of(payouts.findByPartnerIdOrderByCreatedAtDesc(partnerId, Pagination.of(page, size, Sort.unsorted())),
                PayoutService::toResponse);
    }

    // ---- Admin ----

    @Transactional(readOnly = true)
    public PageResponse<PayoutResponse> adminPayouts(Payout.Status status, Integer page, Integer size) {
        var pageable = Pagination.of(page, size, Sort.unsorted());
        return PageResponse.of(status == null ? payouts.findAllByOrderByCreatedAtDesc(pageable)
                : payouts.findByStatusOrderByCreatedAtDesc(status, pageable), PayoutService::toResponse);
    }

    @Transactional
    public LedgerEntryResponse adjust(UUID partnerId, AdjustmentRequest request, CurrentUser admin) {
        partners.require(partnerId);
        if (request.amountPaise() == 0) {
            throw Errors.badRequest("zero_amount", "Adjustment amount cannot be zero.");
        }
        String key = "ADJUSTMENT:" + UUID.randomUUID();
        LedgerEntry.Type type = request.amountPaise() < 0 ? LedgerEntry.Type.PENALTY : LedgerEntry.Type.ADJUSTMENT;
        ledger.append(new EarningsLedger.Entry(partnerId, type, request.amountPaise(), request.date(), null, null, null,
                request.reason(), admin.userId(), key));
        audit.record("earnings.adjusted", "Partner", partnerId, null,
                Map.of("amountPaise", request.amountPaise(), "reason", request.reason()));
        return ledgerRepo.findByPartnerIdAndEarningDateBetweenOrderByCreatedAtDesc(partnerId, request.date(), request.date())
                .stream().filter(e -> key.equals(e.getDedupeKey())).findFirst().map(PayoutService::toEntry)
                .orElseThrow();
    }

    static PayoutResponse toResponse(Payout p) {
        return new PayoutResponse(p.getId(), p.getPartnerId(), p.getPeriodStart(), p.getPeriodEnd(), p.getAmountPaise(),
                p.getStatus(), p.getUtr(), p.getFailureReason(), p.getProcessedAt(), p.getCreatedAt());
    }

    static LedgerEntryResponse toEntry(LedgerEntry e) {
        return new LedgerEntryResponse(e.getId(), e.getEntryType(), e.getAmountPaise(), e.getEarningDate(), e.getOrderId(),
                e.getDescription(), e.getCreatedAt());
    }
}
