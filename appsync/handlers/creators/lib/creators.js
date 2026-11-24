import { getSql } from "/opt/nodejs/postgres.js";

export const queryCreators = ({ text, params }) => getSql().query(text, params);

export const queryStats = async ({ text, params }) => {
  const [row] = await getSql().query(text, params);
  return row;
};

const FACET_QUERIES = {
  niches: `SELECT n AS value, count(*)::int AS count FROM creators, unnest(niches) AS n
           WHERE n <> '' GROUP BY n ORDER BY count DESC`,
  languages: `SELECT l AS value, count(*)::int AS count FROM creators, unnest(languages) AS l
              WHERE l <> '' GROUP BY l ORDER BY count DESC`,
  countries: `SELECT country AS value, count(*)::int AS count FROM creators
              WHERE country IS NOT NULL AND country <> '' GROUP BY country ORDER BY count DESC`,
  states: `SELECT state AS value, count(*)::int AS count FROM creators
           WHERE state IS NOT NULL AND state <> '' GROUP BY state ORDER BY count DESC LIMIT 300`,
  cities: `SELECT city AS value, count(*)::int AS count FROM creators
           WHERE city IS NOT NULL AND city <> '' GROUP BY city HAVING count(*) >= 3
           ORDER BY count DESC LIMIT 1000`,
  genders: `SELECT COALESCE(NULLIF(gender, ''), 'unknown') AS value, count(*)::int AS count
            FROM creators GROUP BY 1 ORDER BY count DESC`,
};

export const queryFacets = async () => {
  const sql = getSql();
  const keys = Object.keys(FACET_QUERIES);
  const results = await Promise.all(keys.map((k) => sql.query(FACET_QUERIES[k])));
  return Object.fromEntries(keys.map((k, i) => [k, results[i]]));
};

export const getCreatorById = async (id) => {
  const [row] = await getSql().query("SELECT * FROM creators WHERE id = $1::uuid", [id]);
  return row || null;
};
