import fs from "node:fs/promises";
import path from "node:path";
import { config, resolveImageOpenAIApiKey } from "../config.js";
import { getModelConfig, hasImageOpenAIAccess, normalizeOpenAIError } from "./openai.js";
import type { AnalysisPayload } from "../types.js";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSvgPoster(analysis: AnalysisPayload) {
  const colors = analysis.dominantColors.slice(0, 3);
  const recommendationLines = analysis.recommendations.slice(0, 3);
  const riskText = analysis.risks[0] ?? "避免极冷、过灰、过饱和的跳脱色。";

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="1200" height="1800" viewBox="0 0 1200 1800" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="1200" y1="0" x2="0" y2="1800" gradientUnits="userSpaceOnUse">
        <stop stop-color="#1E1515"/>
        <stop offset="0.5" stop-color="#533C37"/>
        <stop offset="1" stop-color="#E5C3B1"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1200" y2="1800" gradientUnits="userSpaceOnUse">
        <stop stop-color="${colors[0]?.hex ?? "#E6C2AC"}"/>
        <stop offset="1" stop-color="${colors[1]?.hex ?? "#C77D7E"}"/>
      </linearGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="40" /></filter>
    </defs>
    <rect width="1200" height="1800" fill="url(#bg)"/>
    <circle cx="950" cy="250" r="240" fill="url(#accent)" fill-opacity="0.6" filter="url(#blur)"/>
    <circle cx="220" cy="1450" r="280" fill="${colors[2]?.hex ?? "#7B5A46"}" fill-opacity="0.35" filter="url(#blur)"/>
    <rect x="72" y="72" width="1056" height="1656" rx="48" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)"/>
    <text x="110" y="170" fill="#F8EEE7" font-size="42" font-family="Georgia, serif" letter-spacing="8">FACE MIRROR</text>
    <text x="110" y="255" fill="#FFFFFF" font-size="96" font-family="Georgia, serif">妆容色彩诊断</text>
    <text x="110" y="320" fill="#F5E7DD" font-size="34" font-family="'Trebuchet MS', sans-serif">${escapeXml(analysis.colorImpression)}</text>

    <g transform="translate(110 410)">
      <text x="0" y="0" fill="#F6E6DB" font-size="28" font-family="'Trebuchet MS', sans-serif" letter-spacing="4">SKIN TONE</text>
      <text x="0" y="70" fill="#FFFFFF" font-size="58" font-family="Georgia, serif">${escapeXml(analysis.skinTone)} / ${escapeXml(analysis.undertone)}</text>
    </g>

    <g transform="translate(110 610)">
      <text x="0" y="0" fill="#F6E6DB" font-size="28" font-family="'Trebuchet MS', sans-serif" letter-spacing="4">DOMINANT PALETTE</text>
      ${colors.map((color, index) => `
        <g transform="translate(${index * 320} 56)">
          <rect width="250" height="140" rx="28" fill="${color.hex}"/>
          <text x="0" y="190" fill="#FFFFFF" font-size="32" font-family="Georgia, serif">${escapeXml(color.name)}</text>
          <text x="0" y="230" fill="#F6E6DB" font-size="24" font-family="'Trebuchet MS', sans-serif">${escapeXml(color.hex)}</text>
        </g>
      `).join("")}
    </g>

    <g transform="translate(110 980)">
      <text x="0" y="0" fill="#F6E6DB" font-size="28" font-family="'Trebuchet MS', sans-serif" letter-spacing="4">MAKEUP NOTES</text>
      <text x="0" y="76" fill="#FFFFFF" font-size="32" font-family="'Trebuchet MS', sans-serif">底妆：${escapeXml(analysis.makeupRegions.base)}</text>
      <text x="0" y="136" fill="#FFFFFF" font-size="32" font-family="'Trebuchet MS', sans-serif">眼妆：${escapeXml(analysis.makeupRegions.eyes)}</text>
      <text x="0" y="196" fill="#FFFFFF" font-size="32" font-family="'Trebuchet MS', sans-serif">唇妆：${escapeXml(analysis.makeupRegions.lips)}</text>
    </g>

    <g transform="translate(110 1280)">
      <text x="0" y="0" fill="#F6E6DB" font-size="28" font-family="'Trebuchet MS', sans-serif" letter-spacing="4">RECOMMENDATIONS</text>
      ${recommendationLines.map((line, index) => `
        <text x="0" y="${72 + index * 54}" fill="#FFFFFF" font-size="30" font-family="'Trebuchet MS', sans-serif">0${index + 1}. ${escapeXml(line)}</text>
      `).join("")}
    </g>

    <g transform="translate(110 1530)">
      <text x="0" y="0" fill="#F6E6DB" font-size="28" font-family="'Trebuchet MS', sans-serif" letter-spacing="4">WATCH OUT</text>
      <text x="0" y="74" fill="#FFFFFF" font-size="32" font-family="'Trebuchet MS', sans-serif">${escapeXml(riskText)}</text>
    </g>
  </svg>`;
}

function buildImagePrompt(analysis: AnalysisPayload) {
  const dominantColors = analysis.dominantColors.map((entry) => `${entry.name}(${entry.hex})`).join("、");
  const recommendationHint = analysis.recommendations.slice(0, 3).join("；");

  return [
    "色彩分析：請根據我上傳的人像照片，製作一張高質感個人色彩分析圖卡。",
    "只使用輸入照片中的人物作為主角。保留主角原本五官、膚色、臉型、髮型、表情與真實特徵，不要換臉，不要生成其他人。",
    "輸出為 1:1 方形個人色彩分析報告海報，乾淨、明亮、精緻，像專業形象顧問報告，適合社群分享。",
    "版面結構：上方標題「個人色彩分析報告 / PERSONAL COLOR ANALYSIS REPORT」；左側放主角清晰人像；右側放色彩類型、簡短特質與色彩指數。",
    "中段放一排「最佳色彩」圓形色票，使用柔和淺色系與清楚中文色名。",
    "下段做左右或並排對比：左邊「適合色彩 GOOD」，右邊「不適合色彩 BAD」。每邊 3 到 4 張同一主角的小圖，展示不同服裝顏色穿在主角身上的效果。",
    "清楚區分「適合色」與「不適合色」，讓人一眼看出哪些顏色最襯膚色、提升氣色與整體質感。",
    "文字規則：整體以視覺呈現為主，只使用短標籤與短句，例如「推薦」「普通」「避免」「氣色提升」「顯得暗沉」，不要加入長段文字。",
    "底部可放「色彩分析總結」與「穿搭小建議」，每欄最多兩行短句。",
    "高解析度，信息清楚，排版留白充足，避免深色厚重背景，避免雜誌長文版面。",
    `分析参考：肤色=${analysis.skinTone}，冷暖=${analysis.undertone}，主导色=${dominantColors}。`,
    `建议方向（仅作视觉引导，不要输出长文）：${recommendationHint}。`
  ].join("\n");
}

type ApimartSubmitResponse = {
  code?: number;
  data?: Array<{
    status?: string;
    task_id?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

type ApimartTaskResponse = {
  code?: number;
  data?: {
    status?: "submitted" | "processing" | "completed" | "failed";
    progress?: number;
    result?: {
      images?: Array<{
        url?: string[];
      }>;
    };
    error?: {
      message?: string;
    };
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function extToMime(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

async function readImageAsDataUri(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return `data:${extToMime(filePath)};base64,${buffer.toString("base64")}`;
}

async function readJsonResponse<T>(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`图片服务返回了非 JSON 响应：${text.slice(0, 200)}`);
  }
}

function assertApimartOk(response: Response, body: ApimartSubmitResponse | ApimartTaskResponse, action: string) {
  if (!response.ok || body.error) {
    const message = body.error?.message ?? `${action}失败，HTTP ${response.status}`;
    throw new Error(message);
  }
}

async function submitApimartImageTask(prompt: string, sourceImagePath: string) {
  const apiKey = resolveImageOpenAIApiKey();
  if (!apiKey) {
    return null;
  }

  const { imageModel } = getModelConfig();
  const response = await fetch(`${trimTrailingSlash(config.imageOpenAIBaseUrl)}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: imageModel,
      prompt,
      n: 1,
      size: "1:1",
      resolution: config.imageResolution,
      image_urls: [await readImageAsDataUri(sourceImagePath)]
    })
  });

  const body = await readJsonResponse<ApimartSubmitResponse>(response);
  assertApimartOk(response, body, "提交图片任务");

  const taskId = body.data?.[0]?.task_id;
  if (!taskId) {
    throw new Error("图片服务未返回 task_id。");
  }
  return taskId;
}

