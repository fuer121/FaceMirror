import crypto from "node:crypto";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { hasPostgres, query } from "./db.js";
import { ensureDir, readJsonFile, writeJsonFile } from "./fs.js";
import type { AdminRedeemCode, GeneratedRedeemCode } from "@facemirror/shared";

type RedeemCodeStatus = "available" | "redeemed" | "disabled";

type RedeemCodeRecord = {
  id: string;
  codeHash: string;
  codeCipher?: string;
  codePreview: string;
  status: RedeemCodeStatus;
  totalCredits: number;
  remainingCredits: number;
  tokenHash?: string;
  createdAt: string;
  redeemedAt?: string;
  disabledAt?: string;
};

type RedeemStoreShape = {
  codes: RedeemCodeRecord[];
};

type RedeemCodeRow = {
  id: string;
  code_hash: string;
  code_cipher: string | null;
  code_preview: string;
  status: RedeemCodeStatus;
  total_credits: number;
  remaining_credits: number;
  token_hash: string | null;
  created_at: Date;
  redeemed_at: Date | null;
  disabled_at: Date | null;
};

type AdminSession = {
  tokenHash: string;
  expiresAt: number;
};

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const adminSessions = new Map<string, AdminSession>();
let storeQueue = Promise.resolve();

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getEncryptionKey() {
  if (!config.redeemAdminKey) {
    return null;
  }
  return crypto.createHash("sha256").update(`redeem-code-display:${config.redeemAdminKey}`).digest();
}

