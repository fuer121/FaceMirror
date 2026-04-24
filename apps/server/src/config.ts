import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

export const config = {
  port: Number(process.env.PORT ?? 8787),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  resultTtlHours: Number(process.env.RESULT_TTL_HOURS ?? 24),
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024,
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 20),
  analysisModel: process.env.ANALYSIS_MODEL ?? "gpt-4.1-mini",
  imageModel: process.env.IMAGE_MODEL ?? "gpt-image-1",
  codexAuthFile: process.env.CODEX_AUTH_FILE?.trim() || path.join(os.homedir(), ".codex", "auth.json"),
  dataDir: path.resolve(rootDir, "../server-data"),
  uploadsDir: path.resolve(rootDir, "../server-data/uploads"),
  rendersDir: path.resolve(rootDir, "../server-data/renders"),
  dbFile: path.resolve(rootDir, "../server-data/results.json")
};

export function resolveOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY || process.env.OPENAI_AUTH_TOKEN || process.env.CODEX_OPENAI_API_KEY;
}
