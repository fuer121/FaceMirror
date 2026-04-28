# FaceMirror 需求重规划

## Requirements Summary

目标是把当前 FaceMirror 从“可联调的技术验证版”收敛为一份可执行的产品计划，先确保真实链路稳定，再补用户体验和可运营能力。

当前代码事实：

- 前端主链路已经具备上传、分析、出图、结果回看能力，入口在 [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:8)。
- 前端当前流程是顺序执行 `analyze -> render -> fetchResult`，没有更细粒度的失败恢复和重试控制，见 [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:44)。
- 后端已提供 `POST /api/analyze`、`POST /api/render`、`GET /api/result/:id`、`DELETE /api/result/:id`、`GET /api/health`，见 [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:88) 和 [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:98)。
- 分析链路已经兼容 OpenAI 官方和第三方兼容接口，第三方模式下会切到 `chat.completions`，见 [apps/server/src/lib/analysis.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/analysis.ts:80) 和 [apps/server/src/lib/analysis.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/analysis.ts:124)。
- 生图链路已拆分独立凭证，并且失败时会回退为 SVG 海报，见 [apps/server/src/lib/poster.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/poster.ts:78) 和 [apps/server/src/lib/poster.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/poster.ts:119)。
- 当前“单人脸判断”依赖 LLM 返回结构化字段，并非传统 CV 检测，见 [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:111) 和 [apps/server/src/lib/analysis.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/analysis.ts:6)。
- 当前结果存储仍是本地文件存储，没有数据库、任务队列和后台可观测性，证据在 [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:151) 和 README 的项目结构说明 [README.md](/Users/fuer/Documents/FaceMirror/FaceMirror/README.md:7)。

本次重规划默认范围：

- 优先做稳定的真实分析与出图闭环
- 不在本轮引入账号体系、支付、推荐算法、复杂分享裂变
- 不把当前 demo 直接推进到生产级多租户系统

## Acceptance Criteria

### P0 技术可用版

- 手机和桌面都能完成一次真实的 `上传 -> 分析 -> 出图 -> 查看结果` 流程，成功率目标在本地联调环境达到 `>= 80%`。
- 当分析模型返回空 `content`、非 JSON、结构缺字段、超时或鉴权失败时，后端返回明确可区分错误，前端能展示可操作提示，而不是只有通用报错。
- 当生图上游超时或失败时，系统必须稳定产出 SVG 降级海报，不允许 render 请求无结果悬空。
- 局域网手机访问路径固定可用，至少一台 iPhone 或 Android 真机完成验证。

### P1 产品闭环版

- 前端提供清晰的处理中状态：上传中、分析中、生成海报中、失败。
- 结果页支持真正复制分享链接，而不是仅跳当前页。
- 结果页展示结构化分析摘要，不只是一张海报图，至少包含肤色、冷暖调、整体印象和 3 条建议。
- 分析失败和图片不合规的场景，用户能理解为什么失败，以及下一步如何重试。

### P2 可运营版

- 存储从本地 JSON 文件迁移到可并发的数据层，至少支持结果记录查询、过期清理和删除。
- 生图与分析请求有基础日志与耗时统计，能区分模型错误、网络错误、用户输入错误。
- 部署方案形成最小闭环：环境变量约定、反向代理、进程托管、静态资源发布流程。

## Implementation Steps

### Phase P0: 稳定真实链路

1. 固化分析链路的模型兼容层
目标文件：
- [apps/server/src/lib/analysis.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/analysis.ts:80)
- [apps/server/src/lib/openai.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/openai.ts)

工作内容：
- 针对第三方兼容模型返回 `reasoning_content` 但 `content` 为空的情况，加一层安全解析和兜底。
- 区分 JSON 解析失败、schema 校验失败、上游鉴权失败、上游超时。
- 为分析失败补更明确的错误类型，供前端识别。

2. 固化生图链路的降级行为
目标文件：
- [apps/server/src/lib/poster.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/poster.ts:78)
- [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:172)

工作内容：
- 明确把“真实生图失败 -> SVG 降级成功”定义为成功路径的一部分。
- 为 render 结果增加来源标记，便于判断本次是 AI 图还是 SVG 降级图。
- 对超时、空图响应、模型不支持等错误做日志区分。

3. 前端补状态和错误反馈
目标文件：
- [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:44)
- [apps/web/src/api.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/api.ts)
- [apps/web/src/styles.css](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/styles.css)

工作内容：
- 拆出 `analyzing` 和 `rendering` 的独立视觉反馈。
- 把后端错误消息展示到页面，而不是只 `console.error`。
- 为不合规照片、服务超时、模型失败提供不同提示文案。

4. 建立最小真机验收脚本
目标文件：
- [README.md](/Users/fuer/Documents/FaceMirror/FaceMirror/README.md:24)
- 新增 `docs/` 或 `.omx/` 下的联调说明文档

工作内容：
- 固定手机访问步骤、Wi-Fi 前提、局域网地址修改方式。
- 写出一套标准测试照片和预期表现。

### Phase P1: 产品体验闭环

