import { createHmac, timingSafeEqual } from "node:crypto";

// Source of truth for what a pack costs and grants. Keep the frontend's display copy in sync
// (src/lib/constants/creditPacks.ts); the price charged always comes from here.
export const CREDIT_PACKS = {
  starter: { id: "starter", name: "Starter", credits: 50, amountPaise: 24900 },
  growth: { id: "growth", name: "Growth", credits: 150, amountPaise: 59900 },
  pro: { id: "pro", name: "Pro", credits: 400, amountPaise: 139900 },
  agency: { id: "agency", name: "Agency", credits: 1000, amountPaise: 299900 },
};
export const CURRENCY = "INR";

export const getPack = (packId) => {
  const pack = CREDIT_PACKS[String(packId || "").toLowerCase()];
  if (!pack) throw new Error("Unknown credit pack");
  return pack;
};

const safeEqualHex = (expected, actual) => {
  if (typeof actual !== "string" || !/^[0-9a-f]+$/i.test(actual)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Checkout success signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
export const isValidPaymentSignature = ({ orderId, paymentId, signature, secret }) =>
  Boolean(secret) &&
  safeEqualHex(createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"), signature);

/** Webhook signature: HMAC-SHA256(raw request body, webhook_secret). */
export const isValidWebhookSignature = ({ body, signature, secret }) =>
  Boolean(secret) && safeEqualHex(createHmac("sha256", secret).update(body).digest("hex"), signature);

export const ORDER_ID_RE = /^order_[A-Za-z0-9]{6,40}$/;
export const PAYMENT_ID_RE = /^pay_[A-Za-z0-9]{6,40}$/;