async function pollApimartImageTask(taskId: string) {
  const apiKey = resolveImageOpenAIApiKey();
  if (!apiKey) {
    return null;
  }

  const deadline = Date.now() + config.imageTaskTimeoutMs;
  await sleep(Math.min(config.imageTaskPollIntervalMs, 10_000));

  while (Date.now() < deadline) {
    const response = await fetch(`${trimTrailingSlash(config.imageOpenAIBaseUrl)}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    const body = await readJsonResponse<ApimartTaskResponse>(response);
    assertApimartOk(response, body, "查询图片任务");

    if (body.data?.status === "completed") {
      const imageUrl = body.data.result?.images?.[0]?.url?.[0];
      if (!imageUrl) {
        throw new Error("图片任务完成但未返回图片 URL。");
      }
      return imageUrl;
    }

    if (body.data?.status === "failed") {
      throw new Error(body.data.error?.message ?? "图片任务生成失败。");
    }

    await sleep(config.imageTaskPollIntervalMs);
  }

  throw new Error(`图片任务超时：${taskId}`);
}

async function downloadImage(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`下载生成图片失败，HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function renderWithOpenAI(analysis: AnalysisPayload, sourceImagePath?: string): Promise<Buffer | null> {
  if (!hasImageOpenAIAccess()) {
    return null;
  }

  const prompt = buildImagePrompt(analysis);

  if (sourceImagePath) {
    try {
      await fs.access(sourceImagePath);
      const taskId = await submitApimartImageTask(prompt, sourceImagePath);
      if (!taskId) {
        return null;
      }
      const imageUrl = await pollApimartImageTask(taskId);
      return imageUrl ? downloadImage(imageUrl) : null;
    } catch (error) {
      throw normalizeOpenAIError(error);
    }
  }

  if (hasImageOpenAIAccess()) {
    throw new Error("缺少上传原图，无法按预期进行图生图。");
  }

  throw new Error("缺少上传原图，无法按预期进行图生图。");
}

function buildSvgFallbackResult(renderBasePath: string) {
  return {
    filePath: `${renderBasePath}.svg`,
    fileName: `${renderBasePath.split(/[/\\]/).at(-1) ?? "poster"}.svg`
  };
}

export async function createPosterFile(renderBasePath: string, analysis: AnalysisPayload, sourceImagePath?: string) {
  let imageBuffer: Buffer | null = null;
  imageBuffer = await renderWithOpenAI(analysis, sourceImagePath);

  if (imageBuffer) {
    const pngPath = `${renderBasePath}.png`;
    await fs.writeFile(pngPath, imageBuffer);
    return {
      filePath: pngPath,
      fileName: `${renderBasePath.split(/[/\\]/).at(-1) ?? "poster"}.png`
    };
  }

  const svg = buildSvgPoster(analysis);
  const fallbackResult = buildSvgFallbackResult(renderBasePath);
  await fs.writeFile(fallbackResult.filePath, svg, "utf8");
  return fallbackResult;
}
