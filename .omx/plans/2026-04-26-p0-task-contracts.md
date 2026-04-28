# FaceMirror P0 Task Contract 清单

## 使用说明

本清单对应 [2026-04-26-facemirror-replan.md](/Users/fuer/Documents/FaceMirror/FaceMirror/.omx/plans/2026-04-26-facemirror-replan.md) 中的 `P0 技术可用版`，用于总控按角色分发任务，并作为阶段验收和 checkpoint 的统一基线。

P0 阶段目标：

- 稳定完成真实 `上传 -> 分析 -> 出图 -> 查看结果` 闭环
- 把分析兼容层、生图降级、前端错误反馈、真机联调收口到可验状态

---

## Task Contract 01

### 基本信息

- 任务名称：P0 阶段总控与门禁编排
- 任务目标：维护 P0 范围边界、串联开发/UI/测试依赖、在不扩 scope 的前提下完成阶段准入判断
- 优先级：P0
- 当前阶段：P0 / 稳定真实链路

### owner 与协作

- 直接 owner：总控 Agent
- 协作方：开发 Agent、UI Agent、测试 Agent
- 是否需要总控介入：是

### 输入与输出

- 输入文档：
  - [2026-04-26-facemirror-replan.md](/Users/fuer/Documents/FaceMirror/FaceMirror/.omx/plans/2026-04-26-facemirror-replan.md)
  - [AGENT_SYSTEM.md](/Users/fuer/Documents/FaceMirror/FaceMirror/agents/AGENT_SYSTEM.md)
  - [TASK_CONTRACT_TEMPLATE.md](/Users/fuer/Documents/FaceMirror/FaceMirror/agents/TASK_CONTRACT_TEMPLATE.md)
- 输入代码范围：
  - [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:98)
  - [apps/server/src/lib/analysis.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/analysis.ts:124)
  - [apps/server/src/lib/poster.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/poster.ts:78)
  - [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:44)
- 预期输出：
  - P0 子任务 owner 分配
  - checkpoint 清单
  - 阶段准入结论
  - 候选经验沉淀判断

### 执行边界

- 可修改文件范围：
  - `.omx/plans/`
  - `agents/` 下协作文档
- 不可擅自变更项：
  - 不直接替代开发完成主体编码
  - 不扩大到 P1 结果页重构或 P2 数据层迁移
- 是否允许自动化执行：是
- 是否需要子线程：否
- 是否需要 worktree：否
- 使用理由：任务以编排、判断、验收为主，主线程即可完成

### 经验沉淀判断

- 是否可能产生可复用经验：是
- 若是，候选主题：
  - 第三方兼容模型接入阶段的门禁设计
  - AI 能力不稳定时的 P0 收口方式

### 验收与风险

- 验收标准：
  - P0 范围内子任务完整覆盖分析兼容层、生图降级、前端反馈、真机验证四块
  - 每个子任务都有明确 owner、文件边界、验收标准和最快验证方式
  - 阶段门禁明确要求桌面和手机各完成至少一轮真实闭环验证
- 风险与依赖：
  - 依赖开发 Agent 先提供后端稳定错误分类
  - 依赖 UI Agent 落前端可见错误反馈
  - 依赖测试 Agent 提供真机验证结论
- 最快验证方式：
  - 逐条对照本清单和 P0 plan 检查是否覆盖

### 部署与数据影响

- 是否影响部署：否
- 是否影响环境变量：否
- 是否影响数据库：否
- 是否需要 migration：否
- 是否需要回滚方案：否
- 发布后验证方式：不适用

---

## Task Contract 02

### 基本信息

- 任务名称：P0 后端分析兼容层与生图降级稳定化
- 任务目标：把第三方兼容模型分析返回和生图失败降级都收敛为可预测行为，确保 render 不悬空、analyze 不只返回模糊 500
- 优先级：P0
- 当前阶段：P0 / 稳定真实链路

### owner 与协作

- 直接 owner：开发 Agent
- 协作方：总控 Agent、测试 Agent、UI Agent
- 是否需要总控介入：是

### 输入与输出

