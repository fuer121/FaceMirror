import fs from "node:fs/promises";
import { getModelConfig, getOpenAIClient, hasOpenAIAccess, normalizeOpenAIError } from "./openai.js";
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

async function renderWithOpenAI(analysis: AnalysisPayload): Promise<Buffer | null> {
  if (!hasOpenAIAccess()) {
    return null;
  }

  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const { imageModel } = getModelConfig();
  const prompt = [
    "Create a vertical luxury beauty analysis poster for mobile sharing.",
    "Use an editorial fashion magazine aesthetic with warm neutral tones and clear typography blocks.",
    `Poster brief: ${analysis.posterBrief}`,
    `Skin tone: ${analysis.skinTone}`,
    `Undertone: ${analysis.undertone}`,
    `Dominant colors: ${analysis.dominantColors.map((entry) => `${entry.name} ${entry.hex}`).join(", ")}`,
    `Key strengths: ${analysis.strengths.join("; ")}`,
    `Recommendations: ${analysis.recommendations.join("; ")}`
  ].join("\n");

  let response;
  try {
    response = await client.images.generate({
      model: imageModel,
      prompt,
      size: "1024x1536"
    });
  } catch (error) {
    throw normalizeOpenAIError(error);
  }

  const base64 = response.data?.[0]?.b64_json;
  if (!base64) {
    return null;
  }

  return Buffer.from(base64, "base64");
}

export async function createPosterFile(renderBasePath: string, analysis: AnalysisPayload) {
  const imageBuffer = await renderWithOpenAI(analysis);

  if (imageBuffer) {
    const pngPath = `${renderBasePath}.png`;
    await fs.writeFile(pngPath, imageBuffer);
    return {
      filePath: pngPath,
      fileName: `${renderBasePath.split(/[/\\]/).at(-1) ?? "poster"}.png`
    };
  }

  const svg = buildSvgPoster(analysis);
  const svgPath = `${renderBasePath}.svg`;
  await fs.writeFile(svgPath, svg, "utf8");
  return {
    filePath: svgPath,
    fileName: `${renderBasePath.split(/[/\\]/).at(-1) ?? "poster"}.svg`
  };
}
