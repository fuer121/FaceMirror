# Agent 协作系统

## 目标

本目录用于固化项目级 agent 体系，保证角色稳定、任务可拆、状态可查、交付可验。

---

## 角色列表

默认角色固定为：

1. `总控 Agent`
2. `产品 Agent`
3. `开发 Agent`
4. `UI Agent`
5. `测试 Agent`

规则：

- 角色名称长期固定，跨项目复用
- 模块 owner 按项目和阶段动态分配
- 总控不默认承担大规模编码
- 任务交付统一走 PR

---

## 文档地图

- 总规则入口：`AGENTS.md`
- 总体协作说明：`docs/agents/AGENT_SYSTEM.md`
- 总控角色：`docs/agents/ROLE_CONTROLLER.md`
- 产品角色：`docs/agents/ROLE_PRODUCT.md`
- 开发角色：`docs/agents/ROLE_DEV.md`
- UI 角色：`docs/agents/ROLE_UI.md`
- 测试角色：`docs/agents/ROLE_QA.md`
- 平台角色：`docs/agents/ROLE_PLATFORM.md`
- 数据角色：`docs/agents/ROLE_DATA.md`
- 开发拆分规则：`docs/agents/DEV_SPLIT_RULES.md`
- 任务模板：`docs/agents/TASK_CONTRACT_TEMPLATE.md`
- 交接模板：`docs/agents/HANDOFF_TEMPLATE.md`
- 状态模板：`docs/agents/STATUS_UPDATE_TEMPLATE.md`
- 平台手动操作 Runbook：`docs/release/MANUAL_PLATFORM_OPERATIONS.md`
- 经验库：`docs/knowledge/VIBE_CODING_PLAYBOOK.md`
- 经验草稿模板：`docs/knowledge/LESSON_CAPTURE_TEMPLATE.md`

---

## 运行方式

- 总控负责读取基线文档、拆分任务、分配 owner、检查阶段准入
- 各角色按 Task Contract 执行任务，不以聊天替代交付
- 共享状态统一回写到仓库内文档
- 代码交付统一通过 PR 收口
- 涉及真实设备、系统授权、平台账号、签名或 Health app 观察结果的操作，统一按 `docs/release/MANUAL_PLATFORM_OPERATIONS.md` 执行并回传

---

## 经验沉淀机制

- 经验沉淀由总控主导，不由各角色各自维护独立经验库
- 项目文档记录“本项目发生了什么”，经验库记录“以后类似情况应该怎么做”
- 以下场景可触发候选经验判断：
  - 一个阶段结束
  - 同类问题连续出现两次及以上
  - 某次协作方式明显提升效率或质量
  - 某个失误具有普遍代表性
- 收录流程：
  1. 在状态更新或 checkpoint 中标记候选经验
  2. 由总控抽象为方法论
  3. 与已有经验去重
  4. 写入经验库
- 不满足“典型、方法论、可复用、可教学”四条件的内容不得收录

---

## 可选扩展角色

默认模板之外，可按项目复杂度启用以下角色：

1. `平台 Agent`
2. `数据 Agent`

启用规则：

- 若任务核心问题是部署、环境、CI/CD、密钥、监控，启用 `平台 Agent`
- 若任务核心问题是 schema、migration、一致性、数据回滚，启用 `数据 Agent`
- 扩展角色启用后，相关任务不继续模糊归入 `开发 Agent`
- `开发 Agent` 负责实现，不应长期兼任平台与数据 owner

交接原则：

- `平台 Agent` 与总控、测试、发布清单协同
- `数据 Agent` 与开发、测试、发布清单协同
- 涉及平台或数据的任务，必须在 Task Contract 中显式标注

---

## 角色实例化规则

- 小项目默认启用：总控、产品、开发、测试
- 界面密集型项目启用：总控、产品、开发、UI、测试
- 并行开发压力上升时，按 `DEV_SPLIT_RULES.md` 将开发 Agent 拆为 `开发 Agent 1 / 开发 Agent 2`
- 出现部署或数据库边界时，优先考虑启用扩展角色，而不是继续堆叠开发实例

---

## 启停原则

- 角色常驻于文档
- 实例按阶段创建，不要求长期全部常驻
- 无明确 owner 模块时，不创建额外开发实例
- 若文件边界切不清，不允许通过增加实例强行并行
