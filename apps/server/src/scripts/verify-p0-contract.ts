import { parseAnalysisPayloadForModelOutput } from "../lib/analysis.js";
import { createPosterImage } from "../lib/poster.js";
import { UpstreamProtocolError } from "../lib/openai.js";
import type { AnalysisPayload } from "../types.js";

const sampleAnalysis: AnalysisPayload = {
  isSingleFace: true,
  faceCount: 1,
  faceConfidence: 0.92,
  photoReadiness: "good",
  skinTone: "中等偏白",
  undertone: "中性偏暖",
  colorImpression: "柔和、通透、暖中性",
  dominantColors: [
    { name: "奶杏肤调", hex: "#E6C2AC", reason: "与皮肤和谐" },
    { name: "玫瑰豆沙", hex: "#C77D7E", reason: "适合唇颊" },
    { name: "摩卡棕", hex: "#7B5A46", reason: "适合眼眉" }
  ],
  makeupRegions: {
    base: "底妆轻薄通透。",
    brows: "眉色建议柔和棕调。",
    eyes: "眼妆适合暖棕茶玫。",
    blush: "腮红建议苹果肌轻扫。",
    lips: "唇色适合豆沙奶茶。"
  },
  strengths: ["色彩包容度较高", "眼唇重点容易建立"],
  risks: ["过冷过灰会显气色不足"],
  recommendations: ["优先奶咖暖棕", "尝试豆沙玫瑰", "高光选香槟米金"],
  posterBrief: "暖中性色调的高端美妆分析海报。"
};

async function verifyPosterFallback() {
  const result = await createPosterImage(sampleAnalysis, undefined, "color", undefined, { forceFallback: true });
  const content = result.buffer.toString("utf8");

  if (result.extension !== ".svg" || !content.includes("<svg")) {
    throw new Error("SVG fallback verification failed.");
  }

  return `poster${result.extension}`;
}

async function main() {
  const cases: Array<[string, () => void]> = [
    ["ANALYSIS_EMPTY_CONTENT", () => parseAnalysisPayloadForModelOutput("", "chat.completions")],
    ["ANALYSIS_INVALID_JSON", () => parseAnalysisPayloadForModelOutput("not json", "chat.completions")],
    ["ANALYSIS_SCHEMA_MISMATCH", () => parseAnalysisPayloadForModelOutput("{\"faceConfidence\":2}", "chat.completions")]
  ];

  for (const [expectedCode, run] of cases) {
    try {
      run();
      throw new Error(`Expected ${expectedCode} but parsing succeeded.`);
    } catch (error) {
      if (!(error instanceof UpstreamProtocolError) || error.code !== expectedCode) {
        throw error;
      }
    }
  }

  const repaired = parseAnalysisPayloadForModelOutput(JSON.stringify({
    photoReadiness: "good",
    skinTone: sampleAnalysis.skinTone,
    undertone: sampleAnalysis.undertone,
    colorImpression: sampleAnalysis.colorImpression,
    dominantColors: sampleAnalysis.dominantColors,
    makeupRegions: sampleAnalysis.makeupRegions,
    strengths: sampleAnalysis.strengths,
    risks: sampleAnalysis.risks,
    recommendations: sampleAnalysis.recommendations,
    posterBrief: sampleAnalysis.posterBrief
  }), "chat.completions");

  if (!repaired.isSingleFace || repaired.faceCount !== 1 || repaired.faceConfidence <= 0) {
    throw new Error("Missing face meta repair verification failed.");
  }

  const fallbackFileName = await verifyPosterFallback();
  console.log(JSON.stringify({
    ok: true,
    analysis_error_codes: cases.map(([code]) => code),
    repaired_missing_face_meta: {
      isSingleFace: repaired.isSingleFace,
      faceCount: repaired.faceCount
    },
    render_fallback_file: fallbackFileName
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
