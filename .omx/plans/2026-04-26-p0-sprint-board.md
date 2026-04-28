# FaceMirror 当前 Sprint 看板

## Sprint 信息

- Sprint 名称：P0 稳定真实链路
- 对应计划：[2026-04-26-facemirror-replan.md](/Users/fuer/Documents/FaceMirror/FaceMirror/.omx/plans/2026-04-26-facemirror-replan.md)
- 对应合同：[2026-04-26-p0-task-contracts.md](/Users/fuer/Documents/FaceMirror/FaceMirror/.omx/plans/2026-04-26-p0-task-contracts.md)
- Sprint 目标：稳定完成真实 `上传 -> 分析 -> 出图 -> 查看结果` 闭环，并让手机真机可验证
- 当前总状态：待执行

## Sprint 范围

本期只做四件事：

- 后端分析兼容层稳定化
- 生图失败时的稳定 SVG 降级
- 前端状态与错误反馈补齐
- 桌面 + 手机真机验证矩阵

本期明确不做：

- P1 结果页重构
- 数据库迁移
- 登录、支付、社区、推荐等扩需求

## 当前泳道

### Lane 1

- 任务：总控编排与阶段门禁
- owner：总控 Agent
- 当前状态：待启动
- 交付物：
  - owner 分配
  - checkpoint 节奏
  - P0 准入结论
- 依赖：无
- 完成定义：
  - 四条泳道都有人负责
  - 阶段门禁被明确写死

### Lane 2

- 任务：后端分析兼容层与生图降级稳定化
- owner：开发 Agent
- 当前状态：待启动
- 主要范围：
  - [apps/server/src/lib/analysis.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/analysis.ts:84)
  - [apps/server/src/lib/openai.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/openai.ts)
  - [apps/server/src/lib/poster.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/poster.ts:78)
  - [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:162)
- 完成定义：
  - 空 `content` / 非 JSON / schema 不合法都能被区分
  - `POST /api/render` 在 AI 生图失败时仍返回 SVG 降级成功
  - `npm run build` 通过
- 依赖：无
- 当前风险：
  - 第三方兼容模型返回格式继续变化
  - 生图 timeout 波动

### Lane 3

- 任务：前端状态反馈与错误可见化
- owner：UI Agent
- 当前状态：待启动
- 主要范围：
  - [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:44)
  - [apps/web/src/api.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/api.ts)
  - [apps/web/src/styles.css](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/styles.css)
- 完成定义：
  - 页面可区分 `analyzing` / `rendering`
  - 页面能展示后端错误消息
  - 手机端展示不破版
- 依赖：
  - 依赖 Lane 2 提供更稳定的后端错误分类
- 当前风险：
  - 若后端错误分类不清晰，前端提示只能继续模糊

### Lane 4

- 任务：真机联调与失败样例验证
- owner：测试 Agent
- 当前状态：待启动
- 交付物：
  - 桌面闭环验证记录
  - 手机闭环验证记录
  - 失败样例矩阵
  - 通过 / 阻塞 / 风险结论
- 完成定义：
  - 至少完成一轮桌面闭环
  - 至少完成一轮手机闭环
  - 覆盖非 JPG/PNG、模糊/低光、多人照、分析异常、生图异常
- 依赖：
  - 依赖 Lane 2 和 Lane 3 出第一轮可测版本
- 当前风险：
  - 局域网、防火墙、模型波动会影响结果稳定性

## 依赖顺序

1. 总控 Agent 发放合同并锁定 P0 范围
2. 开发 Agent 与 UI Agent 并行推进
3. UI Agent 对接开发 Agent 的错误输出
4. 测试 Agent 先跑桌面闭环
5. 桌面闭环通过后跑手机真机闭环
6. 总控 Agent 汇总风险并给出 P0 准入结论

## Sprint 门禁

P0 通过前，必须同时满足：

- `npm run build` 通过
- 桌面浏览器真实完成一轮 `analyze -> render -> result`
- 手机浏览器真实完成一轮 `analyze -> render -> result`
- AI 生图失败场景已验证 SVG 降级路径
- 前端可见错误提示已覆盖至少 3 类失败
- 总控已收到测试 Agent 的阶段结论

## 当前阻塞项

- Lane 2 尚未开始实现，后端错误分类和降级行为还没有正式收口
- Lane 3 依赖 Lane 2 的错误输出协议
- Lane 4 依赖可测版本产出后才能开始真机矩阵

## Daily Checkpoint 模板

每次 checkpoint 只看这 6 项：

- Lane 2 是否已跑通最小 analyze 协议回归
- Lane 2 是否已跑通生图失败 -> SVG 降级
- Lane 3 是否已把错误展示到页面
- Lane 3 是否已区分 `analyzing` / `rendering`
- Lane 4 是否已完成桌面闭环
- Lane 4 是否已完成手机闭环

## 建议节奏

- Checkpoint 1：开发/UI 完成第一轮可测版本
- Checkpoint 2：桌面闭环 + 失败样例首轮
- Checkpoint 3：手机闭环 + P0 准入判断

## 阶段结论口径

- `通过`：全部门禁满足
- `限制通过`：主链路可用，但仍存在已知低风险问题，不阻塞进入 P1
- `阻塞`：真实闭环仍不稳定，禁止进入 P1
