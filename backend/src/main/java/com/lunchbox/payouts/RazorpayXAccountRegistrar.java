package com.lunchbox.payouts;

import com.lunchbox.dispatch.PayoutAccountRegistrar;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
class RazorpayXAccountRegistrar implements PayoutAccountRegistrar {

    private final PayoutGateway gateway;

    RazorpayXAccountRegistrar(PayoutGateway gateway) {
        this.gateway = gateway;
    }

    @Override
    public Registered register(UUID partnerId, String name, String phone, String accountHolder, String accountNumber,
                               String ifsc) {
        String contactId = gateway.createContact(name, phone, "partner_" + partnerId);
        String fundAccountId = gateway.createBankFundAccount(contactId, accountHolder, accountNumber, ifsc);
        return new Registered(contactId, fundAccountId);
    }
}
