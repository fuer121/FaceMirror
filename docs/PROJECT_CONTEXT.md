# FaceMirror Project Context

Last updated: 2026-05-05

This document is the canonical source of truth for current project state, runtime decisions, integration details, and next-step planning. Do not rely on chat history as the source of truth. When project-critical facts change, update this file in the same change set.

## Current Objective

FaceMirror is a mobile-first H5 app for generating shareable personal aesthetic analysis reports from one uploaded portrait photo.

The current product path is intentionally narrow:

1. User uploads one JPG/PNG portrait.
2. Server creates a short-lived job and stores the original upload.
3. User must have device-bound generation credits from a redeemed code.
4. Server deducts 1 credit when starting a new render.
5. Server calls `gpt-image-2` image-to-image generation with the uploaded photo as the only image input and the selected feature prompt.
6. App shows the generated analysis report image.
7. Result link remains available for about 24 hours.

Current supported feature modules:

- `color` / 色彩分析
- `hair` / 发型分析
- `style` / 穿搭分析
- `makeup` / 妆容分析

## Current Git State

- Remote repository: `git@github.com:fuer121/FaceMirror.git`
- Main branch: `main`
- Last pushed main baseline: `4a81a43 feat: refine beauty report flow and UI`
- Current feature branch: `codex/redemption-code-system`
- Current feature work: Aliyun ECS minimal single-server deployment with local file persistence and H5 local user state.
- Before any new feature work, check `git status -sb` and preserve unrelated user changes.

## Architecture

```text
apps/
  web/       React + Vite H5 frontend
  server/    Express API server
packages/
  shared/    Shared TypeScript API types
docs/
  PROJECT_CONTEXT.md  Canonical project state and runbook
```

Key files:

- Frontend main app: `apps/web/src/App.tsx`
- Frontend styles: `apps/web/src/styles.css`
- Frontend API client: `apps/web/src/api.ts`
- Server routes: `apps/server/src/index.ts`
- Image generation: `apps/server/src/lib/poster.ts`
- Prompt configuration store: `apps/server/src/lib/prompt-store.ts`
- Redemption code store: `apps/server/src/lib/redeem-store.ts`
- Analytics SQLite store: `apps/server/src/lib/analytics-store.ts`
- Postgres schema/bootstrap: `apps/server/src/lib/db.ts`
- Media storage adapter: `apps/server/src/lib/media-storage.ts`
- Legacy text analysis parser/fallback: `apps/server/src/lib/analysis.ts`
- Shared API types: `packages/shared/src/index.ts`
- LAN IP sync script: `scripts/sync-local-ip.mjs`

## Current Runtime Flow

### `POST /api/analyze`

Current intended behavior:

- Accepts one uploaded file in form field `photo`.
- Accepts `feature` in form data: `color`, `hair`, `style`, or `makeup`; defaults to `color`.
- Validates the file exists and MIME type is `image/jpeg` or `image/png`.
- Does not call Kimi 2.5 or any text analysis model.
- Creates a job using `fallbackAnalysis()` as a neutral compatibility payload.
- Stores the original uploaded file reference in the job record for image-to-image rendering.
- Stores the selected `feature` on the job.
- Records `job_created` into the analytics SQLite database.
- Returns `job_id`, `feature`, `analysis_status=completed`, preview URL, and expiry time.

Reason for this design:

- The product expectation is image-to-image report generation from the user photo plus a preset prompt.
- Kimi/OpenAI text analysis before rendering caused avoidable `分析失败` errors.
- The generated report itself should be produced by `gpt-image-2`, not by a separate textual analysis card.

### `POST /api/render`

Current intended behavior:

- Accepts `job_id` and `usage_token`.
- Reads the original upload path from the stored job.
- Reads the stored `feature` and loads the matching prompt config from `${DATA_DIR}/prompts.json`.
- If the job already has a `poster_url`, returns the existing result without deducting credits.
- If the job does not have a result yet, validates the usage token and deducts 1 generation credit before rendering.
- Records `render_started` after credit deduction succeeds.
- Calls APIMart-compatible `gpt-image-2` through `POST /v1/images/generations`.
- Sends the uploaded image as a base64 data URI through `image_urls`.
- Polls `GET /v1/tasks/{task_id}` until completion or timeout.
- Downloads the generated image and stores it under `${DATA_DIR}/renders`.
- Returns a public `poster_url`.
- Records `render_completed` after successful image generation and stores duration.
- If rendering fails after a credit is deducted, the server refunds that credit, records `render_failed`, and records `credit_refunded`.
- Repeated render requests for a job that already has `poster_url` do not deduct credits and do not create new analytics events.

