import { randomUUID } from "node:crypto";
import {
  genericBatchGet,
  genericCreateIfNotExists,
  genericGet,
  genericTransactWrite,
} from "/opt/nodejs/dynamodb.js";
import { SIGNUP_CREDITS, signupExpiry } from "../helper/credits.js";

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
 * and a ledger row. Returns "charged", "already_unlocked" or "insufficient".
 */
export const chargeForUnlock = async ({ userId, sk, cost, reason, ref, expiresAt, data = {} }) => {
  const now = new Date();
  const nowIso = now.toISOString();
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
            UpdateExpression: "SET balance = balance - :cost, updatedAt = :now",
            ConditionExpression: "balance >= :cost AND expiresAt > :now",
            ExpressionAttributeValues: { ":cost": cost, ":now": nowIso },
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
    if (reasons[0]?.Code === "ConditionalCheckFailed") return "insufficient";
    throw error;
  }
};
