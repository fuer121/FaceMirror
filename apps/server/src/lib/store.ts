import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { ensureDir, readJsonFile, writeJsonFile } from "./fs.js";
import type { PersistedRecord } from "../types.js";

type StoreShape = {
  records: PersistedRecord[];
};

async function loadStore(): Promise<StoreShape> {
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
  const store = await loadStore();
  return store.records.find((entry) => entry.jobId === jobId) ?? null;
}

export async function upsertRecord(record: PersistedRecord) {
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
  const store = await loadStore();
  const record = store.records.find((entry) => entry.jobId === jobId) ?? null;

  store.records = store.records.filter((entry) => entry.jobId !== jobId);
  await saveStore(store);

  if (record?.localSourcePath) {
    await fs.rm(record.localSourcePath, { force: true }).catch(() => undefined);
  }
  if (record?.localPosterPath) {
    await fs.rm(record.localPosterPath, { force: true }).catch(() => undefined);
  }
}

export async function cleanupExpiredRecords(now = Date.now()) {
  const store = await loadStore();
  const expired = store.records.filter((entry) => new Date(entry.expiresAt).getTime() <= now);
  const remaining = store.records.filter((entry) => new Date(entry.expiresAt).getTime() > now);

  if (expired.length === 0) {
    return 0;
  }

  for (const record of expired) {
    if (record.localSourcePath) {
      await fs.rm(record.localSourcePath, { force: true }).catch(() => undefined);
    }
    if (record.localPosterPath) {
      await fs.rm(record.localPosterPath, { force: true }).catch(() => undefined);
    }
  }

  await saveStore({ records: remaining });
  return expired.length;
}