function encryptCode(code: string) {
  const key = getEncryptionKey();
  if (!key) {
    return undefined;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptCode(cipherText: string | undefined) {
  const key = getEncryptionKey();
  if (!key || !cipherText) {
    return null;
  }

  try {
    const [ivValue, tagValue, encryptedValue] = cipherText.split(".");
    if (!ivValue || !tagValue || !encryptedValue) {
      return null;
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function hashCode(code: string) {
  return sha256(`redeem-code:${normalizeCode(code)}`);
}

function hashToken(token: string) {
  return sha256(`usage-token:${token}`);
}

function hashAdminToken(token: string) {
  return sha256(`admin-token:${token}`);
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

function createCodePreview(code: string) {
  const normalized = normalizeCode(code);
  return `${normalized.slice(0, 5)}...${normalized.slice(-4)}`;
}

function randomPart(length: number) {
  let part = "";
  for (let index = 0; index < length; index += 1) {
    part += codeAlphabet[crypto.randomInt(codeAlphabet.length)];
  }
  return part;
}

function generatePlainCode() {
  return `FM-${randomPart(4)}-${randomPart(4)}-${randomPart(4)}`;
}

function generateUsageToken() {
  return `ut_${nanoid(40)}`;
}

function toAdminCode(record: RedeemCodeRecord): AdminRedeemCode {
  return {
    id: record.id,
    code: decryptCode(record.codeCipher),
    code_preview: record.codePreview,
    status: record.status,
    total_credits: record.totalCredits,
    remaining_credits: record.remainingCredits,
    created_at: record.createdAt,
    redeemed_at: record.redeemedAt ?? null,
    disabled_at: record.disabledAt ?? null
  };
}

function rowToRecord(row: RedeemCodeRow): RedeemCodeRecord {
  return {
    id: row.id,
    codeHash: row.code_hash,
    codeCipher: row.code_cipher ?? undefined,
    codePreview: row.code_preview,
    status: row.status,
    totalCredits: row.total_credits,
    remainingCredits: row.remaining_credits,
    tokenHash: row.token_hash ?? undefined,
    createdAt: row.created_at.toISOString(),
    redeemedAt: row.redeemed_at?.toISOString(),
    disabledAt: row.disabled_at?.toISOString()
  };
}

async function loadStore(): Promise<RedeemStoreShape> {
  await ensureDir(config.dataDir);
  return readJsonFile<RedeemStoreShape>(config.redeemDbFile, { codes: [] });
}

async function saveStore(next: RedeemStoreShape) {
  await ensureDir(path.dirname(config.redeemDbFile));
  await writeJsonFile(config.redeemDbFile, next);
}

function withStoreLock<T>(operation: () => Promise<T>) {
  const run = storeQueue.then(operation, operation);
  storeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function normalizePositiveInteger(value: unknown, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

export function isAdminKey(input: string) {
  if (!config.redeemAdminKey) {
    return false;
  }

  const expected = Buffer.from(sha256(`admin-key:${config.redeemAdminKey}`), "hex");
  const actual = Buffer.from(sha256(`admin-key:${input}`), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function createAdminSession() {
  const token = `adm_${nanoid(40)}`;
  const expiresAt = Date.now() + config.redeemAdminSessionTtlMs;
  const tokenHash = hashAdminToken(token);

  adminSessions.set(tokenHash, { tokenHash, expiresAt });
  return {
    token,
    expiresAt: new Date(expiresAt).toISOString()
  };
}

export function verifyAdminSession(token: string | undefined) {
  if (!token) {
    return false;
  }

  const tokenHash = hashAdminToken(token);
  const session = adminSessions.get(tokenHash);
  if (!session) {
    return false;
  }

  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(tokenHash);
    return false;
  }

  return true;
}

export async function createRedeemCodes(options: { count?: unknown; credits?: unknown }) {
  const count = normalizePositiveInteger(options.count, 1, 200);
  const credits = normalizePositiveInteger(options.credits, config.redeemDefaultCredits, 10_000);

  if (hasPostgres()) {
    const generated: GeneratedRedeemCode[] = [];

    for (let index = 0; index < count; index += 1) {
      let inserted: RedeemCodeRecord | null = null;
      let code = "";

      while (!inserted) {
        code = generatePlainCode();
        const now = new Date().toISOString();
        try {
          const result = await query<RedeemCodeRow>(
            `
              INSERT INTO redeem_codes (
                id,
                code_hash,
                code_cipher,
                code_preview,
                status,
                total_credits,
                remaining_credits,
                created_at
              ) VALUES ($1, $2, $3, $4, 'available', $5, $5, $6)
              RETURNING *
            `,
            [nanoid(12), hashCode(code), encryptCode(code) ?? null, createCodePreview(code), credits, now]
          );
          inserted = rowToRecord(result.rows[0]);
        } catch (error) {
          if ((error as { code?: string }).code !== "23505") {
            throw error;
          }
        }
      }

      generated.push({
        ...toAdminCode(inserted),
        code
      });
    }

    return generated;
  }

  return withStoreLock(async () => {
    const store = await loadStore();
    const generated: GeneratedRedeemCode[] = [];

    for (let index = 0; index < count; index += 1) {
      let code = generatePlainCode();
      let codeHash = hashCode(code);

      while (store.codes.some((entry) => entry.codeHash === codeHash)) {
        code = generatePlainCode();
        codeHash = hashCode(code);
      }

      const record: RedeemCodeRecord = {
        id: nanoid(12),
        codeHash,
        codeCipher: encryptCode(code),
        codePreview: createCodePreview(code),
        status: "available",
        totalCredits: credits,
        remainingCredits: credits,
        createdAt: new Date().toISOString()
      };

      store.codes.push(record);
      generated.push({
        ...toAdminCode(record),
        code
      });
    }

    await saveStore(store);
    return generated;
  });
}

export async function listRedeemCodes() {
  if (hasPostgres()) {
    const result = await query<RedeemCodeRow>("SELECT * FROM redeem_codes ORDER BY created_at DESC");
    return result.rows.map(rowToRecord).map(toAdminCode);
  }

  const store = await loadStore();
  return store.codes
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toAdminCode);
}

export async function getRedeemCreditSummary() {
  if (hasPostgres()) {
    const result = await query<{
      codes_total: string;
      credits_total: string;
      credits_remaining: string;
    }>(`
      SELECT
        COUNT(*) AS codes_total,
        COALESCE(SUM(total_credits), 0) AS credits_total,
        COALESCE(SUM(remaining_credits), 0) AS credits_remaining
      FROM redeem_codes
    `);
    const row = result.rows[0];
    return {
      codesTotal: Number(row?.codes_total ?? 0),
      creditsTotal: Number(row?.credits_total ?? 0),
      creditsRemaining: Number(row?.credits_remaining ?? 0)
    };
  }

  const store = await loadStore();
  return store.codes.reduce(
    (summary, record) => {
      summary.codesTotal += 1;
      summary.creditsTotal += record.totalCredits;
      summary.creditsRemaining += record.remainingCredits;
      return summary;
    },
    {
      codesTotal: 0,
      creditsTotal: 0,
      creditsRemaining: 0
    }
  );
}

export async function disableRedeemCode(id: string) {
  if (hasPostgres()) {
    const result = await query<RedeemCodeRow>(
      `
        UPDATE redeem_codes
        SET status = 'disabled',
            disabled_at = COALESCE(disabled_at, $2)
        WHERE id = $1
        RETURNING *
      `,
      [id, new Date().toISOString()]
    );
    return result.rows[0] ? toAdminCode(rowToRecord(result.rows[0])) : null;
  }

  return withStoreLock(async () => {
    const store = await loadStore();
    const record = store.codes.find((entry) => entry.id === id) ?? null;

    if (!record) {
      return null;
    }

    if (record.status !== "disabled") {
      record.status = "disabled";
      record.disabledAt = new Date().toISOString();
    }

    await saveStore(store);
    return toAdminCode(record);
  });
}

export async function redeemCode(input: string) {
  const codeHash = hashCode(input);

  if (hasPostgres()) {
    const usageToken = generateUsageToken();
    const result = await query<RedeemCodeRow>(
      `
        UPDATE redeem_codes
        SET status = 'redeemed',
            token_hash = $2,
            redeemed_at = $3
        WHERE code_hash = $1
          AND status = 'available'
        RETURNING *
      `,
      [codeHash, hashToken(usageToken), new Date().toISOString()]
    );
    const record = result.rows[0] ? rowToRecord(result.rows[0]) : null;
    if (!record) {
      return null;
    }
    return {
      usageToken,
      remainingCredits: record.remainingCredits,
      totalCredits: record.totalCredits
    };
  }

  return withStoreLock(async () => {
    const store = await loadStore();
    const record = store.codes.find((entry) => entry.codeHash === codeHash) ?? null;

    if (!record || record.status === "disabled" || record.status === "redeemed") {
      return null;
    }

    const usageToken = generateUsageToken();
    record.status = "redeemed";
    record.tokenHash = hashToken(usageToken);
    record.redeemedAt = new Date().toISOString();

    await saveStore(store);
    return {
      usageToken,
      remainingCredits: record.remainingCredits,
      totalCredits: record.totalCredits
    };
  });
}

export async function getCredits(usageToken: string) {
  const tokenHash = hashToken(usageToken);

  if (hasPostgres()) {
    const result = await query<RedeemCodeRow>(
      "SELECT * FROM redeem_codes WHERE token_hash = $1 AND status = 'redeemed' LIMIT 1",
      [tokenHash]
    );
    const record = result.rows[0] ? rowToRecord(result.rows[0]) : null;
    if (!record) {
      return null;
    }
    return {
      id: record.id,
      remainingCredits: record.remainingCredits,
      totalCredits: record.totalCredits
    };
  }

  const store = await loadStore();
  const record = store.codes.find((entry) => entry.tokenHash === tokenHash && entry.status === "redeemed") ?? null;

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    remainingCredits: record.remainingCredits,
    totalCredits: record.totalCredits
  };
}

export async function consumeCredit(usageToken: string) {
  const tokenHash = hashToken(usageToken);

  if (hasPostgres()) {
    const consumed = await query<RedeemCodeRow>(
      `
        UPDATE redeem_codes
        SET remaining_credits = remaining_credits - 1
        WHERE token_hash = $1
          AND status = 'redeemed'
          AND remaining_credits > 0
        RETURNING *
      `,
      [tokenHash]
    );
    if (consumed.rows[0]) {
      const record = rowToRecord(consumed.rows[0]);
      return {
        ok: true as const,
        codeId: record.id,
        remainingCredits: record.remainingCredits,
        totalCredits: record.totalCredits
      };
    }

    const existing = await query<RedeemCodeRow>(
      "SELECT * FROM redeem_codes WHERE token_hash = $1 AND status = 'redeemed' LIMIT 1",
      [tokenHash]
    );
    return {
      ok: false as const,
      reason: existing.rows[0] ? "insufficient_credits" as const : "invalid_token" as const
    };
  }

  return withStoreLock(async () => {
    const store = await loadStore();
    const record = store.codes.find((entry) => entry.tokenHash === tokenHash && entry.status === "redeemed") ?? null;

    if (!record) {
      return { ok: false as const, reason: "invalid_token" as const };
    }

    if (record.remainingCredits <= 0) {
      return { ok: false as const, reason: "insufficient_credits" as const };
    }

    record.remainingCredits -= 1;
    await saveStore(store);

    return {
      ok: true as const,
      codeId: record.id,
      remainingCredits: record.remainingCredits,
      totalCredits: record.totalCredits
    };
  });
}

export async function refundCredit(codeId: string) {
  if (hasPostgres()) {
    await query(
      `
        UPDATE redeem_codes
        SET remaining_credits = remaining_credits + 1
        WHERE id = $1
          AND status = 'redeemed'
          AND remaining_credits < total_credits
      `,
      [codeId]
    );
    return;
  }

  await withStoreLock(async () => {
    const store = await loadStore();
    const record = store.codes.find((entry) => entry.id === codeId) ?? null;

    if (record && record.status === "redeemed" && record.remainingCredits < record.totalCredits) {
      record.remainingCredits += 1;
      await saveStore(store);
    }
  });
}