- 输入文档：
  - [2026-04-26-facemirror-replan.md](/Users/fuer/Documents/FaceMirror/FaceMirror/.omx/plans/2026-04-26-facemirror-replan.md)
  - [ROLE_DEV.md](/Users/fuer/Documents/FaceMirror/FaceMirror/agents/ROLE_DEV.md)
- 输入代码范围：
  - [apps/server/src/lib/analysis.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/analysis.ts:84)
  - [apps/server/src/lib/openai.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/openai.ts)
  - [apps/server/src/lib/poster.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/poster.ts:78)
  - [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:162)
- 预期输出：
  - 后端错误分类改进
  - 兼容模型空 `content` / 非 JSON / schema 错误兜底
  - 生图失败时稳定 SVG 降级
  - 必要测试或最小验证脚本

### 执行边界

- 可修改文件范围：
  - `apps/server/src/lib/analysis.ts`
  - `apps/server/src/lib/openai.ts`
  - `apps/server/src/lib/poster.ts`
  - `apps/server/src/index.ts`
  - `apps/server/src/scripts/`
  - 直接相关的测试文件或验证脚本
- 不可擅自变更项：
  - 不引入数据库
  - 不改前端页面结构
  - 不扩大到部署或运维体系
- 是否允许自动化执行：是
- 是否需要子线程：是
- 是否需要 worktree：否
- 使用理由：后端改动集中且边界清晰，适合单独开发线程推进

### 经验沉淀判断

- 是否可能产生可复用经验：是
- 若是，候选主题：
  - OpenAI 兼容模型在 JSON 输出上的防御式接入
  - 生图能力不稳定时的降级设计

### 验收与风险

- 验收标准：
  - 当第三方模型返回空 `content` 时，后端能给出明确错误或可控降级，不是无上下文 500
  - 当第三方模型返回非 JSON 或 schema 不符时，错误能被区分
  - 当 AI 生图失败时，`POST /api/render` 仍可产出 SVG 结果并返回 `completed`
  - `npm run build` 通过
- 风险与依赖：
  - 第三方模型返回形态可能继续变化
  - 生图上游 timeout 仍可能发生，但必须被降级吸收
- 最快验证方式：
  - 最小 analyze 协议测试
  - 最小 render 降级测试
  - 本地桌面一轮真实链路

### 部署与数据影响

- 是否影响部署：否
- 是否影响环境变量：可能
- 是否影响数据库：否
- 是否需要 migration：否
- 是否需要回滚方案：否
- 发布后验证方式：
  - 看 `/api/health`
  - 跑一轮真实 analyze/render

---

## Task Contract 03

### 基本信息

- 任务名称：P0 前端状态反馈与错误可见化
- 任务目标：让用户能分辨“分析中”“出图中”“失败原因”，把当前纯控制台错误转成页面可操作反馈
- 优先级：P0
- 当前阶段：P0 / 稳定真实链路

### owner 与协作

- 直接 owner：UI Agent
- 协作方：开发 Agent、产品 Agent、测试 Agent、总控 Agent
- 是否需要总控介入：是

### 输入与输出

- 输入文档：
  - [2026-04-26-facemirror-replan.md](/Users/fuer/Documents/FaceMirror/FaceMirror/.omx/plans/2026-04-26-facemirror-replan.md)
  - [ROLE_UI.md](/Users/fuer/Documents/FaceMirror/FaceMirror/agents/ROLE_UI.md)
- 输入代码范围：
  - [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:44)
  - [apps/web/src/api.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/api.ts)
  - [apps/web/src/styles.css](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/styles.css)
- 预期输出：
  - 处理阶段可见状态
  - 错误提示文案落位
  - 手机端可读的失败反馈

### 执行边界

- 可修改文件范围：
  - `apps/web/src/App.tsx`
  - `apps/web/src/api.ts`
  - `apps/web/src/styles.css`
- 不可擅自变更项：
  - 不改变后端核心协议
  - 不提前做 P1 结果页大重构
  - 不擅自新增复杂分享功能
- 是否允许自动化执行：是
- 是否需要子线程：是
- 是否需要 worktree：否
- 使用理由：前端展示层边界独立，适合与后端稳定化并行

### 经验沉淀判断

