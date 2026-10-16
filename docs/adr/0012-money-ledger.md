# ADR-0012: Paise integers and an append-only earnings ledger

**Status:** Accepted

**Decision.** All money is `long` paise. Partner earnings are rows in `earnings_ledger`; a trigger forbids UPDATE and
DELETE and a CHECK enforces signs. Each row carries a business dedupe key (`DELIVERY:<order>`, `PAYOUT:<payout>`, …).
A payout and its negative `PAYOUT` row are written in one transaction; a failed or reversed payout adds a
`PAYOUT_REVERSAL`.

**Consequences.** A balance is always `SUM(amount_paise)`, replayed events cannot double-pay, and corrections are
explicit `ADJUSTMENT`/`PENALTY` rows with an audit entry.
