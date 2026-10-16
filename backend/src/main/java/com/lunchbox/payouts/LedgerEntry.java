package com.lunchbox.payouts;

import com.lunchbox.common.persistence.UuidV7Id;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Read-only view of the append-only {@code earnings_ledger}; rows are written by {@link EarningsLedger}. */
@Getter
@Entity
@Immutable
@Table(name = "earnings_ledger")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LedgerEntry {

    public enum Type { BASE_DAY, DELIVERY, DISTANCE, INCENTIVE, PENALTY, ADJUSTMENT, PAYOUT, PAYOUT_REVERSAL }

    @Id
    @UuidV7Id
    private UUID id;

    @Column(name = "partner_id")
    private UUID partnerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type")
    private Type entryType;

    @Column(name = "amount_paise")
    private long amountPaise;

    @Column(name = "earning_date")
    private LocalDate earningDate;

    @Column(name = "order_id")
    private UUID orderId;

    @Column(name = "route_id")
    private UUID routeId;

    @Column(name = "payout_id")
    private UUID payoutId;

    private String description;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "dedupe_key")
    private String dedupeKey;

    @Column(name = "created_at")
    private Instant createdAt;
}
