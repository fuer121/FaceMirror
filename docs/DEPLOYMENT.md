# FaceMirror ECS Minimal Deployment Runbook

This runbook targets the current v1 production plan: one Aliyun ECS server, Nginx, PM2, and local persistent files under `/srv/facemirror/shared/server-data`.

The current deployment does not require RDS, OSS, CDN, SLB, or a user account system.

## 1. Server Prerequisites

- Aliyun ECS, Ubuntu 22.04 LTS, 2 vCPU / 4 GB RAM or higher.
- System disk: 40 GB or higher.
- Public bandwidth: 3 Mbps or higher for early usage.
- Security group opens only: `22`, `80`, `443`.
- Domain name is recommended for HTTPS. If no domain is ready, test with HTTP and the ECS public IP first.

Install runtime packages:

```bash
sudo apt update
sudo apt install -y git nginx curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v
npm -v
pm2 -v
```

## 2. Directory Layout

```text
/srv/facemirror/current              # current checked-out repo
/srv/facemirror/shared/.env          # production env, never commit
/srv/facemirror/shared/server-data   # persistent app data and images
```

Create directories:

```bash
sudo mkdir -p /srv/facemirror/current /srv/facemirror/shared/server-data
sudo chown -R $USER:$USER /srv/facemirror
```

## 3. Production Environment

Create `/srv/facemirror/shared/.env`.

Required values:

```bash
NODE_ENV=production
PORT=8787
DATA_DIR=/srv/facemirror/shared/server-data
CORS_ORIGIN=https://<domain>
PUBLIC_BASE_URL=https://<domain>

OPENAI_IMAGE_BASE_URL=https://api.apimart.ai/v1
OPENAI_IMAGE_API_KEY=<image-api-key>
IMAGE_MODEL=gpt-image-2
IMAGE_RESOLUTION=1k
IMAGE_TASK_POLL_INTERVAL_MS=5000
IMAGE_TASK_TIMEOUT_MS=120000

REDEEM_ADMIN_KEY=<strong-admin-key>
REDEEM_DEFAULT_CREDITS=3
REDEEM_ADMIN_SESSION_TTL_MS=1800000
RESULT_TTL_HOURS=24
MAX_FILE_SIZE_MB=10
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=20
```

Do not set these for the current minimal deployment:

```bash
DATABASE_URL=
STORAGE_DRIVER=local
ALIYUN_OSS_REGION=
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
ALIYUN_OSS_PUBLIC_BASE_URL=
```

If testing by ECS public IP before domain setup, temporarily use:

```bash
CORS_ORIGIN=http://<ecs-public-ip>
PUBLIC_BASE_URL=http://<ecs-public-ip>
```

## 4. Build

```bash
cd /srv/facemirror/current
npm ci
npm run check
```

## 5. Start Server With PM2

Load env and start:

```bash
cd /srv/facemirror/current
set -a
. /srv/facemirror/shared/.env
set +a
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 status
```

Health check:

```bash
curl -sS http://127.0.0.1:8787/api/health
```

Logs:

```bash
pm2 logs facemirror-server
```

Restart after code/env changes:

```bash
set -a
. /srv/facemirror/shared/.env
set +a
pm2 restart facemirror-server --update-env
```

## 6. Configure Nginx

Replace `<domain>` in `deploy/nginx.facemirror.conf`. If no HTTPS certificate is ready, use only the HTTP server block for first IP testing.

Install config:

```bash
sudo cp deploy/nginx.facemirror.conf /etc/nginx/sites-available/facemirror.conf
sudo ln -sf /etc/nginx/sites-available/facemirror.conf /etc/nginx/sites-enabled/facemirror.conf
sudo nginx -t
sudo systemctl reload nginx
```

For Let's Encrypt HTTPS after DNS is ready:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <domain>
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Persistent Data

All production data lives under `DATA_DIR=/srv/facemirror/shared/server-data`:

```text
results.json
redeem-codes.json
prompts.json
analytics.sqlite
uploads/
renders/
```

Do not delete this directory during deploy or rollback.

Manual backup example:

```bash
tar -czf /srv/facemirror/shared/server-data-$(date +%Y%m%d%H%M).tgz -C /srv/facemirror/shared server-data
```

## 8. Verification

Local server checks:

```bash
curl -sS http://127.0.0.1:8787/api/health
ls -la /srv/facemirror/shared/server-data
```

Browser checks:

- Open `https://<domain>/` or `http://<ecs-public-ip>/`.
- Open `/redeem`, log in with `REDEEM_ADMIN_KEY`.
- Generate one test redemption code.
- Redeem the code from the H5 app.
- Upload one portrait and generate one report.
- Confirm `/srv/facemirror/shared/server-data/uploads` and `renders` contain files.
- Restart PM2 and confirm redemption codes, prompt configs, analytics, and unexpired result links still work.

## 9. Rollback

- Keep `/srv/facemirror/shared/server-data` unchanged.
- Revert code to the previous commit or previous release directory.
- Rebuild if needed: `npm ci && npm run check`.
- Restart: `pm2 restart facemirror-server --update-env`.
- Reload Nginx only if config changed: `sudo nginx -t && sudo systemctl reload nginx`.

## 10. Future Upgrade Path

When single-server files are no longer enough:

- Set `DATABASE_URL` to enable Postgres repositories.
- Set `STORAGE_DRIVER=oss` and `ALIYUN_OSS_*` to move uploads/renders to OSS.
- Keep this ECS minimal plan as the v1 baseline until the need for multi-instance scaling is real.
