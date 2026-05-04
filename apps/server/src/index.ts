import express from "express";
import cors from "cors";
import multer from "multer";
import { nanoid } from "nanoid";
import {
  type AnalysisResponse,
  type AnalyticsEventsResponse,
  type AnalyticsOverviewResponse,
  type AppErrorResponse,
  type AdminCodesResponse,
  type AdminPromptsResponse,
  type CreateAdminCodesResponse,
  type CreditsResponse,
  type DeleteResponse,
  type RedeemEntryResponse,
  type RenderResponse,
  type ResultResponse,
  type UpdateAdminPromptResponse
} from "@facemirror/shared";
import { config } from "./config.js";
import { initPostgresSchema } from "./lib/db.js";
import { ensureDir } from "./lib/fs.js";
import { fallbackAnalysis } from "./lib/analysis.js";
import { createPosterImage } from "./lib/poster.js";
import { cleanupExpiredRecords, deleteRecord, getRecord, upsertRecord } from "./lib/store.js";
import { getPromptConfig, isAnalysisMode, listPromptConfigs, updatePromptConfig } from "./lib/prompt-store.js";
import { getAnalyticsOverview, listAnalyticsEvents, recordAnalyticsEvent } from "./lib/analytics-store.js";
import { ensureLocalMediaDirs, getImageReference, saveRender, saveUpload } from "./lib/media-storage.js";
import { checkRateLimit } from "./lib/rate-limit.js";
import { getCredentialSource, OpenAICredentialError, UpstreamProtocolError } from "./lib/openai.js";
import {
  consumeCredit,
  createAdminSession,
  createRedeemCodes,
  disableRedeemCode,
  getCredits,
  getRedeemCreditSummary,
  isAdminKey,
  listRedeemCodes,
  redeemCode,
  refundCredit,
  verifyAdminSession
} from "./lib/redeem-store.js";
import type { PersistedRecord } from "./types.js";

const app = express();
const renderLocks = new Set<string>();

const upload = multer({
  storage: multer.memoryStorage(),
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

function extractBearerToken(value: unknown) {
  const header = value?.toString() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim();
}

function getUsageToken(req: express.Request) {
  return (req.body?.usage_token as string | undefined)?.trim() || extractBearerToken(req.headers.authorization);
}

function getAdminToken(req: express.Request) {
  return extractBearerToken(req.headers.authorization);
}

function requireAdmin(req: express.Request, res: express.Response) {
  if (verifyAdminSession(getAdminToken(req))) {
    return true;
  }

  res.status(401).json(appError("无效或已过期的管理会话。", 401, "ADMIN_UNAUTHORIZED"));
  return false;
}

function toResultResponse(record: PersistedRecord): ResultResponse {
  return {
    job_id: record.jobId,
    feature: record.feature ?? "color",
    analysis_status: record.analysisStatus,
    render_status: record.renderStatus,
    image_preview_url: record.imagePreviewUrl,
    poster_url: record.posterUrl,
    analysis_json: record.analysisJson,
    expires_at: record.expiresAt
  };
}

function parseDateQuery(value: unknown, fallback: Date) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function getAnalyticsRange(req: express.Request, defaultDays = 7) {
  const now = new Date();
  const fallbackFrom = new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return {
    from: parseDateQuery(req.query.from, fallbackFrom),
    to: parseDateQuery(req.query.to, now)
  };
}

function parseAnalyticsLimit(value: unknown) {
  const parsed = Number(value ?? 50);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(200, Math.floor(parsed))) : 50;
}

function parseAnalyticsStatus(value: unknown) {
  if (value === "pending" || value === "completed" || value === "failed" || value === "refunded") {
    return value;
  }
  return undefined;
}

function getErrorCode(error: unknown) {
  if (error instanceof OpenAICredentialError) {
    return "OPENAI_CREDENTIAL_ERROR";
  }
  if (error instanceof UpstreamProtocolError) {
    return error.code;
  }
  if (error instanceof Error && error.message) {
    return error.name || "RENDER_ERROR";
  }
  return "RENDER_ERROR";
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

function sensitiveRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.socket.remoteAddress ?? "unknown").trim();
  const { ok } = checkRateLimit(`sensitive:${ip}`, 60_000, 8);

  if (!ok) {
    res.status(429).json(appError("请求过于频繁，请稍后再试。", 429, "SENSITIVE_RATE_LIMITED"));
    return;
  }

  next();
}

app.get("/api/health", async (_req, res) => {
  const cleaned = await cleanupExpiredRecords();
  res.json({
    ok: true,
    cleaned_expired_jobs: cleaned,
    auth_source: getCredentialSource(),
    now: new Date().toISOString()
  });
});

