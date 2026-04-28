# FaceMirror 生图 Prompt 调整计划（2026-04-26）

## Requirements Summary
- 目标：将当前生图指令升级为“个人色彩分析图卡”风格，重点满足以下视觉与内容约束：
  - 基于上传人像生成高质感图卡，强调“适合色 / 不适合色”对比效果。
  - 保留主角五官、肤色、脸型和真实特征，不做明显脸部重塑。
  - 版面干净时尚，偏专业形象顾问报告，主视觉为主。
  - 文案极简，仅允许短标签（例如：`推荐`、`普通`、`避免`），避免长段文字。
  - 高分辨率，适合手机端与社交分享。
- 当前事实（代码证据）：
  - 当前 prompt 在 `apps/server/src/lib/poster.ts:89-98`，为英文拼接模板，未包含“适合/不适合色对比、标签约束、文字长度约束”等要求。
  - 当前调用为纯文本生图 `client.images.generate({ model, prompt, size })`，见 `apps/server/src/lib/poster.ts:102-106`。
  - 当前渲染阶段调用 `createPosterFile(renderBasePath, analysis)`，未传原图路径，见 `apps/server/src/index.ts:205-211`。
  - 记录结构已有 `localSourcePath`（可作为后续保真增强输入），见 `apps/server/src/types.ts:3-6`。

## Scope Decision
- 本轮按 P0 执行：先完成“Prompt 语义升级 + 输出约束”方案，不改前端交互，不改接口协议。
- 同步规划 P1：补齐“参考原图保真”的能力（需要后端渲染接口参数扩展）。

## Acceptance Criteria（可测试）
1. Prompt 语义满足：
- 包含“适合色/不适合色对比展示”要求。
- 包含“保留人物真实特征”要求。
- 包含“仅短标签，不输出长段文字”要求。
- 包含“高分辨率、社媒分享导向”要求。

2. 输出结果稳定性：
- `/api/render` 仍返回 `render_status: completed` 与可访问 `poster_url`（与现有链路一致）。
- 渲染失败时仍保留 SVG fallback，不破坏现有降级路径（`apps/server/src/lib/poster.ts:126-147`）。

3. 视觉结果抽样检查（手机端）：
- 抽样 5 次生成中，至少 4 次出现“对比色块或并排对比信息”视觉结构。
- 抽样 5 次生成中，至少 4 次满足“文本总量明显短于当前 M-05 长文版本”（以标签+短句为主）。

4. 回归检查：
- `analyzing -> rendering -> completed` 状态流不回归（既有 M-03/M-04/M-02 链路保持可用）。

## Implementation Steps
1. 改造 Prompt 生成器（P0）
- 文件：`apps/server/src/lib/poster.ts`
- 动作：将 `prompt` 从“通用时尚海报描述”改为“色彩分析图卡专用模板”，并显式加入：
  - 人像真实特征保留约束。
  - 适合色/不适合色对比展示约束（左右/并排）。
  - 文案最小化约束（仅标签：推荐/普通/避免）。
  - 输出风格与清晰度约束（高解析、社媒友好）。

2. 收敛动态字段注入策略（P0）
- 文件：`apps/server/src/lib/poster.ts`
- 动作：保留 `posterBrief/skinTone/undertone/dominantColors/recommendations` 注入，但限制其进入“视觉引导字段”，避免触发模型生成长段文字。

3. 为 P1 预留接口（仅规划，不在本轮上线）
- 文件：`apps/server/src/lib/poster.ts`、`apps/server/src/index.ts`、`apps/server/src/types.ts`
- 动作：设计 `createPosterFile` 新签名（可选 `sourceImagePath`），后续用于 reference image / edit 模式，以提升“人像保真”达成率。

4. 最小验证
- 命令：`npm run --workspace @facemirror/server build`
- 命令：本地触发一次 `/api/analyze` + `/api/render`，确认返回与落盘正常。
- 手机端验证：复用当前内网地址进行 1 条真实闭环抽样。

## Options & Trade-offs
### Option A（推荐）：P0 仅改 Prompt
- 优点：实现快、风险低、对现有流程侵入小。
- 缺点：无法严格保证“五官百分百保真”，模型仍可能出现轻微重绘。

### Option B：直接上参考图生图（P1）
- 优点：更接近“保留主角真实特征”目标。
- 缺点：需要改后端调用协议与错误处理，验证面更大，不适合当前 Checkpoint 节奏直接插入。

## Risks and Mitigations
- 风险 1：仅靠文本 Prompt，人物保真不稳定。
- 缓解：P0 中强化“identity preservation”约束；P1 切换参考图模式。

- 风险 2：模型仍输出长文。
- 缓解：Prompt 明确“labels only + no long paragraph”；对动态字段做短句化。

- 风险 3：视觉版式偶发偏离（未出现并排对比）。
- 缓解：在 Prompt 中加入强结构语句（split view / side-by-side comparison）并做 5 次抽样验收。

## Verification Steps
1. 代码验证
- 检查 `apps/server/src/lib/poster.ts` 的 Prompt 文本是否完整覆盖新要求。

2. 构建验证
- 执行 `npm run --workspace @facemirror/server build`。

3. 接口验证
- 跑一轮 `analyze -> render -> result`，确认 `poster_url` 可访问。

4. 手机闭环验证
- 在手机端打开当前地址，上传真人照片，截图留存 M-03 / M-04 / M-05 对应状态。

5. 验收判定
- 若满足 Acceptance Criteria 1-4，则 P0 通过；否则记录失败样本并进入 P1 设计实施。

## Deliverables
- 计划文档：`.omx/plans/2026-04-26-image-prompt-rework-plan.md`
- 下一执行入口：按本计划 Step 1 开始改 `apps/server/src/lib/poster.ts`
