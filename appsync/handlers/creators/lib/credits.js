import { randomUUID } from "node:crypto";
import {
  genericBatchGet,
  genericCreate,
  genericCreateIfNotExists,
  genericGet,
  genericTransactWrite,
} from "/opt/nodejs/dynamodb.js";
import { SIGNUP_CREDITS, signupExpiry, splitCost } from "../helper/credits.js";

const { CREDITS_TABLE, USERS_TABLE } = process.env;

const userKey = (userId) => `USER#${userId}`;
const walletKey = (userId) => ({ pk: userKey(userId), sk: "WALLET" });

export const getWallet = (userId) => genericGet({ tableName: CREDITS_TABLE, key: walletKey(userId) });

/** Returns the wallet, creating the signup grant for accounts that predate credits. */
export const ensureWallet = async (userId) => {
  const wallet = await getWallet(userId);
  if (wallet) return wallet;

  const user = await genericGet({ tableName: USERS_TABLE, key: { id: userId } });
  const now = new Date().toISOString();
  await genericCreateIfNotExists({
    tableName: CREDITS_TABLE,
    pkName: "pk",
    item: {
      ...walletKey(userId),
      userId,
      balance: SIGNUP_CREDITS,
      paidBalance: 0,
      granted: SIGNUP_CREDITS,
      expiresAt: signupExpiry(user?.createdAt || now),
      createdAt: now,
      updatedAt: now,
    },
  });
  return getWallet(userId);
};

/** Returns a Map of sk -> unlock item for the unlocks (out of `sks`) the user holds and that haven't expired. */
export const getActiveUnlocks = async (userId, sks) => {
  const items = await genericBatchGet({
    tableName: CREDITS_TABLE,
    keys: sks.map((sk) => ({ pk: userKey(userId), sk })),
  });
  const now = Date.now();
  return new Map(
    items.filter((i) => !i.expiresAt || Date.parse(i.expiresAt) > now).map((i) => [i.sk, i]),
  );
};

/**
 * Atomically deducts `cost`, records the unlock (with any extra `data`, e.g. the revealed value)
 * and a ledger row. `wallet` is a fresh read used to split the cost between free and paid credits;
 * the conditions re-check it, so a concurrent spend makes this return "conflict" (retry).
 * Returns "charged", "already_unlocked", "insufficient" or "conflict".
 */
export const chargeForUnlock = async ({ userId, wallet, sk, cost, reason, ref, expiresAt, data = {} }) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const split = splitCost(wallet, cost, now);
  if (!split) return "insufficient";
  const { fromFree, fromPaid } = split;
  const walletConditions = ["balance >= :fromFree"];
  if (fromFree > 0) walletConditions.push("expiresAt > :now");
  if (fromPaid > 0) walletConditions.push("paidBalance >= :fromPaid");
  const pk = userKey(userId);
  const unlock = {
    ...data,
    pk,
    sk,
    reason,
    ref,
    cost,
    createdAt: nowIso,
    ...(expiresAt && { expiresAt, ttl: Math.floor(Date.parse(expiresAt) / 1000) }),
  };

  try {
    await genericTransactWrite({
      items: [
        {
          Update: {
            TableName: CREDITS_TABLE,
            Key: walletKey(userId),
            UpdateExpression:
              "SET balance = balance - :fromFree, paidBalance = if_not_exists(paidBalance, :zero) - :fromPaid, updatedAt = :now",
            ConditionExpression: walletConditions.join(" AND "),
            ExpressionAttributeValues: { ":fromFree": fromFree, ":fromPaid": fromPaid, ":zero": 0, ":now": nowIso },
          },
        },
        {
          Put: {
            TableName: CREDITS_TABLE,
            Item: unlock,
            // Expired unlocks (e.g. filter sets) may be bought again.
            ConditionExpression: "attribute_not_exists(pk) OR expiresAt <= :now",
            ExpressionAttributeValues: { ":now": nowIso },
          },
        },
        {
          Put: {
            TableName: CREDITS_TABLE,
            Item: {
              pk,
              sk: `TXN#${nowIso}#${randomUUID()}`,
              amount: -cost,
              fromFree,
              fromPaid,
              reason,
              ref,
              createdAt: nowIso,
            },
          },
        },
      ],
    });
    return "charged";
  } catch (error) {
    if (error.name !== "TransactionCanceledException") throw error;
    const reasons = error.CancellationReasons || [];
    // A concurrent request already unlocked it: nothing to pay.
    if (reasons[1]?.Code === "ConditionalCheckFailed") return "already_unlocked";
    if (reasons[0]?.Code === "ConditionalCheckFailed") return "conflict";
    throw error;
  }
};

const orderKey = (userId, orderId) => ({ pk: userKey(userId), sk: `ORDER#${orderId}` });

export const getOrder = (userId, orderId) => genericGet({ tableName: CREDITS_TABLE, key: orderKey(userId, orderId) });

export const createOrderRecord = (order) =>
  genericCreate({ tableName: CREDITS_TABLE, item: { ...orderKey(order.userId, order.orderId), ...order } });

/**
 * Marks a CREATED order PAID and adds its credits to the non-expiring paid balance, in one
 * transaction. Safe to call twice (browser verify + webhook): returns "fulfilled" once,
 * then "already_paid". Returns "not_found" for unknown orders.
 */
export const fulfilOrder = async ({ userId, orderId, paymentId, source }) => {
  const order = await getOrder(userId, orderId);
  if (!order) return { outcome: "not_found" };
  if (order.status === "PAID") return { outcome: "already_paid", order };

  await ensureWallet(userId);
  const nowIso = new Date().toISOString();
  try {
    await genericTransactWrite({
      items: [
        {
          Update: {
            TableName: CREDITS_TABLE,
            Key: orderKey(userId, orderId),
            UpdateExpression: "SET #status = :paid, paymentId = :paymentId, paidAt = :now, paidVia = :source",
            ConditionExpression: "#status = :created",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":paid": "PAID",
              ":created": "CREATED",
              ":paymentId": paymentId,
              ":now": nowIso,
              ":source": source,
            },
          },
        },
        {
          Update: {
            TableName: CREDITS_TABLE,
            Key: walletKey(userId),
            UpdateExpression: "SET paidBalance = if_not_exists(paidBalance, :zero) + :credits, updatedAt = :now",
            ExpressionAttributeValues: { ":credits": order.credits, ":zero": 0, ":now": nowIso },
          },
        },
        {
          Put: {
            TableName: CREDITS_TABLE,
            Item: {
              pk: userKey(userId),
              sk: `TXN#${nowIso}#${randomUUID()}`,
              amount: order.credits,
              reason: "PURCHASE",
              ref: orderId,
              packId: order.packId,
              amountPaise: order.amountPaise,
              paymentId,
              createdAt: nowIso,
            },
          },
        },
      ],
    });
    return { outcome: "fulfilled", order };
  } catch (error) {
    if (error.name === "TransactionCanceledException" && error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") {
      return { outcome: "already_paid", order };
    }
    throw error;
  }
};
