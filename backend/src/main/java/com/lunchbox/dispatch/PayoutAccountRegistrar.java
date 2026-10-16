package com.lunchbox.dispatch;

import java.util.UUID;

/** Implemented by the payouts module: registers a partner's bank account with the payout provider (RazorpayX). */
public interface PayoutAccountRegistrar {

    Registered register(UUID partnerId, String name, String phone, String accountHolder, String accountNumber, String ifsc);

    record Registered(String contactId, String fundAccountId) {
    }
}
