import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import cors from "cors";
import multer from "multer";
import { nanoid } from "nanoid";
import {
  type AnalysisResponse,
  type AppErrorResponse,
  type DeleteResponse,
  type RenderResponse,
  type ResultResponse
} from "@facemirror/shared";
import { config } from "./config.js";
import { ensureDir } from "./lib/fs.js";
import { fallbackAnalysis } from "./lib/analysis.js";
import { createPosterFile } from "./lib/poster.js";
import { cleanupExpiredRecords, deleteRecord, getRecord, upsertRecord } from "./lib/store.js";
import { checkRateLimit } from "./lib/rate-limit.js";
import { getCredentialSource, OpenAICredentialError, UpstreamProtocolError } from "./lib/openai.js";
import type { PersistedRecord } from "./types.js";

const app = express();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, config.uploadsDir);
    },
    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname) || ".jpg";
      callback(null, `${Date.now()}-${nanoid(8)}${ext}`);
    }
  }),
  limits: {
    fileSize: config.maxFileSizeBytes
  }
});

function expiresAtIso() {
  return new Date(Date.now() + config.resultTtlHours * 60 * 60 * 1000).toISOString();
}

function appError(message: string, status: number, code = "APP_ERROR"): AppErrorResponse & { status: number } {
  return {
    status,
    error: {
      message,
      code
    }
  };
}

function createMediaUrl(type: "uploads" | "renders", fileName: string) {
  return `${config.publicBaseUrl}/media/${type}/${fileName}`;
}

function toResultResponse(record: PersistedRecord): ResultResponse {
  return {
    job_id: record.jobId,
    analysis_status: record.analysisStatus,
    render_status: record.renderStatus,
    image_preview_url: record.imagePreviewUrl,
    poster_url: record.posterUrl,
    analysis_json: record.analysisJson,
    expires_at: record.expiresAt
  };
}

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use("/media/uploads", express.static(config.uploadsDir));
app.use("/media/renders", express.static(config.rendersDir));

app.use((req, res, next) => {
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "unknown").trim();
  const { ok } = checkRateLimit(ip, config.rateLimitWindowMs, config.rateLimitMax);

  if (!ok) {
    const payload = appError("请求过于频繁，请稍后再试。", 429);
    res.status(429).json(payload);
    return;
  }

  next();
});

app.get("/api/health", async (_req, res) => {
  const cleaned = await cleanupExpiredRecords();
  res.json({
    ok: true,
    cleaned_expired_jobs: cleaned,
    auth_source: getCredentialSource(),
    now: new Date().toISOString()
  });
});

app.post("/api/analyze", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json(appError("请上传 JPG 或 PNG 照片。", 400));
      return;
    }

    if (!["image/jpeg", "image/png"].includes(req.file.mimetype)) {
      await fs.rm(req.file.path, { force: true }).catch(() => undefined);
      res.status(400).json(appError("仅支持 JPG 或 PNG 格式。", 400));
      return;
    }

    const analysis = fallbackAnalysis();

    const jobId = nanoid(12);
    const expiresAt = expiresAtIso();
    const previewUrl = createMediaUrl("uploads", path.basename(req.file.path));

    const record: PersistedRecord = {
      jobId,
      analysisStatus: "completed",
      renderStatus: "pending",
      analysisJson: {
        skinTone: analysis.skinTone,
        undertone: analysis.undertone,
        colorImpression: analysis.colorImpression,
        dominantColors: analysis.dominantColors,
        makeupRegions: analysis.makeupRegions,
        strengths: analysis.strengths,
        risks: analysis.risks,
        recommendations: analysis.recommendations,
        posterBrief: analysis.posterBrief
      },
      imagePreviewUrl: previewUrl,
      posterUrl: null,
      createdAt: new Date().toISOString(),
      expiresAt,
      localSourcePath: req.file.path
    };

    await upsertRecord(record);

    const payload: AnalysisResponse = {
      job_id: jobId,
      analysis_status: "completed",
      analysis_json: record.analysisJson,
      image_preview_url: previewUrl,
      expires_at: expiresAt
    };

    res.json(payload);
  } catch (error) {
    console.error("analyze failed", error);
    if (error instanceof OpenAICredentialError) {
      res.status(503).json(appError(error.message, 503));
      return;
    }
    if (error instanceof UpstreamProtocolError) {
      res.status(502).json(appError(error.message, 502, error.code));
      return;
    }
    res.status(500).json(appError("分析失败，请稍后重试。", 500));
  }
});

app.post("/api/render", async (req, res) => {
  try {
    const jobId = req.body?.job_id as string | undefined;

    if (!jobId) {
      res.status(400).json(appError("缺少 job_id。", 400));
      return;
    }

    const record = await getRecord(jobId);

    if (!record) {
      res.status(404).json(appError("结果不存在或已过期。", 404));
      return;
    }

    if (record.posterUrl) {
      const payload: RenderResponse = {
        job_id: record.jobId,
        render_status: "completed",
        poster_url: record.posterUrl,
        expires_at: record.expiresAt
      };
      res.json(payload);
      return;
    }

    await ensureDir(config.rendersDir);
    const renderBasePath = path.join(config.rendersDir, jobId);
    const createdPoster = await createPosterFile(renderBasePath, {
      ...record.analysisJson,
      isSingleFace: true,
      faceCount: 1,
      faceConfidence: 1,
      photoReadiness: "good"
    }, record.localSourcePath);

    const updated: PersistedRecord = {
      ...record,
      renderStatus: "completed",
      posterUrl: createMediaUrl("renders", createdPoster.fileName),
      localPosterPath: createdPoster.filePath
    };
    await upsertRecord(updated);

    const payload: RenderResponse = {
      job_id: updated.jobId,
      render_status: "completed",
      poster_url: updated.posterUrl,
      expires_at: updated.expiresAt
    };

    res.json(payload);
  } catch (error) {
    console.error("render failed", error);
    if (error instanceof OpenAICredentialError) {
      res.status(503).json(appError(error.message, 503));
      return;
    }
    res.status(500).json(appError("分析图生成失败，请稍后重试。", 500));
  }
});

app.get("/api/result/:id", async (req, res) => {
  const record = await getRecord(req.params.id);

  if (!record) {
    res.status(404).json(appError("结果不存在或已过期。", 404));
    return;
  }

  res.json(toResultResponse(record));
});

app.delete("/api/result/:id", async (req, res) => {
  const record = await getRecord(req.params.id);

  if (!record) {
    res.status(404).json(appError("结果不存在或已过期。", 404));
    return;
  }

  await deleteRecord(record.jobId);

  const payload: DeleteResponse = {
    ok: true,
    job_id: record.jobId
  };

  res.json(payload);
});

app.use((_req, res) => {
  res.status(404).json(appError("接口不存在。", 404));
});

async function boot() {
  await ensureDir(config.dataDir);
  await ensureDir(config.uploadsDir);
  await ensureDir(config.rendersDir);

  setInterval(() => {
    cleanupExpiredRecords().catch((error) => console.error("cleanup failed", error));
  }, 30 * 60 * 1000).unref();

  app.listen(config.port, () => {
    console.log(`FaceMirror server running on ${config.publicBaseUrl}`);
    console.log(`OpenAI credential source: ${getCredentialSource()}`);
  });
}

boot().catch((error) => {
  console.error(error);
  process.exit(1);
});
