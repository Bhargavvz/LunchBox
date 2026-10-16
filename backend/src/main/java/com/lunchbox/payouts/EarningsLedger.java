package com.lunchbox.payouts;

import com.lunchbox.common.persistence.UuidV7;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;

/**
 * The only writer of {@code earnings_ledger}. Entries are append-only (a DB trigger forbids UPDATE/DELETE) and
 * idempotent: each carries a business dedupe key (e.g. {@code DELIVERY:<orderId>}) with a unique constraint, so
 * replayed events never pay twice.
 */
@Component
public class EarningsLedger {

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public EarningsLedger(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public record Entry(UUID partnerId, LedgerEntry.Type type, long amountPaise, LocalDate earningDate, UUID orderId,
                        UUID routeId, UUID payoutId, String description, UUID createdBy, String dedupeKey) {
    }

    /** @return true if the entry was written, false if it already existed (or the amount is zero). */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean append(Entry e) {
        if (e.amountPaise() == 0) {
            return false;
        }
        return jdbc.update("""
                INSERT INTO earnings_ledger (id, partner_id, entry_type, amount_paise, earning_date, order_id, route_id,
                                             payout_id, description, created_by, dedupe_key, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (dedupe_key) DO NOTHING
                """, UuidV7.generate(), e.partnerId(), e.type().name(), e.amountPaise(), e.earningDate(), e.orderId(),
                e.routeId(), e.payoutId(), e.description(), e.createdBy(), e.dedupeKey(),
                Timestamp.from(clock.instant())) == 1;
    }
}
