package com.lunchbox.payouts;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lunchbox.audit.AuditService;
import com.lunchbox.common.error.ApiException;
import com.lunchbox.common.messaging.Messaging;
import com.lunchbox.common.outbox.OutboxPublisher;
import com.lunchbox.common.settings.PlatformSettings;
import com.lunchbox.common.settings.PlatformSettings.PayRates;
import com.lunchbox.dispatch.PartnerDirectory;
import com.lunchbox.dispatch.PartnerDirectory.PartnerInfo;
import com.lunchbox.notifications.NotificationService;
import com.lunchbox.notifications.NotificationTemplate;
import com.lunchbox.payments.WebhookInbox;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PayoutServiceTest {

    private static final LocalDate PERIOD_END = LocalDate.of(2026, 10, 18);
    private static final long MIN_PAYOUT = 50_000;

    private final PayoutRepository payouts = mock(PayoutRepository.class);
    private final LedgerRepository ledgerRepo = mock(LedgerRepository.class);
    private final EarningsLedger ledger = mock(EarningsLedger.class);
    private final PayoutGateway gateway = mock(PayoutGateway.class);
    private final PartnerDirectory partners = mock(PartnerDirectory.class);
    private final PlatformSettings settings = mock(PlatformSettings.class);
    private final OutboxPublisher outbox = mock(OutboxPublisher.class);
    private final WebhookInbox inbox = mock(WebhookInbox.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
    private final PayoutService service = new PayoutService(payouts, ledgerRepo, ledger, gateway, partners, settings,
            outbox, inbox, notifications, mock(AuditService.class), new ObjectMapper(), txManager,
            Clock.fixed(Instant.parse("2026-10-19T03:00:00Z"), ZoneOffset.UTC));

    private final PartnerInfo partner = new PartnerInfo(UUID.randomUUID(), UUID.randomUUID(), "Ravi", null, null, null,
            5, null, 5000, null, true, null, null, "fa_123");

    @BeforeEach
    void setUp() {
        when(txManager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(settings.payRates()).thenReturn(new PayRates(30_000, 2_500, 500, 1_000, 5_000, 20_000, MIN_PAYOUT));
        when(partners.payoutEligiblePartners()).thenReturn(List.of(partner));
        when(partners.require(partner.id())).thenReturn(partner);
        when(partners.find(partner.id())).thenReturn(Optional.of(partner));
        when(payouts.saveAndFlush(any(Payout.class))).thenAnswer(inv -> {
            Payout p = inv.getArgument(0);
            ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
            return p;
        });
        when(gateway.verifyWebhookSignature(anyString(), eq("sig"))).thenReturn(true);
        when(inbox.accept(anyString(), anyString(), anyString(), anyString())).thenReturn(true);
    }

    @Test
    void movesTheWholeBalanceIntoAPayoutAndDebitsTheLedgerInTheSameTransaction() {
        when(ledgerRepo.balanceUpTo(partner.id(), PERIOD_END)).thenReturn(123_450L);
        when(ledgerRepo.firstEarningDate(partner.id())).thenReturn(Optional.of(LocalDate.of(2026, 10, 12)));

        PayoutService.PayoutRunResult result = service.run(PERIOD_END);

        assertThat(result.created()).isEqualTo(1);
        assertThat(result.totalPaise()).isEqualTo(123_450L);
        ArgumentCaptor<EarningsLedger.Entry> entry = ArgumentCaptor.forClass(EarningsLedger.Entry.class);
        verify(ledger).append(entry.capture());
        assertThat(entry.getValue().type()).isEqualTo(LedgerEntry.Type.PAYOUT);
        assertThat(entry.getValue().amountPaise()).isEqualTo(-123_450L);
        assertThat(entry.getValue().dedupeKey()).startsWith("PAYOUT:");
        verify(outbox).publish(eq("Payout"), any(), eq(Messaging.PAYOUT_REQUESTED), any());
    }

    @Test
    void skipsBalancesBelowTheMinimum() {
        when(ledgerRepo.balanceUpTo(partner.id(), PERIOD_END)).thenReturn(MIN_PAYOUT - 1);

        assertThat(service.run(PERIOD_END).created()).isZero();
        verify(payouts, never()).saveAndFlush(any());
        verify(ledger, never()).append(any());
    }

    @Test
    void nextPeriodStartsTheDayAfterThePreviousPayout() {
        when(ledgerRepo.balanceUpTo(partner.id(), PERIOD_END)).thenReturn(80_000L);
        Payout previous = payout(PayoutStatusFixture.PROCESSED);
        ReflectionTestUtils.setField(previous, "periodEnd", LocalDate.of(2026, 10, 11));
        when(payouts.findFirstByPartnerIdOrderByPeriodEndDesc(partner.id())).thenReturn(Optional.of(previous));

        service.run(PERIOD_END);

        ArgumentCaptor<Payout> saved = ArgumentCaptor.forClass(Payout.class);
        verify(payouts).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getPeriodStart()).isEqualTo(LocalDate.of(2026, 10, 12));
    }

    @Test
    void submitsWithThePayoutIdAsIdempotencyKey() {
        Payout pending = payout(PayoutStatusFixture.PENDING);
        when(payouts.findById(pending.getId())).thenReturn(Optional.of(pending));
        when(gateway.createPayout(any(), anyLong(), any(), any())).thenReturn(new PayoutGateway.ProviderPayout("pout_1", "processing"));

        service.submit(new PayoutService.PayoutRequested(pending.getId()), UUID.randomUUID().toString());

        verify(gateway).createPayout("fa_123", pending.getAmountPaise(), "payout_" + pending.getId(), pending.getId().toString());
        assertThat(pending.getStatus()).isEqualTo(Payout.Status.PROCESSING);
        assertThat(pending.getProviderPayoutId()).isEqualTo("pout_1");
    }

    @Test
    void neverResubmitsAPayoutThatLeftPending() {
        Payout processing = payout(PayoutStatusFixture.PROCESSING);
        when(payouts.findById(processing.getId())).thenReturn(Optional.of(processing));

        service.submit(new PayoutService.PayoutRequested(processing.getId()), UUID.randomUUID().toString());

        verify(gateway, never()).createPayout(any(), anyLong(), any(), any());
    }

    @Test
    void processedWebhookMarksPaidAndNotifiesThePartner() {
        Payout p = submitted();

        service.webhook(event("payout.processed", "\"utr\":\"UTR123\""), "sig", "evt_1");

        assertThat(p.getStatus()).isEqualTo(Payout.Status.PROCESSED);
        assertThat(p.getUtr()).isEqualTo("UTR123");
        verify(notifications).notify(eq(partner.userId()), eq(NotificationTemplate.PAYOUT_PROCESSED), any(), anyMap());
    }

    @Test
    void failureCreditsTheBalanceBackExactlyOnce() {
        Payout p = submitted();

        service.webhook(event("payout.failed", "\"failure_reason\":\"Invalid IFSC\""), "sig", "evt_1");
        service.webhook(event("payout.reversed", ""), "sig", "evt_2");

        assertThat(p.getStatus()).isEqualTo(Payout.Status.FAILED);
        ArgumentCaptor<EarningsLedger.Entry> entry = ArgumentCaptor.forClass(EarningsLedger.Entry.class);
        verify(ledger, times(1)).append(entry.capture());
        assertThat(entry.getValue().type()).isEqualTo(LedgerEntry.Type.PAYOUT_REVERSAL);
        assertThat(entry.getValue().amountPaise()).isEqualTo(p.getAmountPaise());
    }

    @Test
    void lateProcessedEventDoesNotResurrectAReversedPayout() {
        Payout p = submitted();

        service.webhook(event("payout.reversed", ""), "sig", "evt_1");
        service.webhook(event("payout.processed", "\"utr\":\"UTR123\""), "sig", "evt_2");

        assertThat(p.getStatus()).isEqualTo(Payout.Status.REVERSED);
        verify(notifications, never()).notify(any(), any(), any(), anyMap());
    }

    @Test
    void rejectsUnsignedWebhooks() {
        assertThatThrownBy(() -> service.webhook(event("payout.processed", ""), "forged", "evt_1"))
                .isInstanceOf(ApiException.class);
        verify(inbox, never()).accept(anyString(), anyString(), anyString(), anyString());
    }

    // ---- fixtures ----

    private enum PayoutStatusFixture { PENDING, PROCESSING, PROCESSED }

    private Payout payout(PayoutStatusFixture status) {
        Payout p = new Payout(partner.id(), LocalDate.of(2026, 10, 12), PERIOD_END, 75_000);
        ReflectionTestUtils.setField(p, "id", UUID.randomUUID());
        switch (status) {
            case PROCESSING -> p.submitted("pout_1");
            case PROCESSED -> {
                p.submitted("pout_1");
                p.processed("UTR0", Instant.EPOCH);
            }
            default -> {
            }
        }
        return p;
    }

    private Payout submitted() {
        Payout p = payout(PayoutStatusFixture.PROCESSING);
        when(payouts.findByProviderPayoutId("pout_1")).thenReturn(Optional.of(p));
        when(payouts.findById(p.getId())).thenReturn(Optional.of(p));
        return p;
    }

    private static String event(String type, String extraEntityFields) {
        String extra = extraEntityFields.isEmpty() ? "" : "," + extraEntityFields;
        return "{\"event\":\"" + type + "\",\"payload\":{\"payout\":{\"entity\":{\"id\":\"pout_1\"" + extra + "}}}}";
    }
}
