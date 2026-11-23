/**
 * Applies scripts/migrations/*.sql to Neon in filename order. Statements are idempotent
 * (IF NOT EXISTS), so re-running is safe.
 *
 *   npm run db:migrate [-- --dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const dryRun = process.argv.includes("--dry-run");

const splitStatements = (sql) =>
  sql
    .replace(/^\s*--.*$/gm, "")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

const main = async () => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!dryRun && !url) throw new Error("Set DATABASE_URL or NEON_DATABASE_URL (or use .env.master)");
  const sql = dryRun ? null : neon(url);

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    console.log(`\n${file}`);
    for (const statement of splitStatements(fs.readFileSync(path.join(dir, file), "utf8"))) {
      const label = statement.split("\n")[0].slice(0, 90);
      if (dryRun) {
        console.log(`  would run: ${label}`);
        continue;
      }
      const started = Date.now();
      await sql.query(statement);
      console.log(`  ok (${Date.now() - started}ms): ${label}`);
    }
  }
};

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
