/** The package ships no typings; this covers the subscription checkout this app uses. */
declare module 'react-native-razorpay' {
  export interface CheckoutOptions {
    key: string;
    subscription_id?: string;
    order_id?: string;
    amount?: number;
    currency?: string;
    name?: string;
    description?: string;
    image?: string;
    prefill?: { name?: string; email?: string; contact?: string };
    notes?: Record<string, string>;
    theme?: { color?: string };
  }

  export interface CheckoutSuccess {
    razorpay_payment_id: string;
    razorpay_signature: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
  }

  const RazorpayCheckout: { open(options: CheckoutOptions): Promise<CheckoutSuccess> };
  export default RazorpayCheckout;
}
