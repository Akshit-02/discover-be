import { getCreatorById } from "../lib/creators.js";
import { chargeForUnlock, ensureWallet, getActiveUnlocks, getWallet } from "../lib/credits.js";
import { toCreator } from "../helper/creators.js";
import {
  CONTACT_FIELDS,
  COSTS,
  FILTER_UNLOCK_HOURS,
  InsufficientCreditsError,
  advancedFilterKey,
  toCreditBalance,
  unlockSk,
} from "../helper/credits.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const requireUserId = (event) => {
  const userId = event.identity?.sub;
  if (!userId) throw new Error("Unauthorized");
  return userId;
};

const requireCreator = async (id) => {
  if (!UUID_RE.test(String(id || ""))) throw new Error("Invalid creator id");
  const row = await getCreatorById(id);
  if (!row) throw new Error("Creator not found");
  return row;
};

const contactValue = (row, field) => {
  const value = row[CONTACT_FIELDS[field].column];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

/** The value the user paid for (stored on the unlock); falls back to the current row for older unlocks. */
const revealedValue = (unlock, row, field) => unlock?.value || contactValue(row, field);

/** Charges `cost` unless `sk` is already unlocked. Returns the credits actually charged. */
const spend = async ({ userId, sk, cost, reason, ref, expiresAt, unlocked, data }) => {
  if (unlocked) return 0;
  const wallet = await ensureWallet(userId);
  const outcome = await chargeForUnlock({ userId, sk, cost, reason, ref, expiresAt, data });
  if (outcome === "insufficient") {
    const { balance, expired } = toCreditBalance(wallet);
    throw new InsufficientCreditsError({ required: cost, balance, expired });
  }
  return outcome === "charged" ? cost : 0;
};

const currentBalance = async (userId) => toCreditBalance(await getWallet(userId));

export const myCreditsHandler = async (event) => {
  const userId = requireUserId(event);
  return toCreditBalance(await ensureWallet(userId));
};

/** Charges once per creator; re-opening a profile is free. Returns already-revealed contacts too. */
export const openCreatorProfileHandler = async (event) => {
  const userId = requireUserId(event);
  const row = await requireCreator(event.arguments.id);
  const keys = {
    profile: unlockSk("PROFILE", row.id),
    email: unlockSk("EMAIL", row.id),
    phone: unlockSk("PHONE", row.id),
  };
  const unlocks = await getActiveUnlocks(userId, Object.values(keys));

  const charged = await spend({
    userId,
    sk: keys.profile,
    cost: COSTS.openProfile,
    reason: "OPEN_PROFILE",
    ref: row.id,
    unlocked: unlocks.has(keys.profile),
  });

  const emailRevealed = unlocks.has(keys.email);
  const phoneRevealed = unlocks.has(keys.phone);
  return {
    creator: toCreator(row),
    email: emailRevealed ? revealedValue(unlocks.get(keys.email), row, "EMAIL") : null,
    phone: phoneRevealed ? revealedValue(unlocks.get(keys.phone), row, "PHONE") : null,
    emailRevealed,
    phoneRevealed,
    charged,
    credits: await currentBalance(userId),
  };
};

/** Reveals an email/phone. Missing contacts and repeat reveals are free. */
export const revealCreatorContactHandler = async (event) => {
  const userId = requireUserId(event);
  const { creatorId, field } = event.arguments;
  const config = CONTACT_FIELDS[field];
  if (!config) throw new Error("Invalid contact field");

  const row = await requireCreator(creatorId);
  const sk = unlockSk(config.unlock, row.id);
  const unlocks = await getActiveUnlocks(userId, [sk]);

  // Already revealed by this user: return the stored value, never charge again.
  const existing = unlocks.get(sk);
  if (existing) {
    const value = revealedValue(existing, row, field);
    return { creatorId: row.id, field, available: Boolean(value), value, charged: 0, credits: await currentBalance(userId) };
  }

  const value = contactValue(row, field);
  const base = { creatorId: row.id, field, available: Boolean(value), value };
  if (!value) return { ...base, charged: 0, credits: toCreditBalance(await ensureWallet(userId)) };

  const charged = await spend({
    userId,
    sk,
    cost: config.cost,
    reason: `REVEAL_${field}`,
    ref: row.id,
    unlocked: false,
    data: { kind: config.unlock, creatorId: row.id, username: row.username, value },
  });
  return { ...base, charged, credits: await currentBalance(userId) };
};

/**
 * Charges for an advanced filter set once per FILTER_UNLOCK_HOURS. Returns null when the
 * filter has no advanced part, else { charged, credits }.
 */
export const chargeAdvancedFilter = async (userId, normalizedFilter) => {
  const key = advancedFilterKey(normalizedFilter);
  if (!key) return null;
  const sk = unlockSk("FILTER", key);
  const unlocks = await getActiveUnlocks(userId, [sk]);
  const charged = await spend({
    userId,
    sk,
    cost: COSTS.advancedFilter,
    reason: "ADVANCED_FILTER",
    ref: key,
    expiresAt: new Date(Date.now() + FILTER_UNLOCK_HOURS * 3_600_000).toISOString(),
    unlocked: unlocks.has(sk),
  });
  return { charged, credits: await currentBalance(userId) };
};
