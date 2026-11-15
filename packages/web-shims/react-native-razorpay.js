// Web stand-in for react-native-razorpay, used only by the browser preview. It opens Razorpay's official web
// checkout (same options, same result shape as the native SDK), so a test-mode payment can be made in the browser.
// The checkout script is Razorpay's own; nothing else is loaded from third parties.

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

function loadCheckout() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Payment needs a browser window.'));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay checkout did not load.')));
      script.onerror = () => {
        loading = null;
        reject(new Error('Could not reach Razorpay. Check your internet connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export default {
  /** Resolves with { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }, like the native SDK. */
  open(options) {
    return loadCheckout().then(
      (Razorpay) =>
        new Promise((resolve, reject) => {
          const checkout = new Razorpay({
            ...options,
            handler: (response) => resolve(response),
            modal: { ondismiss: () => reject(new Error('Payment was cancelled.')) },
          });
          checkout.on('payment.failed', (res) =>
            reject(new Error(res?.error?.description || 'The payment failed. No money was taken.')),
          );
          checkout.open();
        }),
    );
  },
};
