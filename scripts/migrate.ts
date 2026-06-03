#!/usr/bin/env tsx
/**
 * Apply SQL migrations from db/migrations/ in lexical order, recording each
 * applied file in the meridian_migrations ledger. Idempotent.
 *
 *   DATABASE_URL=postgres://... tsx scripts/migrate.ts
 */
import { Client } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "db", "migrations");

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS meridian_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = new Set<string>();
    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM meridian_migrations"
    );
    for (const r of rows) applied.add(r.name);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`apply ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO meridian_migrations (name) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        appliedCount += 1;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log(`done. ${appliedCount} migration(s) applied.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