## Feature Prompt Configuration

Prompt configuration is managed from the redemption admin backend. This is the canonical place to edit generation prompts for all modules.

Prompt storage:

- File: `${DATA_DIR}/prompts.json`; local development defaults to `apps/server-data/prompts.json`.
- Plain prompt text is stored locally; it is product configuration, not a secret.
- Missing prompt config falls back to server defaults for each feature.
- Changes apply to the next render request.

Prompt admin APIs:

- `GET /api/redeem/admin/prompts`
  - Requires `Authorization: Bearer <admin_token>`.
  - Returns all prompt configs.
- `PUT /api/redeem/admin/prompts/:feature`
  - Requires admin token.
  - `feature` must be `color`, `hair`, `style`, or `makeup`.
  - Body: `{ "prompt": "<prompt text>" }`.
  - Prompt length must be 20 to 4000 characters.

Prompt rendering rule:

- The configured feature prompt is combined with a server-side invariant prompt that requires preserving the uploaded person's real facial features and using the uploaded image as the only subject.
- Do not put secrets, API keys, or provider-specific credentials into prompt text.
- Current default prompt direction is "professional social-share card": professional analysis dimensions, short labels, strong visual comparison, and no long explanatory paragraphs.
- Default professional dimensions:
  - Color: undertone / value / chroma / contrast, recommended colors, avoided colors, daily color usage.
  - Hair: face contour, forehead ratio, cheekbone and jawline presence, feature scale, hair volume/texture, length/layers/bangs/curl/color.
  - Style: personal vibe, facial lines, undertone, visual weight, proportion, clothing line, color, texture, scene fit.
  - Makeup: undertone, skin value, feature scale, eye shape, brow-eye distance, facial negative space, blush/contour/lip color coordination.

## Redemption Code System

The redemption system gates all image generation credits. Current v1 decisions:

- No user account system.
- Credits bind to the current browser/device through a `usage_token` stored by the frontend in `localStorage`.
- A redemption code can be redeemed only once.
- Default credits per code: `3`.
- Redemption and management data are stored in `${DATA_DIR}/redeem-codes.json`; local development defaults to `apps/server-data/redeem-codes.json`.
- Redemption codes and usage tokens are stored as hashes only; plaintext codes are returned only at generation time.
- New redemption codes also store an encrypted display copy so the admin list can show and copy full codes. Existing historical codes without encrypted display data can only show their preview and cannot be recovered to full plaintext.
- `/api/render` is the trusted enforcement point. Frontend credit display is only informational.

### Redemption APIs

- `POST /api/redeem/entry`
  - Body: `{ "input": "<admin key or redemption code>" }`
  - If `input` matches `REDEEM_ADMIN_KEY`, returns `{ mode: "admin", admin_token, expires_at }`.
  - Otherwise attempts to redeem `input` as a redemption code and returns `{ mode: "redeemed", usage_token, remaining_credits, total_credits }`.
- `GET /api/credits`
  - Requires `Authorization: Bearer <usage_token>`.
  - Returns current remaining and total credits for the current device token.
- `GET /api/redeem/admin/codes`
  - Requires `Authorization: Bearer <admin_token>`.
  - Lists code status, credit counts, and `created_at`.
  - Returns full `code` only for codes generated after encrypted display storage was introduced; otherwise `code` is `null`.
  - Current admin UI supports searching by code preview/ID and filtering by `未使用` / `已使用` / `已禁用`.
  - Current admin UI defaults to code management, supports switching to prompt management, and supports one-click copy for codes with full plaintext available.
  - Current admin UI displays code generation time to minute precision.
- `POST /api/redeem/admin/codes`
  - Requires admin token.
  - Body: `{ "count": 1, "credits": 3 }`.
  - Supports single and batch generation.
- `POST /api/redeem/admin/codes/:id/disable`
  - Requires admin token.
  - Disables a code.
- `GET /api/redeem/admin/prompts`
  - Requires admin token.
  - Lists prompt configuration for 色彩分析 / 发型分析 / 穿搭分析 / 妆容分析.
- `PUT /api/redeem/admin/prompts/:feature`
  - Requires admin token.
  - Updates the selected feature's image-to-image generation prompt.

Security notes:

