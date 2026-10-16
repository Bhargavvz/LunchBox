package com.lunchbox.payouts;

/** RazorpayX Payouts behind an interface. */
public interface PayoutGateway {

    String createContact(String name, String phone, String reference);

    String createBankFundAccount(String contactId, String accountHolder, String accountNumber, String ifsc);

    /** @param idempotencyKey sent as X-Payout-Idempotency so retries never pay twice */
    ProviderPayout createPayout(String fundAccountId, long amountPaise, String reference, String idempotencyKey);

    boolean verifyWebhookSignature(String rawBody, String signature);

    record ProviderPayout(String id, String status) {
    }
}