app.post("/api/redeem/entry", sensitiveRateLimit, async (req, res) => {
  const input = (req.body?.input as string | undefined)?.trim();

  if (!input) {
    res.status(400).json(appError("请输入管理密钥或兑换码。", 400, "REDEEM_INPUT_REQUIRED"));
    return;
  }

  if (isAdminKey(input)) {
    const session = createAdminSession();
    const payload: RedeemEntryResponse = {
      mode: "admin",
      admin_token: session.token,
      expires_at: session.expiresAt
    };
    res.json(payload);
    return;
  }

  const redeemed = await redeemCode(input);

  if (!redeemed) {
    res.status(400).json(appError("兑换码无效、已兑换或已禁用。", 400, "REDEEM_CODE_INVALID"));
    return;
  }

  const payload: RedeemEntryResponse = {
    mode: "redeemed",
    usage_token: redeemed.usageToken,
    remaining_credits: redeemed.remainingCredits,
    total_credits: redeemed.totalCredits
  };
  res.json(payload);
});

app.get("/api/credits", async (req, res) => {
  const usageToken = extractBearerToken(req.headers.authorization) || (req.query.usage_token as string | undefined)?.trim();

  if (!usageToken) {
    res.status(401).json(appError("缺少生成次数凭证。", 401, "CREDITS_REQUIRED"));
    return;
  }

  const credits = await getCredits(usageToken);

  if (!credits) {
    res.status(401).json(appError("生成次数凭证无效。", 401, "CREDITS_INVALID"));
    return;
  }

  const payload: CreditsResponse = {
    remaining_credits: credits.remainingCredits,
    total_credits: credits.totalCredits
  };
  res.json(payload);
});

app.get("/api/redeem/admin/codes", sensitiveRateLimit, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const payload: AdminCodesResponse = {
    codes: await listRedeemCodes()
  };
  res.json(payload);
});

app.post("/api/redeem/admin/codes", sensitiveRateLimit, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const codes = await createRedeemCodes({
    count: req.body?.count,
    credits: req.body?.credits
  });
  const payload: CreateAdminCodesResponse = { codes };
  res.json(payload);
});

app.post("/api/redeem/admin/codes/:id/disable", sensitiveRateLimit, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const code = await disableRedeemCode(String(req.params.id));

  if (!code) {
    res.status(404).json(appError("兑换码不存在。", 404, "REDEEM_CODE_NOT_FOUND"));
    return;
  }

  res.json({ code });
});

app.get("/api/redeem/admin/prompts", sensitiveRateLimit, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const payload: AdminPromptsResponse = {
    prompts: await listPromptConfigs()
  };
  res.json(payload);
});

app.put("/api/redeem/admin/prompts/:feature", sensitiveRateLimit, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  if (!isAnalysisMode(req.params.feature)) {
    res.status(400).json(appError("功能类型无效。", 400, "PROMPT_FEATURE_INVALID"));
    return;
  }

  try {
    const prompt = await updatePromptConfig(req.params.feature, req.body?.prompt);
    const payload: UpdateAdminPromptResponse = { prompt };
    res.json(payload);
  } catch (error) {
    res.status(400).json(appError(error instanceof Error ? error.message : "Prompt 保存失败。", 400, "PROMPT_INVALID"));
  }
});

app.get("/api/redeem/admin/analytics/overview", sensitiveRateLimit, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const range = getAnalyticsRange(req);
  const creditSummary = await getRedeemCreditSummary();
  const payload: AnalyticsOverviewResponse = await getAnalyticsOverview({
    ...range,
    credits: creditSummary
  });
  res.json(payload);
});

app.get("/api/redeem/admin/analytics/events", sensitiveRateLimit, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const range = getAnalyticsRange(req);
  const feature = isAnalysisMode(req.query.feature) ? req.query.feature : undefined;
  const status = parseAnalyticsStatus(req.query.status);
  const payload: AnalyticsEventsResponse = {
    events: await listAnalyticsEvents({
      ...range,
      feature,
      status,
      limit: parseAnalyticsLimit(req.query.limit)
    })
  };
  res.json(payload);
});