- 是否可能产生可复用经验：是
- 若是，候选主题：
  - AI 多阶段请求在手机端的状态反馈模式
  - 失败文案与可恢复引导的最小实现

### 验收与风险

- 验收标准：
  - 页面可区分 `analyzing` 和 `rendering`
  - 页面能展示后端返回的错误消息
  - 至少覆盖照片不合规、分析失败、出图失败三类提示
  - 手机端展示不破版
- 风险与依赖：
  - 依赖开发 Agent 提供更可区分的后端错误
  - 不应把 P1 摘要卡片混入本任务
- 最快验证方式：
  - 浏览器手动触发成功和失败路径
  - 手机浏览器查看状态与错误展示

### 部署与数据影响

- 是否影响部署：否
- 是否影响环境变量：否
- 是否影响数据库：否
- 是否需要 migration：否
- 是否需要回滚方案：否
- 发布后验证方式：
  - 手机局域网实际走一轮上传/失败/重试

---

## Task Contract 04

### 基本信息

- 任务名称：P0 真机联调与失败样例验证
- 任务目标：建立一套最小但可信的验证矩阵，证明桌面与手机都能跑通真实闭环，并记录失败样例表现
- 优先级：P0
- 当前阶段：P0 / 稳定真实链路

### owner 与协作

- 直接 owner：测试 Agent
- 协作方：总控 Agent、开发 Agent、UI Agent
- 是否需要总控介入：是

### 输入与输出

- 输入文档：
  - [2026-04-26-facemirror-replan.md](/Users/fuer/Documents/FaceMirror/FaceMirror/.omx/plans/2026-04-26-facemirror-replan.md)
  - [ROLE_QA.md](/Users/fuer/Documents/FaceMirror/FaceMirror/agents/ROLE_QA.md)
- 输入代码范围：
  - [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:98)
  - [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:44)
  - 当前本地联调环境和 `.env`
- 预期输出：
  - P0 验证矩阵
  - 真机验证记录
  - 失败样例结果与复现路径
  - 阶段门禁结论

### 执行边界

- 可修改文件范围：
  - `README.md`
  - `.omx/plans/`
  - 新增验证记录文档
- 不可擅自变更项：
  - 不直接重写业务实现
  - 不替代开发修逻辑
- 是否允许自动化执行：是
- 是否需要子线程：是
- 是否需要 worktree：否
- 使用理由：验证工作可独立推进，并为总控提供门禁结论

### 经验沉淀判断

- 是否可能产生可复用经验：是
- 若是，候选主题：
  - AI 图片分析类 H5 的真机联调清单
  - 模型不稳定条件下的发布前门禁

### 验收与风险

- 验收标准：
  - 至少完成桌面浏览器一轮真实闭环验证
  - 至少完成手机浏览器一轮真实闭环验证
  - 至少覆盖五类失败用例：非 JPG/PNG、模糊/低光、多人照、分析上游异常、生图上游异常
  - 输出通过 / 阻塞 / 风险结论
- 风险与依赖：
  - 依赖前后端先达到可测状态
  - 真机网络、局域网、防火墙可能干扰结果
- 最快验证方式：
  - 按固定图片样例和手机地址快速跑完验证矩阵

### 部署与数据影响

- 是否影响部署：否
- 是否影响环境变量：否
- 是否影响数据库：否
- 是否需要 migration：否
- 是否需要回滚方案：否
- 发布后验证方式：
  - 沿用同一套真机验证矩阵作为 smoke test

---

## P0 依赖顺序

1. 总控 Agent 先发放本清单并锁定 P0 边界。
2. 开发 Agent 与 UI Agent 并行推进。
3. 测试 Agent 在开发/UI 产出第一轮后开始桌面验证。
4. 桌面通过后进入手机真机验证。
5. 总控 Agent 汇总风险，判断是否达到 P0 准入。

## P0 Done Definition

- 后端真实分析和出图链路可稳定完成一轮
- 生图失败时 SVG 降级路径被验证
- 前端能展示关键处理状态和错误原因
- 手机局域网完成至少一轮真实验证
- `npm run build` 通过
- 总控输出阶段结论：通过 / 阻塞 / 限制通过
