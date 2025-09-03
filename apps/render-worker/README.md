# Render Worker Deployment Artifacts

**⚠️ IMPORTANT: This folder contains DEPLOYED ARTIFACTS, not source code!**

## Source of Truth Location

**Worker Source Code:** `shared/docs/architecture/database-foundation-v3/current_workers/exora-v3-worker/`

## Deployment Process

### Worker Deployment to Render.com
```bash
# Copy from source to deployment location
cp -r shared/docs/architecture/database-foundation-v3/current_workers/exora-v3-worker/* apps/render-worker/

# Deploy to Render.com (auto-deploy on git push to staging/main branch)
git add apps/render-worker/
git commit -m "Update worker deployment artifacts"
git push origin staging  # or main for production
```

## Current Deployment Status

- **V3 Worker Code:** ⏳ Pending (Phase 4 - Worker Implementation)
- **Render.com Service:** ⏳ Pending setup
- **Environment:** Staging → `staging` branch | Production → `main` branch

## Service Configuration

- **Service Name:** `exora-v3-worker`
- **Build Command:** `pnpm install --frozen-lockfile; pnpm run build`
- **Start Command:** `pnpm run start`
- **Root Directory:** `apps/render-worker`
- **Health Check:** `https://exora-health.onrender.com/health`

## Environment Variables (Render.com)
```bash
# Core Infrastructure
SUPABASE_URL=<project_url>
SUPABASE_SERVICE_ROLE_KEY=<service_key>
OPENAI_API_KEY=<openai_key>
GOOGLE_CLOUD_API_KEY=<google_key>

# Worker Configuration
NODE_ENV=production
APP_ENV=staging  # or production
WORKER_CONCURRENCY=50
WORKER_ID=render-${RENDER_SERVICE_ID}
```

---

**Always modify source files in `current_workers/` first, then copy to this deployment location!**