- `REDEEM_ADMIN_KEY` must be configured through environment variables only.
- Admin sessions are short-lived in-memory bearer tokens.
- Admin key comparison uses constant-time hash comparison.
- Redemption/admin endpoints have stricter rate limiting than the global API limiter.
- Do not log plaintext admin keys, redemption codes, or usage tokens.

## Analytics And Reporting

The analytics system is the durable operational data source for feature usage. It is separate from `results.json`, which remains a short-lived job/result store and can be cleaned after about 24 hours.

Storage:

- ECS v1 production and local development default: SQLite file `${DATA_DIR}/analytics.sqlite`.
- Future optional upgrade: Postgres table `analytics_events` when `DATABASE_URL` is configured.
- Runtime: Node 24 built-in `node:sqlite` for current ECS/local mode; `pg` only for the optional future Postgres mode.
- Table: `analytics_events`

Recorded event types:

- `job_created`: `/api/analyze` accepted a valid upload and created a job.
- `render_started`: `/api/render` deducted 1 credit and started image generation.
- `render_completed`: image generation completed successfully; includes `duration_ms`.
- `render_failed`: image generation failed; includes a sanitized `error_code`.
- `credit_refunded`: a previously deducted credit was refunded after render failure.

Recorded fields:

- `id`
- `job_id`
- `feature`
- `event_type`
- `status`
- `code_id`
- `duration_ms`
- `error_code`
- `created_at`

Privacy and safety constraints:

- Do not store original photo paths, generated image URLs, usage tokens, redemption code plaintext, admin keys, or prompt full text in SQLite.
- Analytics is server-recorded only; frontend display is not a trusted data source.
- Historical records that existed only in `results.json` cannot be reliably backfilled after TTL cleanup. Treat analytics as complete only from the point this SQLite logging is enabled.

Analytics admin APIs:

- `GET /api/redeem/admin/analytics/overview?from=&to=`
  - Requires `Authorization: Bearer <admin_token>`.
  - Returns total created jobs, render starts, successes, failures, success rate, feature distribution, daily trend, average duration by feature, and redemption credit totals.
- `GET /api/redeem/admin/analytics/events?from=&to=&feature=&status=&limit=`
  - Requires admin token.
  - Returns recent analytics events for operational debugging.

Admin frontend:

- `/redeem` admin backend has three separate views:
  - `兑换码管理`
  - `Prompt 管理`
  - `数据报表`
- `数据报表` defaults to recent 7 days and supports switching to recent 30 days.
- First version is read-only and focuses on operations overview: total generation, success rate, failures, consumed credits, feature distribution, daily trend, and recent events.

### `GET /api/result/:id`

Current intended behavior:

- Returns the stored job record.
- Used by `?result=<job_id>` result-page recovery.

## Model And Provider Decisions

### Image generation provider

Current active image provider:

- Base URL: `https://api.apimart.ai/v1`
- Model: `gpt-image-2`
- Mode: async task API
- Input mode: image-to-image via `image_urls`
- Output ratio: `9:16`
- Resolution: defaults to `1k` unless overridden by `IMAGE_RESOLUTION`

Required env vars:

```text
OPENAI_IMAGE_BASE_URL=https://api.apimart.ai/v1
IMAGE_MODEL=gpt-image-2
IMAGE_RESOLUTION=1k
OPENAI_IMAGE_API_KEY=<set locally, never commit>
```

## Production Deployment

Canonical deployment runbook: `docs/DEPLOYMENT.md`.

Current production target:

- Aliyun ECS single server, Ubuntu 22.04.
- Nginx serves `apps/web/dist`.
- PM2 runs `apps/server/dist/index.js` on `127.0.0.1:8787`.
- Production data is stored on the ECS disk under `DATA_DIR=/srv/facemirror/shared/server-data`.
- No RDS/Postgres/OSS/CDN/SLB is required for the current v1 deployment.
- User-side state remains in H5 `localStorage`; no user registration or login is planned for v1.
- First production launch starts from an empty `server-data` directory; local development data is not migrated.

Production storage switches:

- `DATA_DIR` controls all local persistent files: `results.json`, `redeem-codes.json`, `prompts.json`, `analytics.sqlite`, `uploads/`, and `renders/`.
- If `DATA_DIR` is missing, local development defaults to `apps/server-data`.
- If `DATABASE_URL` is set in a future upgrade, server repositories can use Postgres.
- If `STORAGE_DRIVER=oss` is set in a future upgrade, uploads and renders can be written to Aliyun OSS.

