import path from "node:path";
import { config } from "../config.js";
import { hasPostgres, query } from "./db.js";
import { ensureDir, readJsonFile, writeJsonFile } from "./fs.js";
import { removeMedia } from "./media-storage.js";
import type { PersistedRecord } from "../types.js";

type StoreShape = {
  records: PersistedRecord[];
};

type JobRow = {
  job_id: string;
  feature: PersistedRecord["feature"];
  analysis_status: PersistedRecord["analysisStatus"];
  render_status: PersistedRecord["renderStatus"];
  analysis_json: PersistedRecord["analysisJson"];
  image_preview_url: string;
  poster_url: string | null;
  source_key: string | null;
  source_local_path: string | null;
  poster_key: string | null;
  poster_local_path: string | null;
  created_at: Date;
  expires_at: Date;
};

function toPersistedRecord(row: JobRow): PersistedRecord {
  return {
    jobId: row.job_id,
    feature: row.feature,
    analysisStatus: row.analysis_status,
    renderStatus: row.render_status,
    analysisJson: row.analysis_json,
    imagePreviewUrl: row.image_preview_url,
    posterUrl: row.poster_url,
    sourceKey: row.source_key ?? undefined,
    localSourcePath: row.source_local_path ?? undefined,
    posterKey: row.poster_key ?? undefined,
    localPosterPath: row.poster_local_path ?? undefined,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString()
  };
}

async function loadStore(): Promise<StoreShape> {
  if (hasPostgres()) {
    const result = await query<JobRow>(`
      SELECT *
      FROM jobs
      ORDER BY created_at DESC
    `);
    return { records: result.rows.map(toPersistedRecord) };
  }

  await ensureDir(config.dataDir);
  return readJsonFile<StoreShape>(config.dbFile, { records: [] });
}

async function saveStore(next: StoreShape) {
  await ensureDir(path.dirname(config.dbFile));
  await writeJsonFile(config.dbFile, next);
}

export async function listRecords() {
  const store = await loadStore();
  return store.records;
}

export async function getRecord(jobId: string) {
  if (hasPostgres()) {
    const result = await query<JobRow>("SELECT * FROM jobs WHERE job_id = $1", [jobId]);
    return result.rows[0] ? toPersistedRecord(result.rows[0]) : null;
  }

  const store = await loadStore();
  return store.records.find((entry) => entry.jobId === jobId) ?? null;
}

export async function upsertRecord(record: PersistedRecord) {
  if (hasPostgres()) {
    await query(
      `
        INSERT INTO jobs (
          job_id,
          feature,
          analysis_status,
          render_status,
          analysis_json,
          image_preview_url,
          poster_url,
          source_key,
          source_local_path,
          poster_key,
          poster_local_path,
          created_at,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (job_id) DO UPDATE SET
          feature = EXCLUDED.feature,
          analysis_status = EXCLUDED.analysis_status,
          render_status = EXCLUDED.render_status,
          analysis_json = EXCLUDED.analysis_json,
          image_preview_url = EXCLUDED.image_preview_url,
          poster_url = EXCLUDED.poster_url,
          source_key = EXCLUDED.source_key,
          source_local_path = EXCLUDED.source_local_path,
          poster_key = EXCLUDED.poster_key,
          poster_local_path = EXCLUDED.poster_local_path,
          expires_at = EXCLUDED.expires_at
      `,
      [
        record.jobId,
        record.feature,
        record.analysisStatus,
        record.renderStatus,
        JSON.stringify(record.analysisJson),
        record.imagePreviewUrl,
        record.posterUrl,
        record.sourceKey ?? null,
        record.localSourcePath ?? null,
        record.posterKey ?? null,
        record.localPosterPath ?? null,
        record.createdAt,
        record.expiresAt
      ]
    );
    return;
  }

  const store = await loadStore();
  const index = store.records.findIndex((entry) => entry.jobId === record.jobId);

  if (index >= 0) {
    store.records[index] = record;
  } else {
    store.records.push(record);
  }

  await saveStore(store);
}

export async function deleteRecord(jobId: string) {
  if (hasPostgres()) {
    const record = await getRecord(jobId);
    await query("DELETE FROM jobs WHERE job_id = $1", [jobId]);
    if (record) {
      await removeMedia(record);
    }
    return;
  }

  const store = await loadStore();
  const record = store.records.find((entry) => entry.jobId === jobId) ?? null;

  store.records = store.records.filter((entry) => entry.jobId !== jobId);
  await saveStore(store);

  if (record) {
    await removeMedia(record);
  }
}

export async function cleanupExpiredRecords(now = Date.now()) {
  if (hasPostgres()) {
    const expiresAt = new Date(now).toISOString();
    const expired = await query<JobRow>("SELECT * FROM jobs WHERE expires_at <= $1", [expiresAt]);

    if (expired.rows.length === 0) {
      return 0;
    }

    for (const row of expired.rows) {
      await removeMedia(toPersistedRecord(row));
    }

    await query("DELETE FROM jobs WHERE expires_at <= $1", [expiresAt]);
    return expired.rows.length;
  }

  const store = await loadStore();
  const expired = store.records.filter((entry) => new Date(entry.expiresAt).getTime() <= now);
  const remaining = store.records.filter((entry) => new Date(entry.expiresAt).getTime() > now);

  if (expired.length === 0) {
    return 0;
  }

  for (const record of expired) {
    await removeMedia(record);
  }

  await saveStore({ records: remaining });
  return expired.length;
}
