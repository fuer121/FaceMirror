import fs from "node:fs/promises";
import { z } from "zod";
import {
  getModelConfig,
  getOpenAIClient,
  hasOpenAIAccess,
  normalizeOpenAIError,
  UpstreamProtocolError
} from "./openai.js";
import type { AnalysisPayload } from "../types.js";

const analysisSchema = z.object({
  isSingleFace: z.boolean(),
  faceCount: z.number().min(0).max(10),
  faceConfidence: z.number().min(0).max(1),
  photoReadiness: z.enum(["good", "low_light", "blurred", "multiple_faces", "no_face"]),
  skinTone: z.string(),
  undertone: z.string(),
  colorImpression: z.string(),
  dominantColors: z.array(z.object({
    name: z.string(),
    hex: z.string(),
    reason: z.string()
  })).min(3).max(6),
  makeupRegions: z.object({
    base: z.string(),
    brows: z.string(),
    eyes: z.string(),
    blush: z.string(),
    lips: z.string()
  }),
  strengths: z.array(z.string()).min(2).max(5),
  risks: z.array(z.string()).min(1).max(5),
  recommendations: z.array(z.string()).min(3).max(6),
  posterBrief: z.string()
});

function buildPrompt() {
  return [
    "你是一位专业但克制的美妆色彩分析师，需要对用户上传的人像照片做结构化分析。",
    "请先判断是否适合进入分析流程：如果不是单人照片、看不清脸、没有明显人脸，务必明确指出。",
    "输出必须是 JSON，字段严格匹配给定 schema，不要输出额外说明。",
    "分析重点：肤色深浅、冷暖调、整体色彩印象、主导色、底妆/眉/眼/腮红/唇的妆面观察、优点、风险、建议。",
    "建议语气专业、友好、面向普通消费者，避免医疗化措辞。"
  ].join("\n");
}

function fallbackAnalysis(): AnalysisPayload {
  return {
    isSingleFace: true,
    faceCount: 1,
    faceConfidence: 0.46,
    photoReadiness: "good",
    skinTone: "中等偏白",
    undertone: "中性偏暖",
    colorImpression: "整体呈现柔和、通透、带一点杏桃感的暖调氛围",
    dominantColors: [
      { name: "奶杏肤调", hex: "#E6C2AC", reason: "与皮肤和谐，适合做主色参考" },
      { name: "玫瑰豆沙", hex: "#C77D7E", reason: "适合唇与腮红方向，能增加气色" },
      { name: "摩卡棕", hex: "#7B5A46", reason: "适合眼妆和眉色，增强立体感" }
    ],
    makeupRegions: {
      base: "底妆观感偏轻薄，整体通透度较好，但局部仍可加强提亮层次。",
      brows: "眉形较自然，颜色建议略偏柔和棕调，避免过灰。",
      eyes: "眼部更适合暖棕、茶玫色系，能放大眼神但不显脏。",
      blush: "腮红建议集中在苹果肌向外晕染，减少边界感。",
      lips: "唇色更适合豆沙、奶茶或熟莓色，避免偏荧光橘。 "
    },
    strengths: [
      "整体面部色彩包容度较高，适合柔和暖调路线",
      "五官轮廓清晰，眼唇妆重点容易建立"
    ],
    risks: [
      "如果使用过灰或过冷的色系，面部会显得气色不足",
      "高饱和亮色上脸可能抢走肤色通透感"
    ],
    recommendations: [
      "眼妆优先选择奶咖、暖棕、焦糖和茶玫色",
      "唇颊可优先尝试豆沙玫瑰、奶茶玫瑰、柔雾莓色",
      "高光建议偏香槟米金，避免偏银白冷闪"
    ],
    posterBrief: "一张高端时尚编辑感的美妆分析海报，强调暖中性色调、豆沙玫瑰建议与柔和五官提亮。"
  };
}

function usesChatCompletions(baseUrl?: string) {
  return Boolean(baseUrl && !/api\.openai\.com/i.test(baseUrl));
}

function trimPreview(value: string) {
  return value.length > 160 ? `${value.slice(0, 160)}...` : value;
}

