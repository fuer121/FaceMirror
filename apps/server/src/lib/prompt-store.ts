import path from "node:path";
import { config } from "../config.js";
import { hasPostgres, query } from "./db.js";
import { ensureDir, readJsonFile, writeJsonFile } from "./fs.js";
import type { AnalysisMode, PromptConfig } from "@facemirror/shared";

type PromptStoreShape = {
  prompts: PromptConfig[];
};

const defaultPrompts: Record<AnalysisMode, Omit<PromptConfig, "updated_at">> = {
  color: {
    feature: "color",
    title: "色彩分析",
    prompt: [
      "请根据上传的人像照片，生成一张高质感「个人色彩分析报告」图卡。分析重点包括：肤色冷暖倾向、明度 Value、饱和度 Chroma、五官与发色的整体对比度 Contrast，并给出适合色、不适合色和日常用色方向。",
      "",
      "画面结构：",
      "1. 顶部标题：个人色彩分析报告 / Personal Color Analysis。",
      "2. 主视觉保留人物真实五官、肤色、脸型和气质，呈现清晰自然的人像。",
      "3. 右侧或中部展示色彩类型，例如：暖春、柔夏、深秋、冷冬、清透中性、柔和暖调等。",
      "4. 展示 3 个专业维度：冷暖、明度、饱和度，用短标签表达，例如「中性偏暖」「中高明度」「柔和低饱和」。",
      "5. 展示一排推荐色票，包含中文色名，例如奶油白、杏桃粉、鼠尾草绿、雾蓝、可可棕。",
      "6. 用左右或上下对比展示「推荐色」和「避免色」，让同一人物穿不同颜色服装，一眼看出气色变化。",
      "7. 每个对比图只使用短标签，例如：显气色、提亮、柔和、显暗沉、偏疲惫、过抢眼。",
      "8. 底部给 3 条极短建议：上衣色、口红色、配饰金属色。",
      "",
      "视觉风格：",
      "干净、明亮、专业形象顾问报告风；留白充足；浅色高级背景；适合小红书/朋友圈分享；文字少但信息密度高；避免大段解释；避免暗黑厚重杂志风。"
    ].join("\n")
  },
  hair: {
    feature: "hair",
    title: "发型分析",
    prompt: [
      "请根据上传的人像照片，生成一张高质感「个人发型分析报告」图卡。分析重点包括：脸型轮廓、额头比例、颧骨存在感、下颌线、五官量感、发量发质观感，并给出适合的长度、层次、刘海、卷度和发色方向。",
      "",
      "画面结构：",
      "1. 顶部标题：个人发型分析报告 / Hair Style Analysis。",
      "2. 主视觉保留人物真实五官、脸型、肤色、表情和气质，不改变身份特征。",
      "3. 展示脸型判断短标签，例如：鹅蛋脸、圆脸、方圆脸、长脸、心形脸、菱形脸，若不确定可写「偏鹅蛋」「偏方圆」。",
      "4. 展示 3 个专业维度：脸型比例、发量层次、风格气质，例如「下颌偏柔」「适合轻层次」「温柔清透」。",
      "5. 生成 3-4 个发型效果小图，必须是同一人物：推荐发型、可尝试发型、谨慎发型、避免发型。",
      "6. 推荐方向可包含：锁骨发、长层次、法式刘海、八字刘海、空气刘海、低层次卷、自然大弯、柔和棕色等。",
      "7. 避免方向用短标签说明，例如：压低比例、显脸宽、显沉重、拉长脸型、遮挡五官。",
      "8. 底部给 3 条极短建议：长度、刘海、卷度/发色。",
      "",
      "视觉风格：",
      "像专业发型顾问的可视化报告；明亮、精致、清爽；用短标签和对比图表达专业判断；不要长段文字；不要夸张变脸或过度网红化；适合社交分享。"
    ].join("\n")
  },
  style: {
    feature: "style",
    title: "穿搭分析",
    prompt: [
      "请根据上传的人像照片，生成一张高质感「个人穿搭风格分析报告」图卡。分析重点包括：人物气质、面部线条、肤色冷暖、视觉量感、比例平衡、服装线条、色彩、材质和场景适配，并给出适合的穿搭风格方向。",
      "",
      "画面结构：",
      "1. 顶部标题：个人穿搭分析报告 / Outfit Style Analysis。",
      "2. 主视觉保留人物真实五官、肤色、脸型和气质，展示自然清晰的人像。",
      "3. 展示风格关键词，例如：清爽通勤、温柔知性、松弛休闲、精致轻熟、自然文艺、利落都市。",
      "4. 展示 4 个专业维度：线条 Line、比例 Proportion、色彩 Color、质感 Texture。",
      "5. 生成 3-4 套同一人物穿搭效果：推荐通勤、推荐日常、可尝试风格、谨慎/避免风格。",
      "6. 每套穿搭用短标签说明，例如：拉长比例、提升气质、显轻盈、显沉闷、比例被截断、风格不统一。",
      "7. 推荐应体现服装廓形、领口、腰线、下装长度、材质轻重和色彩搭配。",
      "8. 底部给 3 条极短建议：上衣廓形、下装比例、主色/点缀色。",
      "",
      "视觉风格：",
      "专业形象顾问报告风；高级、干净、有留白；图片对比比文字更重要；文字只用短标签；避免大段穿搭解释；避免夸张秀场感；适合手机端保存分享。"
    ].join("\n")
  },
  makeup: {
    feature: "makeup",
    title: "妆容分析",
    prompt: [
      "请根据上传的人像照片，生成一张高质感「个人妆容分析报告」图卡。分析重点包括：肤色冷暖、肤色明度、五官量感、眼型特点、眉眼距离、面部留白、唇色适配，并给出底妆、眉形、眼妆、腮红、唇色的专业建议。",
      "",
      "画面结构：",
      "1. 顶部标题：个人妆容分析报告 / Makeup Style Analysis。",
      "2. 主视觉保留人物真实五官、肤色、脸型、表情和气质，不改变身份特征。",
      "3. 展示妆容类型关键词，例如：清透自然、柔和暖调、低饱和高级、明亮元气、轻熟精致、冷感干净。",
      "4. 展示 4 个专业维度：底妆 Base、眉眼 Eye、腮红 Blush、唇色 Lip。",
      "5. 生成 3-4 个同一人物妆容效果：日常推荐、提气色推荐、精致场景、避免方向。",
      "6. 每个效果使用短标签，例如：自然提亮、柔和放大、显干净、显疲惫、颜色过重、妆感不协调。",
      "7. 底妆建议关注通透度和遮瑕层次；眼妆建议关注眼型放大和眼线方向；腮红建议关注位置和提升感；唇色建议结合肤色冷暖。",
      "8. 底部给 3 条极短建议：底妆质感、眼妆色系、腮红/唇色。",
      "",
      "视觉风格：",
      "像专业彩妆顾问报告；干净、柔和、明亮、精致；以妆容前后效果和色卡为主；少文字、短标签；不要长段解释；不要浓妆模板化；适合社交分享。"
    ].join("\n")
  }
};

