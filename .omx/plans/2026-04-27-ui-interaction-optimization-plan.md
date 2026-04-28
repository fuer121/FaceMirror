# FaceMirror UI / 文案 / 交互优化计划（2026-04-27）

## Requirements Summary
- 当前目标：优化页面 UI、文案和交互，让核心功能更前置，减少用户依赖上下滑动完成主链路。
- 用户明确问题：
  - 模块太分散。
  - 核心上传/分析功能没有在首屏被直接触达。
  - 交互过于依赖纵向滚动，没有使用更高效的页面交互方式。
- 当前代码事实：
  - 首屏 Hero 只提供文案和插画，上传入口是锚点按钮，真实上传区位于后续 `workspace-grid`，见 `apps/web/src/App.tsx:212`、`apps/web/src/App.tsx:238`。
  - 能力模块 `capabilityCards` 是静态展示，未驱动上传流程或模式切换，见 `apps/web/src/App.tsx:227`。
  - 主流程仍是上传卡与结果卡并列在后续区域，见 `apps/web/src/App.tsx:238-317`。
  - CSS 将 Hero、能力卡、工作区、Roadmap 纵向堆叠，滚动层级较长，见 `apps/web/src/styles.css:82`、`apps/web/src/styles.css:184`、`apps/web/src/styles.css:237`、`apps/web/src/styles.css:520`。

## Product Direction
把首页从“宣传页 + 下方工作区”改为“首屏可操作的 AI Beauty Console”：
- 首屏即包含核心上传入口、当前能力选择、处理状态和结果预览位。
- 能力扩展采用横向/标签式模块切换，而不是下方静态说明卡。
- Hero 插画从主体降级为氛围/品牌辅助，不抢占核心功能区域。
- 文案从“介绍型”改为“行动型”，减少解释，强化当前可做什么。

## Acceptance Criteria
1. 首屏触达
- 桌面宽度 `>= 1024px` 时，上传入口、主 CTA、当前能力「色彩分析」必须在首屏无需滚动可见。
- 手机宽度 `390px x 844px` 时，进入页面后第一屏必须看到「选择照片」或等价上传入口。

2. 交互效率
- 用户完成上传入口触达不依赖锚点跳转。
- 能力模块从静态卡片改为可点击的模式选择控件；当前仅 `色彩分析` 可用，其它能力显示 `即将开放`，但保留统一数据结构。
- 上传后同一工作台内即时显示预览、状态和下一步 CTA，不跳转到页面下方区域。

3. 文案质量
- 首屏主标题不超过 22 个中文字符。
- 首屏辅助文案不超过 2 行。
- 按钮文案明确动作：如 `上传照片`、`生成色彩报告`、`重新选择`。
- 不再使用偏泛的「美学分析报告」作为唯一主卖点，当前能力要明确写出「个人色彩分析」。

4. 扩展能力
- UI 数据结构支持至少 4 个 analysis modes：`color`、`hair`、`style`、`makeup`。
- 当前实现不需要接后端多模式，但模式选择状态应能作为未来 API 参数接入点。

5. 回归
- 现有状态流 `idle -> ready -> analyzing -> rendering -> done/error` 不回归。
- `result` URL 打开页面仍能展示结果状态和结果图。
- `npm run --workspace @facemirror/web build` 通过。

## Proposed Information Architecture
### 1. 首屏 Console
- 左侧：短 Hero 文案 + 能力切换 Tabs。
- 中间：上传 Dropzone / 已选照片预览 / CTA。
- 右侧：结果状态卡 / 生成中状态 / 结果缩略图。
- 插画：作为右上角或背景侧栏的裁切视觉，不占主操作路径。

### 2. 能力切换
- 使用 segmented control 或横向 tabs：
  - `色彩分析`：可用。
  - `发型分析`：即将开放。
  - `穿搭分析`：即将开放。
  - `妆容建议`：即将开放。
- 点击未开放能力时，不跳转、不弹复杂弹窗，只在同一区域显示简短提示和灰态 CTA。

### 3. 状态反馈
- 上传前：结果位显示「等待照片」和报告样式预览骨架。
- 上传后：显示文件名、预览、可重新选择。
- 分析中/出图中：使用同一状态区域显示进度步骤，不把用户推到下方结果区。
- 完成后：结果图在同一工作台右侧展示，提供 `查看结果图` 和 `重新分析`。

