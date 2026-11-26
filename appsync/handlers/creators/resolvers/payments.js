import { genericGet } from "/opt/nodejs/dynamodb.js";
import { createOrderRecord, fulfilOrder, getWallet } from "../lib/credits.js";
import { createRazorpayOrder } from "../lib/razorpay.js";
import { toCreditBalance } from "../helper/credits.js";
import {
  CURRENCY,
  ORDER_ID_RE,
  PAYMENT_ID_RE,
  getPack,
  isValidPaymentSignature,
} from "../helper/payments.js";
import { requireUserId } from "./credits.js";

/** Creates a Razorpay order for a pack; the client opens Checkout with it. */
export const createCreditOrderHandler = async (event) => {
  const userId = requireUserId(event);
  const pack = getPack(event.arguments.packId);

  const order = await createRazorpayOrder({
    amount: pack.amountPaise,
    currency: CURRENCY,
    receipt: `kz_${Date.now().toString(36)}_${userId.slice(0, 8)}`,
    // Notes come back on the order.paid webhook, which is how it finds the user.
    notes: { userId, packId: pack.id, credits: String(pack.credits) },
  });

  const now = new Date().toISOString();
  await createOrderRecord({
    userId,
    orderId: order.id,
    packId: pack.id,
    packName: pack.name,
    credits: pack.credits,
    amountPaise: pack.amountPaise,
    currency: CURRENCY,
    status: "CREATED",
    createdAt: now,
  });

  const user = await genericGet({ tableName: process.env.USERS_TABLE, key: { id: userId } });
  return {
    orderId: order.id,
    amount: pack.amountPaise,
    currency: CURRENCY,
    keyId: process.env.RAZORPAY_KEY_ID,
    packId: pack.id,
    packName: pack.name,
    credits: pack.credits,
    prefillName: user?.name || null,
    prefillEmail: user?.email || event.identity?.claims?.email || null,
    prefillContact: user?.phone || null,
  };
};

/** Verifies the Checkout success signature and adds the credits (idempotent with the webhook). */
export const verifyCreditPaymentHandler = async (event) => {
  const userId = requireUserId(event);
  const { orderId, paymentId, signature } = event.arguments;
  if (!ORDER_ID_RE.test(orderId || "") || !PAYMENT_ID_RE.test(paymentId || "")) {
    throw new Error("Payment verification failed");
  }
  if (!isValidPaymentSignature({ orderId, paymentId, signature, secret: process.env.RAZORPAY_KEY_SECRET })) {
    throw new Error("Payment verification failed");
  }

  // The order is read under the caller's own key, so one user can't claim another's order.
  const { outcome, order } = await fulfilOrder({ userId, orderId, paymentId, source: "CHECKOUT" });
  if (outcome === "not_found") throw new Error("Payment verification failed");

  return {
    orderId,
    packId: order.packId,
    packName: order.packName,
    creditsAdded: order.credits,
    alreadyProcessed: outcome === "already_paid",
    credits: toCreditBalance(await getWallet(userId)),
  };
};
