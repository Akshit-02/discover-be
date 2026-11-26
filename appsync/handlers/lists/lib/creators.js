import { getSql } from "/opt/nodejs/postgres.js";

// Creators without engagement rate, avg views or avg likes are hidden
// (keep in sync with creators/helper/filters.js HAS_METRICS).
export const getCreatorsByIds = (ids) => {
  if (!ids.length) return [];
  const sql = getSql();
  return sql`SELECT * FROM creators WHERE id = ANY(${ids}::uuid[])
    AND avg_engagement_rate > 0 AND avg_views > 0 AND avg_likes > 0`;
};

export const creatorExists = async (id) => {
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM creators WHERE id = ${id}
    AND avg_engagement_rate > 0 AND avg_views > 0 AND avg_likes > 0 LIMIT 1`;
  return rows.length > 0;
};