5. 重构结果页表达
目标文件：
- [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:127)
- [packages/shared/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/packages/shared/src/index.ts:13)

工作内容：
- 在海报图之外显示结构化分析摘要卡片。
- 明确区分“快速结论”“风险提醒”“彩妆建议”。
- 检查共享类型是否需要补字段以支持更完整展示。

6. 完成真正的分享与回看体验
目标文件：
- [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:151)
- [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:235)

工作内容：
- 把“复制链接”改为真实复制。
- 校验 `?result=` 回看链路在手机浏览器中稳定工作。
- 为结果过期提供明确提示页。

7. 提升输入质量控制
目标文件：
- [apps/web/src/App.tsx](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/web/src/App.tsx:104)
- [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:105)

工作内容：
- 强化前端上传提示。
- 增加失败样例说明，如多人照、过暗、模糊、遮挡。
- 明确用户可接受图片标准。

### Phase P2: 可运营化

8. 替换文件存储为更稳的数据层
目标文件：
- [apps/server/src/lib/store.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/store.ts)
- [apps/server/src/types.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/types.ts:1)

工作内容：
- 设计结果记录 schema。
- 迁移过期清理逻辑。
- 评估 SQLite / Postgres 两条路线，默认优先 SQLite 作为轻量上线版。

9. 增加日志和观测
目标文件：
- [apps/server/src/index.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/index.ts:98)
- [apps/server/src/lib/analysis.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/analysis.ts:124)
- [apps/server/src/lib/poster.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/poster.ts:78)

工作内容：
- 记录分析耗时、出图耗时、错误分类。
- 记录用户输入被拒的原因。
- 为后续成本评估提供基础数据。

10. 固化部署与发布流程
目标文件：
- [deploy/nginx.facemirror.conf](/Users/fuer/Documents/FaceMirror/FaceMirror/deploy/nginx.facemirror.conf)
- [deploy/ecosystem.config.cjs](/Users/fuer/Documents/FaceMirror/FaceMirror/deploy/ecosystem.config.cjs)
- [README.md](/Users/fuer/Documents/FaceMirror/FaceMirror/README.md:85)

工作内容：
- 明确生产环境变量表。
- 明确静态资源发布和 Node 服务启动顺序。
- 补最小回滚方案。

## Suggested Owner Split

- 总控 Agent：维护计划、确认阶段门禁、组织验收。
- 产品 Agent：定义失败提示、结果页表达、用户路径。
- 开发 Agent：负责后端兼容层、错误分类、数据层、部署配置。
- UI Agent：负责手机端状态反馈、结果页信息结构和分享交互。
- 测试 Agent：负责真机链路、失败样例、回归验证清单。
- 平台 Agent：在进入 P2 时接管部署、环境变量和日志观测。

## Risks And Mitigations

1. 第三方兼容模型返回格式不稳定
缓解：
- 在 [apps/server/src/lib/analysis.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/analysis.ts:84) 增加多路径解析和明确错误分类。
- 为空内容、非 JSON、schema 不合法建立单独回归样例。

2. 生图接口波动导致整条链路失败
缓解：
- 把 SVG 降级视为正式成功路径，而不是应急补丁，基于 [apps/server/src/lib/poster.ts](/Users/fuer/Documents/FaceMirror/FaceMirror/apps/server/src/lib/poster.ts:119) 扩展可观测性。

3. LLM 判定“单人脸”误杀或误放行
缓解：
- 在 P1 前不要把该判断当作强专业能力宣传。
- 收集失败样例，后续决定是否引入 CV 人脸检测作为前置。

4. 当前本地文件存储无法支撑多人联调或上线
缓解：
- P0/P1 阶段只把它用于 demo 和小范围测试。
- P2 明确切换到数据库或轻量持久化方案。

5. 需求过早扩散到推荐、社区、支付等方向
缓解：
- 当前版本只围绕“上传照片 -> 获得可信分析和结果图”闭环，不扩范围。

## Verification Steps

1. 运行 `npm run build`，确认 web、server、shared 全部通过。
2. 在桌面浏览器跑一轮：
- 上传符合要求的 JPG/PNG
- 成功拿到 `job_id`
- 成功完成 `/api/render`
- 能通过 `?result=` 回看

3. 在手机浏览器跑一轮：
- 打开局域网地址
- 上传照片
- 校验跨域、静态资源、结果图 URL 是否都可访问

4. 失败用例至少覆盖：
- 非 JPG/PNG
- 模糊或低光照片
- 多人照
- 分析上游超时
- 生图上游超时

5. 对 Kimi 分析链路做最小协议回归：
- 检查正常 JSON 返回
- 检查空 `content`
- 检查非 JSON 返回

6. 对生图链路做双路径回归：
- AI 图片生成成功
- AI 图片失败时 SVG 成功落地

## Recommended Replan Output

建议你接下来正式立项时，把本计划收敛成以下里程碑：

- Milestone 1：P0 真链路稳定版
- Milestone 2：P1 手机端产品闭环版
- Milestone 3：P2 小规模上线准备版

其中当前最值得先做的是 Milestone 1，不建议先改大 UI，也不建议先上数据库。
