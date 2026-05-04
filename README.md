# FaceMirror

FaceMirror 是一个移动端优先的 H5 个人色彩分析项目。用户上传一张人像照片后，系统基于上传原图和预设 prompt 调用 `gpt-image-2` 图生图，生成可分享的个人色彩分析报告图。

## 当前项目唯一信息源

当前项目状态、真实 API 链路、模型接入、环境变量、本地运行方式和验收记录以 [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) 为准。

聊天上下文、历史计划文档和临时测试结论不能作为唯一依据；如果重要事实发生变化，必须同步更新 [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)。

## 项目结构

```text
apps/
  server/   Node.js API，负责上传、分析、出图、临时存储
  web/      React H5 前端
packages/
  shared/   前后端共享类型
deploy/
  nginx.facemirror.conf  Nginx 反向代理示例
  ecosystem.config.cjs   PM2 启动配置示例
```

## 核心特性

- 单人照片上传、压缩、预览
- 基于上传原图生成个人色彩分析报告图
- `gpt-image-2` 图生图出图链路
- 24 小时结果留存与回看
- 基础限流、MIME 校验、文件大小限制
- 支持开发期通过本地环境变量接入 APIMart/OpenAI 兼容图片服务

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 复制环境变量

```bash
已有默认 `.env` 文件，可直接编辑；如需重置，也可从 `.env.example` 覆盖。
```

3. 启动后端

```bash
npm run dev:server
```

4. 启动前端

```bash
npm run dev:web
```

默认访问：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`

## 模型接入说明

- 前端不直接访问模型服务。
- 后端通过环境变量读取服务端凭证。
- 当前主链路不依赖 Kimi/OpenAI 文本分析模型。
- `/api/analyze` 只负责上传校验和建单。
- `/api/render` 使用上传原图调用 `gpt-image-2` 图生图。
- 正式部署必须在服务器环境变量中显式配置密钥。

海报生图支持单独凭证：

- `OPENAI_IMAGE_BASE_URL`：当前使用 `https://api.apimart.ai/v1`
- `OPENAI_IMAGE_API_KEY`：图片服务 API key
- `IMAGE_MODEL`：当前使用 `gpt-image-2`
- `IMAGE_RESOLUTION`：当前建议 `1k`
- 不要把真实密钥提交到仓库；本地开发请写入 `apps/server/.env`，正式部署请配置到服务器环境变量

完整环境变量和当前供应商决策见 [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)。

### 本地登录态诊断

运行下面命令可检查当前是否读到了本机 Codex 登录态，以及它是否真的具备 API 权限：

```bash
npm --workspace @facemirror/server run auth:check
```

已知限制：

- 读到 `~/.codex/auth.json` 不代表一定能直接调用 OpenAI API。
- 如果返回缺少 `api.responses.write` 等 scope，说明当前 ChatGPT 登录态不能直接作为正式 API 凭证使用。
- 这种情况下请在 `apps/server/.env` 中显式配置 `OPENAI_API_KEY`。

## 部署

- 生产部署以 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 为准。
- 当前生产目标是阿里云 ECS 单机 + Nginx + PM2，使用 ECS 本机磁盘目录保存业务数据和图片。
- Postgres / OSS 是后续扩展能力，不是当前最小部署必需项。
- 使用 `deploy/nginx.facemirror.conf` 和 `deploy/ecosystem.config.cjs` 作为部署配置模板。

## 注意事项

- 当前只做文件类型和大小校验，不做 CV 单人脸检测。
- 分析结果仅用于美妆与色彩建议，不构成医疗或专业美容诊断。
- 图片与结果默认保留 24 小时，超时后会被自动清理。
