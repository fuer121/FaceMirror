import fs from "node:fs/promises";
import { z } from "zod";
import { getModelConfig, getOpenAIClient, hasOpenAIAccess, normalizeOpenAIError } from "./openai.js";
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

export async function analyzePhoto(filePath: string): Promise<AnalysisPayload> {
  if (!hasOpenAIAccess()) {
    return fallbackAnalysis();
  }

  const client = getOpenAIClient();

  if (!client) {
    return fallbackAnalysis();
  }

  const fileBuffer = await fs.readFile(filePath);
  const base64Image = fileBuffer.toString("base64");
  const { analysisModel } = getModelConfig();

  try {
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

    const raw = response.output_text;
    const parsed = analysisSchema.parse(JSON.parse(raw));

    return parsed;
  } catch (error) {
    throw normalizeOpenAIError(error);
  }
}