### 4. 次级说明
- 隐私、格式限制、24 小时失效、发型/穿搭扩展路线移动到首屏底部的 compact meta bar。
- 删除或压缩当前底部 `roadmap-panel`，避免滚动后重复表达扩展能力。

## Implementation Steps
1. 重构 `App.tsx` 页面结构
- 文件：`apps/web/src/App.tsx`
- 将 `hero-panel`、`capability-strip`、`workspace-grid` 合并为一个首屏 `console-shell`。
- 新增 `analysisModes` 数据结构和 `selectedMode` 状态。
- 上传、状态、结果预览都放入同一个 Console 布局。

2. 调整文案
- 文件：`apps/web/src/App.tsx`
- Hero 主标题建议：`个人色彩分析，一张照片生成。`
- 辅助文案建议：`上传清晰单人照，生成适合色、不适合色和个人报告图。`
- 主 CTA：
  - 未上传：`上传照片`
  - 已上传：`生成色彩报告`
  - 处理中：`分析中...` / `出图中...`
  - 完成：`重新选择照片`

3. 重写布局样式
- 文件：`apps/web/src/styles.css`
- 建立首屏布局：
  - Desktop：`grid-template-columns: 0.8fr 1fr 0.9fr`
  - Tablet/Mobile：上传区前置，结果区紧随其后。
- 降低插画占比，作为品牌视觉层或 compact visual card。
- 移除长纵向模块堆叠造成的滚动依赖。

4. 设计交互状态
- 文件：`apps/web/src/App.tsx`
- 未开放能力点击后设置轻量提示状态，例如 `该能力即将开放`。
- 当前可用能力仍只走现有 `handleAnalyze`。
- 保持 `resultId` URL 恢复逻辑不变。

5. 验证与微调
- 命令：`npm run --workspace @facemirror/web build`
- 浏览器检查：
  - 桌面 `1440 x 900`
  - 手机 `390 x 844`
- 验证核心上传入口在首屏可见。
- 验证长文件名、错误文案、生成中状态不撑破布局。

## Options Considered
### Option A：首屏三栏 Console（推荐）
- 优点：核心功能前置，上传/状态/结果在一个视野内，扩展能力也能作为模式控件自然接入。
- 缺点：需要较大 CSS 重构，移动端需要单独调优。

### Option B：保留当前纵向结构，只把上传区移到 Hero
- 优点：改动较小。
- 缺点：能力扩展、结果状态、上传入口仍分散，不能根治“依赖上下滑动”。

### Option C：移动端优先底部 Sheet / Sticky Action
- 优点：手机交互效率高。
- 缺点：桌面体验仍需额外布局，复杂度高于当前阶段需要。

## Risks and Mitigations
- 风险：首屏信息过密，反而降低设计感。
- 缓解：只保留一个主任务、一个模式切换、一个结果状态位；隐私和格式限制压缩为 meta bar。

- 风险：未来多能力模式状态与现有 API 不一致。
- 缓解：先只在前端保留 `selectedMode`，后端参数后续再接，不改当前 API 合约。

- 风险：手机端三栏布局折叠后仍需要滚动。
- 缓解：移动端顺序固定为 `能力选择 -> 上传 -> CTA -> 状态`，让第一屏直接触达上传。

## Verification Steps
1. 静态检查
- `npm run --workspace @facemirror/web build`

2. 功能检查
- 首页无 query 时，上传入口首屏可见。
- 上传图片后，预览出现且 CTA 变为可点击。
- 点击 `生成色彩报告` 后，状态按 `分析中 -> 出图中 -> 完成` 显示。
- 访问 `?result=<job_id>` 时，直接进入结果展示，不丢失结果图。

3. 视觉检查
- 桌面首屏不需要滚动即可看到上传与结果状态。
- 手机首屏看到上传入口和当前能力。
- 未开放能力灰态明确，不误导为可用功能。

## Deliverable
- 计划文件：`.omx/plans/2026-04-27-ui-interaction-optimization-plan.md`
- 建议下一步：按 Option A 执行 UI 重构。