Production deployment files:

- `deploy/ecosystem.config.cjs`: PM2 process template.
- `deploy/nginx.facemirror.conf`: Nginx HTTPS/static/API reverse proxy template.

Additional production env vars:

```text
NODE_ENV=production
PORT=8787
DATA_DIR=/srv/facemirror/shared/server-data
CORS_ORIGIN=https://<domain>
PUBLIC_BASE_URL=https://<domain>
OPENAI_IMAGE_BASE_URL=https://api.apimart.ai/v1
OPENAI_IMAGE_API_KEY=<secret>
IMAGE_MODEL=gpt-image-2
IMAGE_RESOLUTION=1k
REDEEM_ADMIN_KEY=<secret>
RESULT_TTL_HOURS=24
```

Deployment constraints:

- Do not deploy this app to pure serverless without redesigning storage and long-running image task polling.
- Do not commit production `.env` files or credentials.
- Replace `<domain>` placeholders before enabling Nginx HTTPS.
- Keep `/srv/facemirror/shared/server-data` unchanged during deploy and rollback.
- ECS security group should only expose `22`, `80`, and `443`; port `8787` should be accessed through Nginx.

### Text analysis provider

Current product flow does not require a text analysis model before rendering.

The code still contains legacy analysis support in `apps/server/src/lib/analysis.ts` for compatibility and possible future use, but `/api/analyze` should not call `analyzePhoto()` in the current flow.

If future work reintroduces text analysis, it must be documented here first, including:

- exact purpose,
- failure handling,
- whether it blocks image generation,
- user-visible output,
- provider/model/base URL.

## Environment Variables

Secrets must never be committed. Use `apps/server/.env` locally and deployment environment variables in production.

Important server vars:

```text
PORT=8787
CORS_ORIGIN=http://<LAN_IP>:5173
PUBLIC_BASE_URL=http://<LAN_IP>:8787
OPENAI_IMAGE_BASE_URL=https://api.apimart.ai/v1
OPENAI_IMAGE_API_KEY=<secret>
IMAGE_MODEL=gpt-image-2
IMAGE_RESOLUTION=1k
IMAGE_TASK_POLL_INTERVAL_MS=5000
IMAGE_TASK_TIMEOUT_MS=120000
REDEEM_ADMIN_KEY=<secret>
REDEEM_DEFAULT_CREDITS=3
REDEEM_ADMIN_SESSION_TTL_MS=1800000
RESULT_TTL_HOURS=24
MAX_FILE_SIZE_MB=10
```

Legacy or optional vars:

```text
OPENAI_BASE_URL=
OPENAI_API_KEY=
ANALYSIS_MODEL=
OPENAI_AUTH_TOKEN=
CODEX_OPENAI_API_KEY=
```

The current image-generation path uses `OPENAI_IMAGE_API_KEY` first, then falls back to the generic OpenAI key only if image key is missing.

## Local Development Runbook

Install dependencies:

```bash
npm install
```

Start server:

```bash
npm run dev:server
```

Start web:

```bash
npm run dev:web
```

Both dev commands run `scripts/sync-local-ip.mjs`, which updates:

- `apps/web/.env` -> `VITE_API_BASE_URL=http://<LAN_IP>:8787`
- `apps/server/.env` -> `CORS_ORIGIN=http://<LAN_IP>:5173`
- `apps/server/.env` -> `PUBLIC_BASE_URL=http://<LAN_IP>:8787`

Current observed LAN IP on 2026-05-04 was `172.22.15.128`. Earlier LAN IPs such as `172.16.76.67` and `192.168.1.152` were from previous networks and should not be assumed.

Check current LAN IP:

```bash
node - <<'NODE'
const os = require('os');
for (const [name, values] of Object.entries(os.networkInterfaces())) {
  for (const entry of values || []) {
    if (entry.family === 'IPv4' && !entry.internal) console.log(`${name} ${entry.address}`);
  }
}
NODE
```

Expected dev URLs after sync:

```text
Web:    http://<LAN_IP>:5173/
Server: http://<LAN_IP>:8787/
Health: http://127.0.0.1:8787/api/health
```

## Verification Commands

Full build/type check:

```bash
npm run check
```

Health check:

```bash
curl -sS http://127.0.0.1:8787/api/health
```

Analyze smoke test with a generated tiny PNG:

