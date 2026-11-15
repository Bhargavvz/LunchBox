package com.lunchbox.payouts;

import com.lunchbox.common.error.Errors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * {@code razorpayx.mode=off}: no payout provider. Earnings are still recorded in the ledger, but nothing pretends to
 * pay anyone: linking a bank account or running payouts is refused, and riders are paid by hand (recorded as an
 * adjustment). Allowed in production, unlike the sandbox fake.
 */
@Component
@ConditionalOnProperty(name = "lunchbox.integrations.razorpayx.mode", havingValue = "off")
class DisabledPayoutGateway implements PayoutGateway {

    static final String MESSAGE = "Automatic payouts are switched off. Pay riders by hand and record it as an adjustment.";

    @Override
    public String createContact(String name, String phone, String reference) {
        throw Errors.unprocessable("payouts_off", MESSAGE);
    }

    @Override
    public String createBankFundAccount(String contactId, String accountHolder, String accountNumber, String ifsc) {
        throw Errors.unprocessable("payouts_off", MESSAGE);
    }

    @Override
    public ProviderPayout createPayout(String fundAccountId, long amountPaise, String reference, String idempotencyKey) {
        throw Errors.unprocessable("payouts_off", MESSAGE);
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signature) {
        return false;
    }
}
