# FaceMirror Project Context

Last updated: 2026-04-29

This document is the canonical source of truth for current project state, runtime decisions, integration details, and next-step planning. Do not rely on chat history as the source of truth. When project-critical facts change, update this file in the same change set.

## Current Objective

FaceMirror is a mobile-first H5 app for generating a shareable personal color analysis report from one uploaded portrait photo.

The current product path is intentionally narrow:

1. User uploads one JPG/PNG portrait.
2. Server creates a short-lived job and stores the original upload.
3. Server calls `gpt-image-2` image-to-image generation with the uploaded photo as the only image input.
4. App shows the generated color analysis report image.
5. Result link remains available for about 24 hours.

## Current Git State

- Remote repository: `git@github.com:fuer121/FaceMirror.git`
- Main branch: `main`
- Last pushed baseline: `c706243 feat: update image generation flow and beauty UI`
- Current local uncommitted fix: `/api/analyze` no longer calls the Kimi/OpenAI text analysis model before rendering.
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
- Legacy text analysis parser/fallback: `apps/server/src/lib/analysis.ts`
- Shared API types: `packages/shared/src/index.ts`
- LAN IP sync script: `scripts/sync-local-ip.mjs`

## Current Runtime Flow

### `POST /api/analyze`

Current intended behavior:

- Accepts one uploaded file in form field `photo`.
- Validates the file exists and MIME type is `image/jpeg` or `image/png`.
- Does not call Kimi 2.5 or any text analysis model.
- Creates a job using `fallbackAnalysis()` as a neutral compatibility payload.
- Stores the original uploaded file path in the job record for image-to-image rendering.
- Returns `job_id`, `analysis_status=completed`, preview URL, and expiry time.

Reason for this design:

- The product expectation is image-to-image report generation from the user photo plus a preset prompt.
- Kimi/OpenAI text analysis before rendering caused avoidable `分析失败` errors.
- The generated report itself should be produced by `gpt-image-2`, not by a separate textual analysis card.

### `POST /api/render`

Current intended behavior:

- Accepts `job_id`.
- Reads the original upload path from the stored job.
- Calls APIMart-compatible `gpt-image-2` through `POST /v1/images/generations`.
- Sends the uploaded image as a base64 data URI through `image_urls`.
- Polls `GET /v1/tasks/{task_id}` until completion or timeout.
- Downloads the generated image and stores it under `apps/server-data/renders`.
- Returns a public `poster_url`.

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
- Output ratio: `1:1`
- Resolution: defaults to `1k` unless overridden by `IMAGE_RESOLUTION`

Required env vars:

```text
OPENAI_IMAGE_BASE_URL=https://api.apimart.ai/v1
IMAGE_MODEL=gpt-image-2
IMAGE_RESOLUTION=1k
OPENAI_IMAGE_API_KEY=<set locally, never commit>
```

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

Current observed LAN IP on 2026-04-29 was `172.16.76.67`. Earlier `192.168.1.152` was from a previous network and should not be assumed.

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

Analyze smoke test with an existing local image:

```bash
curl -sS -F 'photo=@apps/server-data/uploads/1777165918736-A6YR-YHN.jpg;type=image/jpeg' \
  http://127.0.0.1:8787/api/analyze
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

Date: 2026-04-29

Environment:

- Server: `http://172.16.76.67:8787`
- Web: `http://172.16.76.67:5173`
- Credential source: env
- Image model: `gpt-image-2`

Test result:

- `/api/analyze` returned `200` for local sample upload.
- `/api/render` returned `render_status=completed`.
- Generated PNG was accessible through `/media/renders/dVhVnVHlg4Sa.png`.
- Visual inspection confirmed a complete personal color analysis report image.

The generated job id was `dVhVnVHlg4Sa`; this is only a local smoke-test artifact and should not be treated as permanent product data.

## Current UI Direction

Current accepted UI reference: `/Users/fuer/.codex/generated_images/019dc1e9-051a-7470-8ec3-a3f436058a19/ig_0365980f35f8165b0169ef8f0ead3c8191a9f45345e424f40d.png`.

Implementation target:

- Overall surface: clean white mobile shell with soft cream/blue cosmetic illustration atmosphere.
- Header: centered Chinese serif title `你的个人美学分析` and subtitle `AI 智能分析，发现更美的你`; no visible FaceMirror eyebrow in the first viewport.
- Mode cards: four rounded square cards with line-art icons. Selected card is wider, blue-tinted, and shadowed.
- Result canvas: large rounded illustration panel with pastel color waves and face-contour atmosphere; empty color-analysis state copy is `生成结果 / AI 分析将显示在这里`.
- Unavailable feature canvas: keep the canvas visually clean and show only `敬请期待`; do not add an inner card or long explanatory copy inside the canvas.
- Result image interaction: do not show separate `查看结果图`, `复制链接`, or `约 N 小时内可回看` controls below the report. The report image itself is the large-image entry; users can open/save from the image.
- Upload state: use a native-client-like horizontal glass card, not a web-form-looking upload control. Avoid SVG component icons in the upload card. Before upload, show a soft photo slot, `上传照片`, constraints, and a compact `选择照片` action. After upload, show thumbnail, title `已上传照片`, constraints, file name, and a compact native-feeling re-upload action.
- Primary CTA: large blue pill button with white serif text and sparkle icon.
- Privacy text: bottom compact line `你的照片仅用于分析，24 小时后自动删除`.

UI changes should preserve the current workflow and only alter the visual/interaction layer unless this document is updated first.

## Known Issues And Constraints

1. `/api/analyze` currently only validates MIME type, not whether the photo is actually a single clear face.
2. The generated report quality depends heavily on `gpt-image-2` prompt adherence.
3. Local storage is file/JSON based under `apps/server-data`; this is acceptable for local P0 testing, not production scale.
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