```bash
node - <<'NODE'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');
const form = new FormData();
form.append('feature', 'color');
form.append('photo', new Blob([png], { type: 'image/png' }), 'smoke.png');
fetch('http://127.0.0.1:8787/api/analyze', { method: 'POST', body: form })
  .then((response) => response.json().then((body) => console.log(response.status, body)));
NODE
```

Render smoke test:

```bash
curl -sS -H 'Content-Type: application/json' \
  -d '{"job_id":"<JOB_ID>"}' \
  http://127.0.0.1:8787/api/render
```

Result smoke test:

```bash
curl -sS http://127.0.0.1:8787/api/result/<JOB_ID>
```

## Last Known Self-Test

Date: 2026-05-04

Environment:

- Server: `http://172.22.15.128:8787`
- Web: `http://172.22.15.128:5173`
- Credential source: env
- Image model: `gpt-image-2`

Test result:

- `npm run check` passed.
- `git diff --check` passed.
- `DATA_DIR` production-build smoke test returned `200 job_created`.
- The smoke upload wrote `results.json`, `analytics.sqlite`, and `uploads/` under the temporary `DATA_DIR`.

This self-test did not call the paid image-generation endpoint.

## Current UI Direction

Current accepted UI reference: `/Users/fuer/.codex/generated_images/019dc1e9-051a-7470-8ec3-a3f436058a19/ig_0365980f35f8165b0169ef8f0ead3c8191a9f45345e424f40d.png`.

Implementation target:

- Overall surface: clean white mobile shell with soft cream/blue cosmetic illustration atmosphere.
- Header: centered Chinese serif title `你的个人美学分析` and subtitle `AI 智能分析，发现更美的你`; no visible FaceMirror eyebrow in the first viewport.
- Mode cards: compact horizontal cards with line-art icon and title in a left-right structure. Selected card is wider, blue-tinted, and shadowed.
- Result canvas: large rounded illustration panel with pastel color waves and face-contour atmosphere. Empty color-analysis state should use simple small text `生成结果 / AI 分析将显示在这里` directly on the canvas, without an inner card or extra plus/sparkle mark, plus subtle mystery/anticipation motion.
- Unavailable feature canvas: keep the canvas visually clean and show only `敬请期待`; do not add an inner card or long explanatory copy inside the canvas.
- Result image interaction: do not show separate `查看结果图`, `复制链接`, or `约 N 小时内可回看` controls below the report. The report image itself is the large-image entry; users can open/save from the image.
- Upload state: use a native-client-like horizontal glass card, not a web-form-looking upload control. Avoid SVG component icons in the upload card. Before upload, show a soft photo slot, `上传照片`, constraints, and a compact `选择照片` action. After upload, show thumbnail, title `已上传照片`, constraints, and a compact native-feeling re-upload action; do not show the local file name.
- Primary CTA: large blue pill button with white serif text and sparkle icon.
- Privacy text: bottom compact line `你的照片仅用于分析，24 小时后自动删除`.

UI changes should preserve the current workflow and only alter the visual/interaction layer unless this document is updated first.

## Known Issues And Constraints

1. `/api/analyze` currently only validates MIME type, not whether the photo is actually a single clear face.
2. The generated report quality depends heavily on `gpt-image-2` prompt adherence.
3. Production v1 uses single-server file/JSON/SQLite storage under `DATA_DIR`; this is acceptable for early single-instance deployment, not multi-instance scale.
4. Result URLs are based on `PUBLIC_BASE_URL`; if LAN IP changes, previously created local URLs can stop opening from phone.
5. The current APIMart task polling can take around 30-120 seconds depending on upstream state.
6. If `OPENAI_IMAGE_API_KEY` is invalid or provider balance is insufficient, render will fail.

## Next Work Recommendation

For UI optimization, continue in the current controller thread unless work becomes parallel across multiple surfaces.

Recommended UI next step:

1. Define UI acceptance criteria in this document before editing.
2. Optimize one surface at a time:
   - home/upload console,
   - generating states,
   - result/revisit state.
3. Run `npm run check` after each implementation pass.
4. Manually verify on phone using the current LAN URL.

## Documentation Policy

- This file is the first document to read before planning or coding.
- README should stay concise and link here instead of duplicating volatile state.
- `.omx/plans/*` are historical planning artifacts, not the current source of truth unless explicitly referenced from this file.
- Any change to model provider, API flow, environment variables, accepted UX behavior, or verification result must update this file.