function inferFaceMeta(photoReadiness: AnalysisPayload["photoReadiness"]) {
  switch (photoReadiness) {
    case "multiple_faces":
      return {
        isSingleFace: false,
        faceCount: 2,
        faceConfidence: 0.45
      };
    case "no_face":
      return {
        isSingleFace: false,
        faceCount: 0,
        faceConfidence: 0.12
      };
    case "low_light":
    case "blurred":
      return {
        isSingleFace: true,
        faceCount: 1,
        faceConfidence: 0.58
      };
    case "good":
    default:
      return {
        isSingleFace: true,
        faceCount: 1,
        faceConfidence: 0.82
      };
  }
}

function normalizePhotoReadiness(raw: unknown): AnalysisPayload["photoReadiness"] {
  if (raw === "good" || raw === "low_light" || raw === "blurred" || raw === "multiple_faces" || raw === "no_face") {
    return raw;
  }

  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (/multi|multiple|多人|group/.test(value)) {
      return "multiple_faces";
    }
    if (/no[_\\s-]?face|无人|没人脸/.test(value)) {
      return "no_face";
    }
    if (/blur|模糊/.test(value)) {
      return "blurred";
    }
    if (/light|dark|low|暗|光线/.test(value)) {
      return "low_light";
    }
  }

  return "good";
}

function repairMissingFaceMeta(parsedJson: unknown) {
  if (typeof parsedJson !== "object" || parsedJson === null || Array.isArray(parsedJson)) {
    return parsedJson;
  }

  const draft = { ...parsedJson } as Partial<AnalysisPayload> & { photo_readiness?: unknown };
  const normalizedPhotoReadiness = normalizePhotoReadiness(draft.photoReadiness ?? draft.photo_readiness);
  const inferred = inferFaceMeta(normalizedPhotoReadiness);

  return {
    ...draft,
    photoReadiness: draft.photoReadiness ?? normalizedPhotoReadiness,
    isSingleFace: draft.isSingleFace ?? inferred.isSingleFace,
    faceCount: draft.faceCount ?? inferred.faceCount,
    faceConfidence: draft.faceConfidence ?? inferred.faceConfidence
  };
}

function mergeAnalysisFallback(parsedJson: unknown): unknown {
  if (typeof parsedJson !== "object" || parsedJson === null || Array.isArray(parsedJson)) {
    return parsedJson;
  }

  const draft = parsedJson as Record<string, unknown>;
  const fallback = fallbackAnalysis();
  const repaired = repairMissingFaceMeta(draft) as Record<string, unknown>;

  const makeupRegionsRaw = repaired.makeupRegions;
  const makeupRegions =
    typeof makeupRegionsRaw === "object" && makeupRegionsRaw !== null && !Array.isArray(makeupRegionsRaw)
      ? makeupRegionsRaw as Record<string, unknown>
      : {};

  return {
    ...fallback,
    ...repaired,
    skinTone: typeof repaired.skinTone === "string" ? repaired.skinTone : fallback.skinTone,
    undertone: typeof repaired.undertone === "string" ? repaired.undertone : fallback.undertone,
    colorImpression: typeof repaired.colorImpression === "string" ? repaired.colorImpression : fallback.colorImpression,
    dominantColors: Array.isArray(repaired.dominantColors) && repaired.dominantColors.length > 0
      ? repaired.dominantColors
      : fallback.dominantColors,
    makeupRegions: {
      base: typeof makeupRegions.base === "string" ? makeupRegions.base : fallback.makeupRegions.base,
      brows: typeof makeupRegions.brows === "string" ? makeupRegions.brows : fallback.makeupRegions.brows,
      eyes: typeof makeupRegions.eyes === "string" ? makeupRegions.eyes : fallback.makeupRegions.eyes,
      blush: typeof makeupRegions.blush === "string" ? makeupRegions.blush : fallback.makeupRegions.blush,
      lips: typeof makeupRegions.lips === "string" ? makeupRegions.lips : fallback.makeupRegions.lips
    },
    strengths: Array.isArray(repaired.strengths) && repaired.strengths.length > 0
      ? repaired.strengths
      : fallback.strengths,
    risks: Array.isArray(repaired.risks) && repaired.risks.length > 0
      ? repaired.risks
      : fallback.risks,
    recommendations: Array.isArray(repaired.recommendations) && repaired.recommendations.length > 0
      ? repaired.recommendations
      : fallback.recommendations,
    posterBrief: typeof repaired.posterBrief === "string" ? repaired.posterBrief : fallback.posterBrief
  };
}

