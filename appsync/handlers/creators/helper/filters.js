// Builds parameterised SQL for creator search. Pure functions: no DB access here.

export const DEFAULT_LIMIT = 24;
export const MAX_LIMIT = 100;
const MAX_LIST_VALUES = 50;
const MAX_SEARCH_LENGTH = 80;
const INT_MAX = 2147483647;

// Each sort is an expression + direction; the same expressions back the indexes in
// scripts/migrations/001_creator_search_indexes.sql, so keep them in sync.
export const SORTS = {
  FOLLOWERS_DESC: { expr: "COALESCE(followers, -1)", dir: "DESC", cast: "bigint" },
  FOLLOWERS_ASC: { expr: `COALESCE(followers, ${INT_MAX})`, dir: "ASC", cast: "bigint" },
  // Engagement above 100% is bad source data: it sorts as unknown.
  ENGAGEMENT_DESC: {
    expr: "COALESCE(CASE WHEN avg_engagement_rate <= 100 THEN avg_engagement_rate END, -1)",
    dir: "DESC",
    cast: "double precision",
  },
  VIEWS_DESC: { expr: "COALESCE(avg_views, -1)", dir: "DESC", cast: "bigint" },
  LIKES_DESC: { expr: "COALESCE(avg_likes, -1)", dir: "DESC", cast: "bigint" },
  REEL_PRICE_ASC: { expr: `COALESCE(NULLIF(reel_price, 0), ${INT_MAX})`, dir: "ASC", cast: "bigint" },
  NEWEST: { expr: "created_at", dir: "DESC", cast: "timestamptz" },
};
export const DEFAULT_SORT = "FOLLOWERS_DESC";

const GENDER_VALUES = { MALE: "male", FEMALE: "female", OTHER: "other" };

export const clampLimit = (limit) => Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

