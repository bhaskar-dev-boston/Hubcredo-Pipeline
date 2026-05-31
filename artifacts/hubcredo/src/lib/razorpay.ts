export interface RazorpayOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  user_name: string;
  user_email: string;
}

export function openRazorpayCheckout(orderData: RazorpayOrderResponse & {
  description: string;
  onSuccess: (response: RazorpayPaymentResponse) => void;
  onFailure: () => void;
}) {
  const options = {
    key: orderData.key_id,
    amount: orderData.amount,
    currency: orderData.currency,
    name: "HubCredo",
    description: orderData.description,
    order_id: orderData.order_id,
    prefill: { name: orderData.user_name, email: orderData.user_email },
    theme: { color: "#6366f1" },
    handler: orderData.onSuccess,
    modal: { ondismiss: orderData.onFailure },
  };
  const rzp = new (window as any).Razorpay(options);
  rzp.open();
}

export interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