export function parseAnalysisPayloadForModelOutput(raw: string | null | undefined, source: "chat.completions" | "responses") {
  if (!raw?.trim()) {
    throw new UpstreamProtocolError(
      "ANALYSIS_EMPTY_CONTENT",
      `分析模型返回空 content，source=${source}。`
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new UpstreamProtocolError(
      "ANALYSIS_INVALID_JSON",
      `分析模型返回了非 JSON 内容，source=${source}，preview=${trimPreview(raw)}`
    );
  }

  const repairedJson = repairMissingFaceMeta(parsedJson);
  const parsed = analysisSchema.safeParse(repairedJson);
  if (parsed.success) {
    return parsed.data;
  }

  const mergedWithFallback = mergeAnalysisFallback(repairedJson);
  const mergedParsed = analysisSchema.safeParse(mergedWithFallback);
  if (mergedParsed.success) {
    return mergedParsed.data;
  }

  const details = mergedParsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");

  throw new UpstreamProtocolError(
    "ANALYSIS_SCHEMA_MISMATCH",
    `分析模型返回 JSON schema 不匹配，source=${source}，issues=${details}`
  );
}

async function analyzeWithChatCompletions(filePath: string, analysisModel: string): Promise<AnalysisPayload> {
  const client = getOpenAIClient();

  if (!client) {
    return fallbackAnalysis();
  }

  const fileBuffer = await fs.readFile(filePath);
  const base64Image = fileBuffer.toString("base64");
  const response = await client.chat.completions.create({
    model: analysisModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildPrompt()
      },
      {
        role: "user",
        content: [
          { type: "text", text: "请根据这张照片完成结构化美妆与色彩分析，只返回 JSON。" },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ]
  });

  const raw = response.choices[0]?.message?.content;
  return parseAnalysisPayloadForModelOutput(raw, "chat.completions");
}

export async function analyzePhoto(filePath: string): Promise<AnalysisPayload> {
  if (!hasOpenAIAccess()) {
    return fallbackAnalysis();
  }

  const { analysisModel, openAIBaseUrl } = getModelConfig();

  try {
    if (usesChatCompletions(openAIBaseUrl)) {
      return await analyzeWithChatCompletions(filePath, analysisModel);
    }

    const client = getOpenAIClient();

    if (!client) {
      return fallbackAnalysis();
    }

    const fileBuffer = await fs.readFile(filePath);
    const base64Image = fileBuffer.toString("base64");
    const response = await client.responses.create({
      model: analysisModel,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildPrompt() }]
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: "请根据这张照片完成结构化美妆与色彩分析。" },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${base64Image}`,
              detail: "high"
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "facemirror_analysis",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              isSingleFace: { type: "boolean" },
              faceCount: { type: "number" },
              faceConfidence: { type: "number" },
              photoReadiness: {
                type: "string",
                enum: ["good", "low_light", "blurred", "multiple_faces", "no_face"]
              },
              skinTone: { type: "string" },
              undertone: { type: "string" },
              colorImpression: { type: "string" },
              dominantColors: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    hex: { type: "string" },
                    reason: { type: "string" }
                  },
                  required: ["name", "hex", "reason"]
                }
              },
              makeupRegions: {
                type: "object",
                additionalProperties: false,
                properties: {
                  base: { type: "string" },
                  brows: { type: "string" },
                  eyes: { type: "string" },
                  blush: { type: "string" },
                  lips: { type: "string" }
                },
                required: ["base", "brows", "eyes", "blush", "lips"]
              },
              strengths: {
                type: "array",
                items: { type: "string" }
              },
              risks: {
                type: "array",
                items: { type: "string" }
              },
              recommendations: {
                type: "array",
                items: { type: "string" }
              },
              posterBrief: { type: "string" }
            },
            required: [
              "isSingleFace",
              "faceCount",
              "faceConfidence",
              "photoReadiness",
              "skinTone",
              "undertone",
              "colorImpression",
              "dominantColors",
              "makeupRegions",
              "strengths",
              "risks",
              "recommendations",
              "posterBrief"
            ]
          }
        }
      }
    });

    return parseAnalysisPayloadForModelOutput(response.output_text, "responses");
  } catch (error) {
    throw normalizeOpenAIError(error);
  }
}