const featureOrder: AnalysisMode[] = ["color", "hair", "style", "makeup"];
let promptQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function createDefaultPrompt(feature: AnalysisMode): PromptConfig {
  return {
    ...defaultPrompts[feature],
    updated_at: nowIso()
  };
}

function withPromptLock<T>(operation: () => Promise<T>) {
  const run = promptQueue.then(operation, operation);
  promptQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function normalizeStore(store: PromptStoreShape) {
  const existing = new Map(store.prompts.map((prompt) => [prompt.feature, prompt]));
  return {
    prompts: featureOrder.map((feature) => existing.get(feature) ?? createDefaultPrompt(feature))
  };
}

async function loadStore() {
  if (hasPostgres()) {
    const result = await query<{
      feature: AnalysisMode;
      title: string;
      prompt: string;
      updated_at: Date;
    }>("SELECT feature, title, prompt, updated_at FROM prompt_configs ORDER BY feature ASC");
    return normalizeStore({
      prompts: result.rows.map((row) => ({
        feature: row.feature,
        title: row.title,
        prompt: row.prompt,
        updated_at: row.updated_at.toISOString()
      }))
    });
  }

  await ensureDir(config.dataDir);
  return normalizeStore(await readJsonFile<PromptStoreShape>(config.promptDbFile, { prompts: [] }));
}

async function saveStore(next: PromptStoreShape) {
  await ensureDir(path.dirname(config.promptDbFile));
  await writeJsonFile(config.promptDbFile, normalizeStore(next));
}

export function isAnalysisMode(value: unknown): value is AnalysisMode {
  return typeof value === "string" && featureOrder.includes(value as AnalysisMode);
}

export async function listPromptConfigs() {
  const store = await loadStore();
  return store.prompts;
}

export async function getPromptConfig(feature: AnalysisMode) {
  const store = await loadStore();
  return store.prompts.find((prompt) => prompt.feature === feature) ?? createDefaultPrompt(feature);
}

export async function updatePromptConfig(feature: AnalysisMode, promptValue: unknown) {
  const prompt = typeof promptValue === "string" ? promptValue.trim() : "";
  if (prompt.length < 20) {
    throw new Error("Prompt 至少需要 20 个字符。");
  }
  if (prompt.length > 4000) {
    throw new Error("Prompt 不能超过 4000 个字符。");
  }

  return withPromptLock(async () => {
    if (hasPostgres()) {
      const next: PromptConfig = {
        feature,
        title: defaultPrompts[feature].title,
        prompt,
        updated_at: nowIso()
      };
      await query(
        `
          INSERT INTO prompt_configs (feature, title, prompt, updated_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (feature) DO UPDATE SET
            title = EXCLUDED.title,
            prompt = EXCLUDED.prompt,
            updated_at = EXCLUDED.updated_at
        `,
        [next.feature, next.title, next.prompt, next.updated_at]
      );
      return next;
    }

    const store = await loadStore();
    const index = store.prompts.findIndex((entry) => entry.feature === feature);
    const next: PromptConfig = {
      feature,
      title: defaultPrompts[feature].title,
      prompt,
      updated_at: nowIso()
    };

    if (index >= 0) {
      store.prompts[index] = next;
    } else {
      store.prompts.push(next);
    }

    await saveStore(store);
    return next;
  });
}
