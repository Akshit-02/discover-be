// Razorpay webhook (Lambda function URL). Fulfils orders whose browser-side verification never
// ran, e.g. the user closed the tab right after paying. Subscribe to the `order.paid` event.
import Logger from "/opt/nodejs/logger.js";
import { fulfilOrder } from "./lib/credits.js";
import { ORDER_ID_RE, PAYMENT_ID_RE, isValidWebhookSignature } from "./helper/payments.js";

const reply = (statusCode, body = "ok") => ({ statusCode, body });

export const handler = async (event) => {
  const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));

  if (!isValidWebhookSignature({ body, signature: headers["x-razorpay-signature"], secret: process.env.RAZORPAY_WEBHOOK_SECRET })) {
    return reply(400, "invalid signature");
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return reply(400, "invalid json");
  }
  if (payload.event !== "order.paid") return reply(200, "ignored");

  const order = payload.payload?.order?.entity;
  const payment = payload.payload?.payment?.entity;
  const userId = order?.notes?.userId;
  if (!userId || !ORDER_ID_RE.test(order?.id || "") || !PAYMENT_ID_RE.test(payment?.id || "")) {
    Logger.error("Webhook missing order data", { orderId: order?.id });
    return reply(200, "ignored");
  }

  // Non-2xx makes Razorpay retry, which is what we want for transient failures.
  const { outcome } = await fulfilOrder({ userId, orderId: order.id, paymentId: payment.id, source: "WEBHOOK" });
  Logger.log("Webhook order.paid", { orderId: order.id, outcome });
  return reply(200, outcome);
};
