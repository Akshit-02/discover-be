import { neon } from "@neondatabase/serverless";

let sql;

export const getSql = () => {
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
};
