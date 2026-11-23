/**
 * Upserts creators from a CSV export (influencers_india.csv format) into the Neon `creators` table.
 *
 *   npm run import:creators -- [--file scripts/influencers_india.csv] [--batch 1000]
 *                              [--concurrency 4] [--limit N] [--dry-run]
 *
 * Needs DATABASE_URL or NEON_DATABASE_URL (the npm script loads .env.master).
 * Rows match on `id` (CSV influencer_id). Only CSV-backed columns are written, so
 * following / avg_comments / prices / mid are left untouched on update, and
 * updated_at only moves when a value actually changed.
 */
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse";
import { neon } from "@neondatabase/serverless";

const args = parseArgs(process.argv.slice(2));
const FILE = path.resolve(args.file || "scripts/influencers_india.csv");
const BATCH_SIZE = Number(args.batch || 1000);
const CONCURRENCY = Number(args.concurrency || 4);
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const DRY_RUN = Boolean(args["dry-run"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_MAX = 2147483647;

// Written on insert and compared/overwritten on update.
const COLUMNS = [
  ["name", "text"],
  ["username", "text"],
  ["email", "text"],
  ["phone", "text"],
  ["followers", "integer"],
  ["total_posts", "integer"],
  ["avg_likes", "integer"],
  ["avg_views", "integer"],
  ["avg_engagement_rate", "double precision"],
  ["posting_frequency", "integer"],
  ["gender", "text"],
  ["city", "text"],
  ["state", "text"],
  ["country", "text"],
  ["niches", "text[]"],
  ["languages", "text[]"],
  ["is_verified", "boolean"],
];

const colNames = COLUMNS.map(([c]) => c);
const recordDef = [["id", "uuid"], ...COLUMNS]
  .map(([c, t]) => `${c} ${t}`)
  .join(", ");

// Username clashes with a different id are skipped rather than failing the whole batch.
export const UPSERT_SQL = `
  INSERT INTO creators (id, ${colNames.join(", ")})
  SELECT r.id, ${colNames.map((c) => `r.${c}`).join(", ")}
  FROM jsonb_to_recordset($1::jsonb) AS r(${recordDef})
  WHERE NOT EXISTS (
    SELECT 1 FROM creators c WHERE c.username = r.username AND c.id <> r.id
  )
  ON CONFLICT (id) DO UPDATE SET
    ${colNames.map((c) => `${c} = EXCLUDED.${c}`).join(",\n    ")},
    updated_at = now()
  WHERE (${colNames.map((c) => `creators.${c}`).join(", ")})
    IS DISTINCT FROM (${colNames.map((c) => `EXCLUDED.${c}`).join(", ")})
  RETURNING (xmax = 0) AS inserted
`;

const text = (v) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

const toInt = (v) => {
  const s = text(v);
  if (s === null) return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n >= 0 && n <= INT_MAX ? n : null;
};

const toFloat = (v) => {
  const s = text(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const toList = (v, sep) => {
  const s = text(v);
  if (s === null) return null;
  const items = [
    ...new Set(
      s
        .split(sep)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
  return items.length ? items : null;
};

export function toCreatorRow(r) {
  const id = text(r.influencer_id);
  const username = text(r.username)?.replace(/^@/, "").toLowerCase();
  if (!id || !UUID_RE.test(id)) return { error: "invalid influencer_id" };
  if (!username) return { error: "missing username" };

  return {
    row: {
      id: uuidv4(),
      mid: id.toLowerCase(),
      name: text(r.full_name),
      username,
      email: text(r.email)?.toLowerCase() ?? null,
      phone: text(r.phone),
      followers: toInt(r.followers),
      total_posts: toInt(r.total_post_count),
      avg_likes: toInt(r.avg_likes),
      avg_views: toInt(r.avg_views),
      avg_engagement_rate: toFloat(r.avg_engagement_rate),
      posting_frequency: toInt(r.post_frequency_month),
      gender: text(r.influencer_gender)?.toLowerCase() ?? null,
      city: text(r.city),
      state: text(r.state),
      country: text(r.country),
      niches: toList(r.niches, "|"),
      languages: toList(r.language, /[|,]/),
      is_verified: text(r.is_verified)?.toLowerCase() === "true",
    },
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [key, inline] = a.slice(2).split("=");
    if (inline !== undefined) out[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

async function withRetry(fn, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
}

async function main() {
  if (!fs.existsSync(FILE)) throw new Error(`CSV not found: ${FILE}`);

  const dbUrl =
    "postgresql://creators-data_owner:npg_Bxw7tZ3NrEoV@ep-polished-smoke-bbd1lcud-pooler.c-15.us-east-1.aws.neon.tech/creators-data?sslmode=require&channel_binding=require";
  if (!DRY_RUN && !dbUrl) {
    throw new Error(
      "Set DATABASE_URL or NEON_DATABASE_URL (or use .env.master)",
    );
  }
  const sql = DRY_RUN ? null : neon(dbUrl);

  const stats = { read: 0, invalid: 0, inserted: 0, updated: 0, unchanged: 0 };
  const invalidSamples = [];
  const started = Date.now();
  const inFlight = new Set();

  const flush = (rows) => {
    if (DRY_RUN) return;
    const task = withRetry(() => sql.query(UPSERT_SQL, [JSON.stringify(rows)]))
      .then((result) => {
        const inserted = result.filter((r) => r.inserted).length;
        stats.inserted += inserted;
        stats.updated += result.length - inserted;
        // Rows not returned were unchanged, or skipped because their username belongs to another id.
        stats.unchanged += rows.length - result.length;
      })
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
    return task;
  };

  const parser = fs.createReadStream(FILE).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }),
  );

  let batch = [];
  let lastLog = 0;

  for await (const record of parser) {
    if (stats.read >= LIMIT) break;
    stats.read++;

    const { row, error } = toCreatorRow(record);
    if (error) {
      stats.invalid++;
      if (invalidSamples.length < 10) {
        invalidSamples.push(`line ${stats.read + 1}: ${error}`);
      }
      continue;
    }

    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      flush(batch);
      batch = [];
      if (inFlight.size >= CONCURRENCY) await Promise.race(inFlight);
    }

    if (stats.read - lastLog >= 25000) {
      lastLog = stats.read;
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      console.log(
        `${stats.read} read · ${stats.inserted} inserted · ${stats.updated} updated · ${secs}s`,
      );
    }
  }

  if (batch.length) flush(batch);
  await Promise.all(inFlight);

  if (!DRY_RUN) {
    const [{ count }] = await sql.query(
      "SELECT count(*)::int AS count FROM creators",
    );
    stats.totalInTable = count;
  }

  console.log(
    `\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s${DRY_RUN ? " (dry run)" : ""}`,
  );
  console.table(stats);
  if (invalidSamples.length) console.log("Invalid rows:", invalidSamples);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Import failed:", err.message);
    process.exit(1);
  });
}