app.post("/api/analyze", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json(appError("请上传 JPG 或 PNG 照片。", 400));
      return;
    }

    if (!["image/jpeg", "image/png"].includes(req.file.mimetype)) {
      res.status(400).json(appError("仅支持 JPG 或 PNG 格式。", 400));
      return;
    }

    const feature = isAnalysisMode(req.body?.feature) ? req.body.feature : "color";
    const analysis = fallbackAnalysis();

    const jobId = nanoid(12);
    const expiresAt = expiresAtIso();
    const uploadMedia = await saveUpload({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype
    });

    const record: PersistedRecord = {
      jobId,
      feature,
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
      imagePreviewUrl: uploadMedia.url,
      posterUrl: null,
      createdAt: new Date().toISOString(),
      expiresAt,
      sourceKey: uploadMedia.key,
      localSourcePath: uploadMedia.localPath
    };

    await upsertRecord(record);
    await recordAnalyticsEvent({
      jobId,
      feature,
      eventType: "job_created"
    });

    const payload: AnalysisResponse = {
      job_id: jobId,
      feature,
      analysis_status: "completed",
      analysis_json: record.analysisJson,
      image_preview_url: uploadMedia.url,
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
    let consumedCodeId: string | null = null;
    let renderStartedAt = 0;

    if (!jobId) {
      res.status(400).json(appError("缺少 job_id。", 400));
      return;
    }

    if (renderLocks.has(jobId)) {
      res.status(409).json(appError("该结果正在生成中，请稍后查看。", 409, "RENDER_IN_PROGRESS"));
      return;
    }

    renderLocks.add(jobId);

    const record = await getRecord(jobId);

    if (!record) {
      renderLocks.delete(jobId);
      res.status(404).json(appError("结果不存在或已过期。", 404));
      return;
    }

    if (record.posterUrl) {
      renderLocks.delete(jobId);
      const payload: RenderResponse = {
        job_id: record.jobId,
        feature: record.feature ?? "color",
        render_status: "completed",
        poster_url: record.posterUrl,
        expires_at: record.expiresAt
      };
      res.json(payload);
      return;
    }

    const usageToken = getUsageToken(req);

    if (!usageToken) {
      renderLocks.delete(jobId);
      res.status(401).json(appError("请先兑换生成次数。", 401, "CREDITS_REQUIRED"));
      return;
    }

    const consumed = await consumeCredit(usageToken);

    if (!consumed.ok) {
      renderLocks.delete(jobId);
      const code = consumed.reason === "insufficient_credits" ? "CREDITS_EXHAUSTED" : "CREDITS_INVALID";
      const message = consumed.reason === "insufficient_credits" ? "生成次数已用完，请兑换新的兑换码。" : "生成次数凭证无效，请重新兑换。";
      res.status(402).json(appError(message, 402, code));
      return;
    }

    consumedCodeId = consumed.codeId;
    renderStartedAt = Date.now();
    await recordAnalyticsEvent({
      jobId,
      feature: record.feature ?? "color",
      eventType: "render_started",
      codeId: consumedCodeId
    });

    try {
      const feature = record.feature ?? "color";
      const promptConfig = await getPromptConfig(feature);
      const imageReference = await getImageReference(record);
      const createdPoster = await createPosterImage({
        ...record.analysisJson,
        isSingleFace: true,
        faceCount: 1,
        faceConfidence: 1,
        photoReadiness: "good"
      }, imageReference, feature, promptConfig.prompt);
      const renderMedia = await saveRender({
        jobId,
        buffer: createdPoster.buffer,
        extension: createdPoster.extension,
        mimeType: createdPoster.mimeType
      });

      const updated: PersistedRecord = {
        ...record,
        renderStatus: "completed",
        posterUrl: renderMedia.url,
        posterKey: renderMedia.key,
        localPosterPath: renderMedia.localPath
      };
      await upsertRecord(updated);
      await recordAnalyticsEvent({
        jobId,
        feature,
        eventType: "render_completed",
        status: "completed",
        codeId: consumedCodeId,
        durationMs: Date.now() - renderStartedAt
      });

      const payload: RenderResponse = {
        job_id: updated.jobId,
        feature: updated.feature ?? "color",
        render_status: "completed",
        poster_url: updated.posterUrl,
        expires_at: updated.expiresAt
      };

      res.json(payload);
    } catch (error) {
      await recordAnalyticsEvent({
        jobId,
        feature: record.feature ?? "color",
        eventType: "render_failed",
        status: "failed",
        codeId: consumedCodeId,
        durationMs: renderStartedAt ? Date.now() - renderStartedAt : null,
        errorCode: getErrorCode(error)
      });
      if (consumedCodeId) {
        await refundCredit(consumedCodeId);
        await recordAnalyticsEvent({
          jobId,
          feature: record.feature ?? "color",
          eventType: "credit_refunded",
          status: "refunded",
          codeId: consumedCodeId,
          errorCode: getErrorCode(error)
        });
      }
      throw error;
    } finally {
      renderLocks.delete(jobId);
    }
  } catch (error) {
    const jobId = req.body?.job_id as string | undefined;
    if (jobId) {
      renderLocks.delete(jobId);
    }
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
  await initPostgresSchema();
  await ensureDir(config.dataDir);
  await ensureLocalMediaDirs();

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
