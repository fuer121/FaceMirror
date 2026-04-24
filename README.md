# FaceMirror

FaceMirror 是一个移动端优先的 H5 美妆分析项目。用户上传单人照片后，后端会进行结构化色彩与妆容分析，并进一步生成一张可分享的“分析海报”。

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
- 结构化色彩与妆容分析
- 基于分析结果生成海报图
- 24 小时结果留存与回看
- 基础限流、MIME 校验、文件大小限制
- 支持开发期通过本地环境变量接入 OpenAI

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

## OpenAI 接入说明

- 前端不直接访问 OpenAI。
- 后端通过环境变量读取服务端凭证。
- 开发阶段可以尝试复用你当前本机环境中已经存在的 OpenAI/Codex 认证变量。
- 正式部署必须在服务器环境变量中显式配置密钥，不能依赖开发机登录态。

后端支持的环境变量优先级：

1. `OPENAI_API_KEY`
2. `OPENAI_AUTH_TOKEN`
3. `CODEX_OPENAI_API_KEY`
4. `~/.codex/auth.json` 中的本地登录态 access token

如果没有配置可用凭证，后端仍可运行，但分析和海报生成会退化到演示模式。

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

- 使用 `npm run build` 构建
- 将 `apps/web/dist` 作为静态资源目录
- 将 `apps/server/dist` 部署为 Node 服务
- 使用 `deploy/nginx.facemirror.conf` 作为反向代理参考
- 使用 `deploy/ecosystem.config.cjs` 可直接通过 PM2 托管后端

## 注意事项

- 当前“单人脸”校验依赖 LLM 对照片内容进行结构化判断，不是传统 CV 人脸检测模型。
- 分析结果仅用于美妆与色彩建议，不构成医疗或专业美容诊断。
- 图片与结果默认保留 24 小时，超时后会被自动清理。
