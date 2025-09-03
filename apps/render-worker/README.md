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

- **V3 Worker Code:** ✅ Deployed and running
- **Render.com Service:** ✅ Successfully deployed
- **Environment:** Staging → `staging` branch | Production → `main` branch

## Deployment Troubleshooting History

### Known Issues and Solutions (September 2025)

**Issue 1: TypeScript compilation failures with TS5057 error**
- **Problem:** `Cannot find a tsconfig.json file at the specified directory`
- **Root Cause:** Render.com build environment couldn't locate tsconfig.json
- **Solution:** Added explicit path in build script: `tsc --project ./tsconfig.json`

**Issue 2: Google Cloud Vision package build failures**
- **Problem:** `@google-cloud/vision@4.3.3` failing during npm install with its own TypeScript errors
- **Root Cause:** Package's internal tsconfig.json issues in monorepo environment
- **Solution:** Removed `@google-cloud/vision` dependency from package.json (can re-add when needed)

**Issue 3: Restrictive TypeScript type configuration**
- **Problem:** `"types": ["node"]` in tsconfig.json was too restrictive
- **Root Cause:** This setting excludes all other type definitions, breaking compilation
- **Solution:** Removed the `"types"` array to allow access to all necessary type definitions

### Final Working Configuration

**Build Script:** `npm install --include=dev && tsc --project ./tsconfig.json`
**Package Manager:** npm (changed from pnpm due to monorepo conflicts)
**Dependencies:** Core packages only (Supabase, Express, OpenAI, dotenv)

### Debugging Tips for Future Issues

1. Check build logs for actual TypeScript errors (often buried in verbose output)
2. Test builds locally with exact same commands as Render.com uses
3. Verify tsconfig.json paths are explicit, not relative
4. Remove problematic dependencies temporarily to isolate issues

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