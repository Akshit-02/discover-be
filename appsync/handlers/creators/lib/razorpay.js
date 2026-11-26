const API = "https://api.razorpay.com/v1";

const authHeader = () => {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) throw new Error("Payments are not configured yet");
  return `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`;
};

/** Creates a Razorpay order. https://razorpay.com/docs/api/orders/create/ */
export const createRazorpayOrder = async ({ amount, currency, receipt, notes }) => {
  const response = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency, receipt, notes }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Don't leak gateway details to the client; the Lambda log keeps them.
    console.error("Razorpay order error", response.status, body?.error?.code, body?.error?.description);
    throw new Error("Couldn't start the payment. Please try again.");
  }
  return body;
};
