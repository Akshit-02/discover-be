import { getSql } from "/opt/nodejs/postgres.js";

export const getCreatorsByIds = (ids) => {
  if (!ids.length) return [];
  const sql = getSql();
  return sql`SELECT * FROM creators WHERE id = ANY(${ids}::uuid[])`;
};

export const creatorExists = async (id) => {
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM creators WHERE id = ${id} LIMIT 1`;
  return rows.length > 0;
};
