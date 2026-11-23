import { getSql } from "/opt/nodejs/postgres.js";

export const listCreators = ({ limit, afterId }) => {
  const sql = getSql();
  if (!afterId) {
    return sql`
      SELECT * FROM creators
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}`;
  }
  return sql`
    SELECT * FROM creators
    WHERE (created_at, id) < (SELECT created_at, id FROM creators WHERE id = ${afterId})
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}`;
};
