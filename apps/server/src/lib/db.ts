import { Pool, type QueryResultRow } from "pg";
import { config } from "../config.js";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function hasPostgres() {
  return Boolean(config.databaseUrl);
}

export function getPool() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres storage.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10
    });
  }

  return pool;
}

export async function initPostgresSchema() {
  if (!hasPostgres()) {
    return;
  }

  if (schemaReady) {
    return schemaReady;
  }

  schemaReady = getPool().query(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id TEXT PRIMARY KEY,
      feature TEXT NOT NULL,
      analysis_status TEXT NOT NULL,
      render_status TEXT NOT NULL,
      analysis_json JSONB NOT NULL,
      image_preview_url TEXT NOT NULL,
      poster_url TEXT,
      source_key TEXT,
      source_local_path TEXT,
      poster_key TEXT,
      poster_local_path TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);

    CREATE TABLE IF NOT EXISTS redeem_codes (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      code_cipher TEXT,
      code_preview TEXT NOT NULL,
      status TEXT NOT NULL,
      total_credits INTEGER NOT NULL,
      remaining_credits INTEGER NOT NULL,
      token_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      redeemed_at TIMESTAMPTZ,
      disabled_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_redeem_codes_token_hash ON redeem_codes(token_hash);
    CREATE INDEX IF NOT EXISTS idx_redeem_codes_created_at ON redeem_codes(created_at);

    CREATE TABLE IF NOT EXISTS prompt_configs (
      feature TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      feature TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      code_id TEXT,
      duration_ms INTEGER,
      error_code TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_job_event ON analytics_events(job_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_feature ON analytics_events(feature);
  `).then(() => undefined);

  return schemaReady;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  await initPostgresSchema();
  return getPool().query<T>(text, values);
}
