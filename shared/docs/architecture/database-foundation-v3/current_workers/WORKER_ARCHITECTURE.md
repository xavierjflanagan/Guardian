# V3 Worker Architecture Documentation

## Critical Fixes Applied (2025-09-03)

### Database Function Alignment

#### ❌ INCORRECT Assumptions Fixed:
1. **Function Name**: `claim_next_job` → `claim_next_job_v3`
2. **Parameter Names**: No `p_` prefix for RPC calls (just `worker_id` not `p_worker_id`)
3. **Missing Function**: `fail_job` doesn't exist - must update job_queue directly
4. **Return Types**: `claim_next_job_v3` returns different columns than assumed

#### ✅ CORRECT Functions Used:
- `claim_next_job_v3(worker_id, job_types, job_lanes)` - Returns job_id, job_type, job_payload, retry_count
- `complete_job(p_job_id, p_worker_id, p_job_result)` - Marks job complete
- `update_job_heartbeat(p_job_id, p_worker_id)` - Updates heartbeat
- Direct UPDATE on job_queue for failures (no fail_job RPC)

### Configuration Alignment

From `render-com-deployment-guide.md`:
- **Concurrency**: 50 jobs (not 3)
- **Worker ID**: `render-${RENDER_SERVICE_ID}` format
- **Environment**: Always `NODE_ENV=production`, use `APP_ENV` for staging/prod
- **Port**: `HEALTH_CHECK_PORT=10000`

## Architecture Decisions

### 1. Two-Step Job Claiming
Since `claim_next_job_v3` only returns partial job data, we:
1. Claim the job (get job_id)
2. Fetch full job details from job_queue

This ensures atomicity while getting all needed fields.

### 2. Error Handling Without fail_job
Since there's no `fail_job` RPC, we:
- Update job_queue directly with status='failed'
- Include error_details JSONB with structured error info
- Ensure we only update jobs we own (worker_id match)

### 3. Polling vs Push
Using polling architecture because:
- Simple and reliable
- No websocket complexity
- Works well with Render.com's architecture
- Easy to scale horizontally

## File Organization

```
current_workers/
├── exora-v3-worker/              # Source of truth
│   ├── src/
│   │   └── worker.ts            # Main worker implementation
│   ├── package.json             # Dependencies and scripts
│   ├── tsconfig.json            # TypeScript configuration
│   └── .env.example             # Environment template
└── render-com-deployment-guide.md  # Deployment instructions
```

## Deployment Flow

1. **Development**: Edit files in `current_workers/exora-v3-worker/`
2. **Testing**: Run locally with `pnpm run dev`
3. **Deployment**: Copy to `apps/render-worker/` and push to git
4. **Render.com**: Auto-deploys from staging/main branches

## Remaining TODO

### High Priority
- [ ] Add actual OpenAI integration for document analysis
- [ ] Add Google Cloud Vision for OCR
- [ ] Implement file download from Supabase Storage

### Medium Priority
- [ ] Add retry logic with exponential backoff
- [ ] Implement dead letter queue handling
- [ ] Add structured logging with correlation IDs

### Low Priority
- [ ] Split into modular processors (api-clients/, job-processors/)
- [ ] Add unit tests
- [ ] Add performance metrics

## Lessons Learned

1. **NEVER ASSUME**: Always check actual database schema
2. **Function names matter**: V3 suffix indicates version
3. **Parameter names matter**: RPC doesn't use p_ prefix
4. **Missing functions**: Not all operations have RPC wrappers
5. **Configuration matters**: Use deployment guide values

## Testing the Worker

### Local Testing
```bash
cd shared/docs/architecture/database-foundation-v3/current_workers/exora-v3-worker
pnpm install
cp .env.example .env
# Edit .env with your credentials
pnpm run dev
```

### Verify It Works
1. Check health endpoint: `curl http://localhost:10000/health`
2. Watch logs for job claiming
3. Check database for status updates

### Deploy to Render
```bash
# Copy to deployment location
cp -r * ../../../../../../../apps/render-worker/

# Push to git (auto-deploys)
git add apps/render-worker
git commit -m "Deploy V3 worker"
git push origin staging  # or main for production
```