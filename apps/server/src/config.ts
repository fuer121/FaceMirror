import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(rootDir, ".env") });

const defaultDataDir = path.resolve(rootDir, "../server-data");
const dataDir = process.env.DATA_DIR?.trim() ? path.resolve(process.env.DATA_DIR.trim()) : defaultDataDir;

export const config = {
  port: Number(process.env.PORT ?? 8787),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  resultTtlHours: Number(process.env.RESULT_TTL_HOURS ?? 24),
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024,
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 20),
  openAIBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
  imageOpenAIBaseUrl: process.env.OPENAI_IMAGE_BASE_URL?.trim() || "https://api.apimart.ai/v1",
  analysisModel: process.env.ANALYSIS_MODEL ?? "gpt-4.1-mini",
  imageModel: process.env.IMAGE_MODEL ?? "gpt-image-2",
  imageResolution: process.env.IMAGE_RESOLUTION ?? "1k",
  imageTaskPollIntervalMs: Number(process.env.IMAGE_TASK_POLL_INTERVAL_MS ?? 5_000),
  imageTaskTimeoutMs: Number(process.env.IMAGE_TASK_TIMEOUT_MS ?? 120_000),
  redeemAdminKey: process.env.REDEEM_ADMIN_KEY?.trim() || undefined,
  redeemDefaultCredits: Number(process.env.REDEEM_DEFAULT_CREDITS ?? 3),
  redeemAdminSessionTtlMs: Number(process.env.REDEEM_ADMIN_SESSION_TTL_MS ?? 30 * 60 * 1000),
  databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
  storageDriver: process.env.STORAGE_DRIVER?.trim() || "local",
  aliyunOssRegion: process.env.ALIYUN_OSS_REGION?.trim() || undefined,
  aliyunOssBucket: process.env.ALIYUN_OSS_BUCKET?.trim() || undefined,
  aliyunOssAccessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim() || undefined,
  aliyunOssAccessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim() || undefined,
  aliyunOssPublicBaseUrl: process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.trim() || undefined,
  aliyunOssPrefix: process.env.ALIYUN_OSS_PREFIX?.trim() || "facemirror",
  aliyunOssSignedUrlTtlSeconds: Number(process.env.ALIYUN_OSS_SIGNED_URL_TTL_SECONDS ?? 15 * 60),
  codexAuthFile: process.env.CODEX_AUTH_FILE?.trim() || path.join(os.homedir(), ".codex", "auth.json"),
  dataDir,
  uploadsDir: path.join(dataDir, "uploads"),
  rendersDir: path.join(dataDir, "renders"),
  dbFile: path.join(dataDir, "results.json"),
  redeemDbFile: path.join(dataDir, "redeem-codes.json"),
  promptDbFile: path.join(dataDir, "prompts.json"),
  analyticsDbFile: path.join(dataDir, "analytics.sqlite")
};

export function resolveOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY || process.env.OPENAI_AUTH_TOKEN || process.env.CODEX_OPENAI_API_KEY;
}

export function resolveImageOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_IMAGE_API_KEY || resolveOpenAIApiKey();
}
