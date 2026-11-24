import { createHash } from "node:crypto";

export const SIGNUP_CREDITS = 50;
export const SIGNUP_CREDIT_DAYS = 30;
// Re-running the same advanced filter set (paging, sorting, search) is free for this long.
export const FILTER_UNLOCK_HOURS = 24;

export const COSTS = {
  advancedFilter: 2,
  revealEmail: 1,
  revealPhone: 2,
  openProfile: 1,
};

export const CONTACT_FIELDS = {
  EMAIL: { column: "email", cost: COSTS.revealEmail, unlock: "EMAIL" },
  PHONE: { column: "phone", cost: COSTS.revealPhone, unlock: "PHONE" },
};

export const unlockSk = (kind, ref) => `UNLOCK#${kind}#${ref}`;

/** Thrown when an action costs more than the caller can spend. */
export class InsufficientCreditsError extends Error {
  constructor({ required, balance, expired }) {
    super(
      expired
        ? "Your credits have expired. Top up to keep using this feature."
        : `This needs ${required} credit${required === 1 ? "" : "s"} and you have ${balance}. Top up to continue.`,
    );
    this.name = "InsufficientCredits";
    this.info = { required, balance, expired };
  }
}

export const signupExpiry = (createdAt) => {
  const start = Date.parse(createdAt);
  const base = Number.isFinite(start) ? start : Date.now();
  return new Date(base + SIGNUP_CREDIT_DAYS * 86_400_000).toISOString();
};

export const isExpired = (wallet, now = new Date()) =>
  !wallet?.expiresAt || Date.parse(wallet.expiresAt) <= now.getTime();

export const toCreditBalance = (wallet, now = new Date()) => {
  const expired = isExpired(wallet, now);
  return {
    balance: expired ? 0 : Math.max(Number(wallet?.balance) || 0, 0),
    expiresAt: wallet?.expiresAt || null,
    expired,
    costs: COSTS,
  };
};

// Everything except name/username search and followers is an advanced (paid) filter.
const BASIC_KEYS = new Set(["search", "followerRanges"]);

/** Stable hash of the advanced part of a normalised filter, or null when none is set. */
export const advancedFilterKey = (filter) => {
  const entries = Object.entries(filter)
    .filter(([key, value]) => {
      if (BASIC_KEYS.has(key)) return false;
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== false && value !== undefined && value !== "";
    })
    .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value])
    .sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return null;
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 32);
};