const cleanList = (values) => {
  if (!Array.isArray(values)) return [];
  const out = [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (out.length > MAX_LIST_VALUES) throw new Error(`Too many filter values (max ${MAX_LIST_VALUES})`);
  return out;
};

const finite = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Normalises a raw CreatorFilterInput into a predictable shape. */
export const normalizeFilter = (input = {}) => {
  const f = input || {};
  const search = String(f.search ?? "").trim().replace(/^@/, "").slice(0, MAX_SEARCH_LENGTH);
  const followerRanges = (Array.isArray(f.followerRanges) ? f.followerRanges : [])
    .map((r) => ({ min: finite(r?.min), max: finite(r?.max) }))
    .filter((r) => r.min !== null || r.max !== null)
    .slice(0, 10);
  const genders = cleanList(f.genders).map((g) => g.toUpperCase());
  const bad = genders.find((g) => g !== "UNKNOWN" && !GENDER_VALUES[g]);
  if (bad) throw new Error(`Invalid gender: ${bad}`);

  return {
    search,
    niches: cleanList(f.niches),
    countries: cleanList(f.countries),
    states: cleanList(f.states),
    cities: cleanList(f.cities),
    languages: cleanList(f.languages),
    genders,
    followerRanges,
    minEngagementRate: finite(f.minEngagementRate),
    maxEngagementRate: finite(f.maxEngagementRate),
    minAvgViews: finite(f.minAvgViews),
    minAvgLikes: finite(f.minAvgLikes),
    minPostingFrequency: finite(f.minPostingFrequency),
    maxReelPrice: finite(f.maxReelPrice),
    verifiedOnly: f.verifiedOnly === true,
    hasEmail: f.hasEmail === true,
    hasPhone: f.hasPhone === true,
    hasContact: f.hasContact === true,
  };
};

/** Creators without engagement rate, avg views or avg likes are never returned. */
export const HAS_METRICS = "avg_engagement_rate > 0 AND avg_views > 0 AND avg_likes > 0";

/** Returns { clauses: string[], params: any[] } — clauses reference $1..$n in params order. */
export const buildWhere = (filter, params = []) => {
  const f = filter;
  const clauses = [HAS_METRICS];
  const p = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (f.search) {
    const like = p(`%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    clauses.push(`(name ILIKE ${like} OR username ILIKE ${like})`);
  }
  if (f.niches.length) clauses.push(`niches && ${p(f.niches)}::text[]`);
  if (f.languages.length) clauses.push(`languages && ${p(f.languages)}::text[]`);
  if (f.countries.length) clauses.push(`country = ANY(${p(f.countries)}::text[])`);
  if (f.states.length) clauses.push(`state = ANY(${p(f.states)}::text[])`);
  if (f.cities.length) clauses.push(`city = ANY(${p(f.cities)}::text[])`);

  if (f.genders.length) {
    const named = f.genders.filter((g) => GENDER_VALUES[g]).map((g) => GENDER_VALUES[g]);
    const parts = [];
    if (named.length) parts.push(`gender = ANY(${p(named)}::text[])`);
    if (f.genders.includes("UNKNOWN")) parts.push("(gender IS NULL OR gender = '')");
    clauses.push(`(${parts.join(" OR ")})`);
  }

  if (f.followerRanges.length) {
    const ranges = f.followerRanges.map((r) => {
      const parts = [];
      if (r.min !== null) parts.push(`followers >= ${p(Math.trunc(r.min))}::bigint`);
      if (r.max !== null) parts.push(`followers < ${p(Math.trunc(r.max))}::bigint`);
      return `(${parts.join(" AND ")})`;
    });
    clauses.push(`(${ranges.join(" OR ")})`);
  }

  if (f.minEngagementRate !== null) {
    clauses.push(`avg_engagement_rate >= ${p(f.minEngagementRate)}::double precision`);
  }
  if (f.maxEngagementRate !== null) {
    clauses.push(`avg_engagement_rate <= ${p(f.maxEngagementRate)}::double precision`);
  }
  if (f.minAvgViews !== null) clauses.push(`avg_views >= ${p(Math.trunc(f.minAvgViews))}::bigint`);
  if (f.minAvgLikes !== null) clauses.push(`avg_likes >= ${p(Math.trunc(f.minAvgLikes))}::bigint`);
  if (f.minPostingFrequency !== null) {
    clauses.push(`posting_frequency >= ${p(Math.trunc(f.minPostingFrequency))}::bigint`);
  }
  if (f.maxReelPrice !== null) {
    clauses.push(`reel_price > 0 AND reel_price <= ${p(Math.trunc(f.maxReelPrice))}::bigint`);
  }
  if (f.verifiedOnly) clauses.push("is_verified = true");
  if (f.hasEmail) clauses.push("email IS NOT NULL AND email <> ''");
  if (f.hasPhone) clauses.push("phone IS NOT NULL AND phone <> ''");
  if (f.hasContact) {
    clauses.push("((email IS NOT NULL AND email <> '') OR (phone IS NOT NULL AND phone <> ''))");
  }

  return { clauses, params };
};

export const encodeCursor = (sortKey, row) => {
  return Buffer.from(JSON.stringify({ s: sortKey, v: String(row.sort_value), id: row.id })).toString(
    "base64url",
  );
};

export const decodeCursor = (token, sortKey) => {
  if (!token) return null;
  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid nextToken");
  }
  if (!cursor || cursor.s !== sortKey || cursor.id === undefined || cursor.v === undefined) {
    throw new Error("Invalid nextToken");
  }
  return cursor;
};

/** Full page query: items + one extra row to detect more pages. */
export const buildListQuery = ({ filter, sortKey, cursor, limit }) => {
  const sort = SORTS[sortKey];
  const { clauses, params } = buildWhere(filter, []);
  if (cursor) {
    params.push(cursor.v, cursor.id);
    const op = sort.dir === "DESC" ? "<" : ">";
    clauses.push(
      `(${sort.expr}, id) ${op} ($${params.length - 1}::${sort.cast}, $${params.length}::uuid)`,
    );
  }
  params.push(limit + 1);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  // sort_value as text keeps full precision (timestamps have microseconds) for the cursor.
  const text = `SELECT *, (${sort.expr})::text AS sort_value FROM creators ${where}
    ORDER BY ${sort.expr} ${sort.dir}, id ${sort.dir}
    LIMIT $${params.length}`;
  return { text, params };
};

export const buildStatsQuery = ({ filter }) => {
  const { clauses, params } = buildWhere(filter, []);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const text = `SELECT
      count(*)::int AS total_count,
      COALESCE(sum(followers), 0)::float8 AS total_reach,
      avg(CASE WHEN avg_engagement_rate <= 100 THEN avg_engagement_rate END)::float8 AS avg_engagement_rate,
      (count(*) FILTER (WHERE is_verified))::int AS verified_count
    FROM creators ${where}`;
  return { text, params };
};

export const resolveSort = (sort) => {
  if (!sort) return DEFAULT_SORT;
  if (!SORTS[sort]) throw new Error(`Invalid sort: ${sort}`);
  return sort;
};
