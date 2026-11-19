// Razorpay Standard Checkout for subscriptions, loaded only by the billing page.
// https://razorpay.com/docs/payments/subscriptions/integration-guide/
type Checkout = new (options: {
  key: string;
  subscription_id: string;
  /** 1 opens Razorpay's card change for a subscription instead of a payment. */
  subscription_card_change?: 0 | 1;
  name: string;
  description: string;
  handler: () => void;
  modal: { ondismiss: () => void };
}) => { open: () => void };
declare global {
  interface Window {
    Razorpay?: Checkout;
  }
}
let loading: Promise<Checkout> | undefined;
export function loadCheckout() {
  loading ??= new Promise<Checkout>((resolve, reject) => {
    const script = document.createElement('script');
    // A failed or stalled load can be retried; the page never waits forever.
    const fail = () => {
      clearTimeout(timer);
      loading = undefined;
      script.remove();
      reject(Error());
    };
    const timer = setTimeout(fail, 15000);
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      clearTimeout(timer);
      if (window.Razorpay) resolve(window.Razorpay);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}
