import type { CheckoutResponse } from '@lunchbox/api-client';
import RazorpayCheckout from 'react-native-razorpay';
import { api } from './api';
import { config } from './config';

/**
 * Pays what the backend opened and confirms it: a prepaid order (ADR-0018, `providerOrderId`) or an auto-debit
 * subscription mandate (`providerSubscriptionId`). Local builds with fake payments skip the Razorpay sheet.
 * Resolves once the backend has verified the payment signature.
 */
export async function payAndVerify(checkout: CheckoutResponse, brandColour: string): Promise<void> {
  let paymentId: string;
  let signature: string;
  if (config.useFakePayments) {
    const sim = checkout.providerOrderId
      ? await api.subscriptions.devSimulateOrderPayment(checkout.providerOrderId)
      : await api.subscriptions.devSimulateCharge(checkout.providerSubscriptionId!, checkout.amountPaise);
    paymentId = sim.razorpayPaymentId;
    signature = sim.razorpaySignature;
  } else {
    const result = await RazorpayCheckout.open({
      key: checkout.razorpayKeyId,
      ...(checkout.providerOrderId
        ? { order_id: checkout.providerOrderId, amount: checkout.amountPaise, currency: 'INR' }
        : { subscription_id: checkout.providerSubscriptionId }),
      name: 'LunchBox',
      description: checkout.planName,
      prefill: { name: checkout.prefillName ?? '', contact: checkout.prefillContact ?? '' },
      theme: { color: brandColour },
    });
    paymentId = result.razorpay_payment_id;
    signature = result.razorpay_signature;
  }
  await api.subscriptions.verify(checkout.subscriptionId, { razorpayPaymentId: paymentId, razorpaySignature: signature });
}
