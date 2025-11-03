# Pass 0.25: Future Scaling Options

**Created:** November 2, 2025
**Purpose:** Architecture evolution playbook for when scale demands it
**Current State:** Single worker with batched parallel OCR (sufficient for pre-launch)

---

## When To Scale

### Trigger Points (Monitor These Metrics)

**Don't scale until you hit these thresholds:**

| Metric | Current | Scale Trigger | Action |
|--------|---------|---------------|--------|
| Concurrent uploads | <5/hour | >20/hour sustained | Add worker instances |
| Average queue wait | <10 sec | >60 sec | Add worker instances |
| OCR processing time | <60 sec | >120 sec | Optimize or separate OCR |
| Worker memory usage | <100 MB | >300 MB | Reduce batch size or add memory |
| Daily upload volume | <50 files | >500 files | Consider dedicated OCR service |
| Error rate | <1% | >5% | Investigate bottlenecks |

**Golden rule:** Don't optimize for problems you don't have yet. Scale when pain is real, not theoretical.

---

## Scaling Path Overview

```
Current State (Pre-Launch):
└─ Single worker, batched OCR, $7/month
   ↓
   ↓ When: >20 concurrent users
   ↓
Option A: Multi-Instance Scaling ($21-35/month)
└─ 3-5 worker instances, all identical
   ↓
   ↓ When: >100 concurrent users OR OCR still bottleneck
   ↓
Option B: Separate OCR Service ($56-105/month)
└─ Dedicated OCR workers + Main workers
   ↓
   ↓ When: >1000 concurrent users OR need pass-specific scaling
   ↓
Option C: Full Microservices ($140+/month)
└─ Separate services for OCR, Pass 0.5, Pass 1, Pass 2
```

---

## Option A: Multi-Instance Single Worker

### Architecture

**Same code, multiple instances:**
```
Render Dashboard:
└─ Exora Health (Web Service)
   ├─ Instances: 5 (scale up from 1)
   ├─ Cost: $7/month × 5 = $35/month
   ├─ Each instance: Identical code, batched OCR
   └─ Job distribution: Automatic via claim_next_job_v3()

Job Queue (Supabase):
├─ Job 1 → Claimed by Instance 1
├─ Job 2 → Claimed by Instance 2
├─ Job 3 → Claimed by Instance 3
├─ Job 4 → Claimed by Instance 4
├─ Job 5 → Claimed by Instance 5
└─ Job 6 → Waits for next available instance
```

### How It Works

**Each instance polls the same queue:**
```typescript
// All 5 instances run this same code:
while (true) {
  const job = await supabase.rpc('claim_next_job_v3');

  if (job) {
    await processJob(job); // Full pipeline: OCR + Pass 0.5 + Pass 1 + Pass 2
  }

  await sleep(5000); // Poll every 5 seconds
}
```

**Automatic load balancing:**
- Instance 1 busy with 142-page file (2 min processing)
- Instance 2 grabs next job immediately
- Instance 3 grabs next job immediately
- Etc.

**Concurrency:** 5 patients processed simultaneously

### When To Use

**Good fit if:**
- 20-100 concurrent users
- Upload patterns: Moderate bursts (5-10 simultaneous)
- All passes have similar processing times
- Want simplicity (one codebase)
- Budget: <$50/month

**Not ideal if:**
- OCR still a bottleneck after batched parallel
- Need to scale passes independently
- Very high concurrency (>100 users)

### Implementation

**How to scale from 1 to 5 instances:**

1. **Render Dashboard:**
   ```
   Services → Exora Health → Settings → Scaling
   → Change "Instances" from 1 to 5
   → Save
   ```

2. **Cost change:**
   ```
   Before: 1 instance × $7 = $7/month
   After:  5 instances × $7 = $35/month
   Increase: $28/month
   ```

3. **Code changes:**
   ```
   NONE! Same code runs on all instances.
   ```

4. **Database changes:**
   ```
   NONE! Job queue already handles multiple workers.
   ```

**Total time to scale:** 5 minutes (just a settings change)

### Scaling Guide

| Users | Instances | Cost/Month | Concurrent Jobs | Wait Time |
|-------|-----------|------------|-----------------|-----------|
| 1-10 | 1 | $7 | 1 | <30 sec |
| 10-50 | 3 | $21 | 3 | <10 sec |
| 50-100 | 5 | $35 | 5 | <5 sec |
| 100-200 | 10 | $70 | 10 | <2 sec |

### Pros & Cons

**Pros:**
- ✅ Simplest possible scaling (just add instances)
- ✅ No code changes required
- ✅ No architecture changes
- ✅ Linear scaling (2x instances = 2x capacity)
- ✅ Each instance independent (one fails, others continue)
- ✅ Easy to understand and debug

**Cons:**
- ❌ All instances same size (can't optimize per component)
- ❌ Can't scale OCR separately from passes
- ❌ Wastes resources if one pass is bottleneck
- ❌ Cost grows linearly (10 instances = $70/month)

---

## Option B: Separate OCR Service

### Architecture

**Two specialized services:**
```
┌─────────────────────────────────────────────────────────┐
│ Render: OCR Service (Background Worker)                │
│ ├─ Instances: 5-10 (scales independently)              │
│ ├─ Cost: $7 × 10 = $70/month                           │
│ └─ Purpose: Process individual pages in parallel       │
│                                                         │
│ Claims from: ocr_processing_queue table                │
│ Processes: Single pages (142 jobs for 142-page PDF)    │
│ Writes to: Database (OCR results table)                │
└─────────────────────────────────────────────────────────┘
                         ↓
                Triggers Pass 0.5 job when complete
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Render: Main Worker (Web Service)                      │
│ ├─ Instances: 3-5                                      │
│ ├─ Cost: $7 × 5 = $35/month                            │
│ └─ Purpose: PDF extraction, Pass 0.5, Pass 1, Pass 2   │
│                                                         │
│ Claims from: job_queue table                           │
│ Processes: Full pipeline (minus OCR)                   │
└─────────────────────────────────────────────────────────┘

Total: 15 instances, $105/month
```

### Processing Flow

**Upload 142-page PDF:**
```
1. Main Worker (Instance 1):
   - Download PDF (1 sec)
   - Extract 142 pages (6 sec)
   - Create 142 OCR jobs in ocr_processing_queue
   - Return success to user ✅
   - Instance 1 now free for next upload!

2. OCR Service (10 instances working in parallel):
   Instance 1: Claim page 1 → OCR → Save to DB (3 sec)
   Instance 2: Claim page 2 → OCR → Save to DB (3 sec)
   Instance 3: Claim page 3 → OCR → Save to DB (3 sec)
   ...
   Instance 10: Claim page 10 → OCR → Save to DB (3 sec)

   Round 2:
   Instance 1: Claim page 11 → OCR → Save to DB (3 sec)
   ...

   Total: 15 rounds × 3 sec = 45 seconds
   All 142 pages complete ✅

3. OCR Service (last page complete):
   - Detect all pages done for shell_file_id
   - Enqueue Pass 0.5 job in job_queue

4. Main Worker (Instance 2 - could be different instance):
   - Claim Pass 0.5 job
   - Load OCR results from database
   - Run Pass 0.5 (60 sec)
   - Run Pass 1 (120 sec)
   - Run Pass 2 (60 sec)
   - Complete ✅

Total time: ~5 minutes (vs 7+ minutes before)
```

### Database Schema Changes

**New table: `ocr_processing_queue`**
```sql
CREATE TABLE ocr_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_file_id UUID REFERENCES shell_files(id),
  page_number INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  ocr_result JSONB,
  confidence FLOAT,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shell_file_id, page_number)
);

CREATE INDEX idx_ocr_queue_status ON ocr_processing_queue(status, created_at);
CREATE INDEX idx_ocr_queue_shell_file ON ocr_processing_queue(shell_file_id);
```

**New RPC: `claim_next_ocr_page()`**
```sql
CREATE OR REPLACE FUNCTION claim_next_ocr_page(worker_id TEXT)
RETURNS TABLE (
  id UUID,
  shell_file_id UUID,
  page_number INTEGER,
  storage_path TEXT
) AS $$
DECLARE
  claimed_page RECORD;
BEGIN
  -- Find oldest pending page
  SELECT * INTO claimed_page
  FROM ocr_processing_queue
  WHERE status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed_page IS NULL THEN
    RETURN;
  END IF;

  -- Claim it
  UPDATE ocr_processing_queue
  SET status = 'processing',
      claimed_at = NOW()
  WHERE id = claimed_page.id;

  RETURN QUERY SELECT
    claimed_page.id,
    claimed_page.shell_file_id,
    claimed_page.page_number,
    claimed_page.storage_path;
END;
$$ LANGUAGE plpgsql;
```

### Implementation Steps

**1. Create OCR Service (New Render Service):**

```typescript
// apps/ocr-worker/src/index.ts (NEW)
import { createClient } from '@supabase/supabase-js';
import { callGoogleVisionOCR } from './utils/googleVision';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function processOCRQueue() {
  while (true) {
    // Claim next page
    const { data: page } = await supabase.rpc('claim_next_ocr_page', {
      worker_id: process.env.RENDER_INSTANCE_ID
    });

    if (page) {
      try {
        // Download image from storage
        const imageBuffer = await downloadFromStorage(page.storage_path);

        // Process OCR
        const ocrResult = await callGoogleVisionOCR(imageBuffer);

        // Save result
        await supabase
          .from('ocr_processing_queue')
          .update({
            status: 'completed',
            ocr_result: ocrResult,
            confidence: ocrResult.confidence,
            completed_at: new Date().toISOString()
          })
          .eq('id', page.id);

        // Check if all pages complete
        await checkAndTriggerPass05(page.shell_file_id);

      } catch (error) {
        // Mark failed
        await supabase
          .from('ocr_processing_queue')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', page.id);
      }
    }

    await sleep(1000); // Poll every second
  }
}

processOCRQueue();
```

**2. Update Main Worker:**

```typescript
// apps/render-worker/src/worker.ts (MODIFIED)
// Remove OCR processing, just enqueue jobs

async function processAIJob(job) {
  // 1. Download PDF
  const pdfBuffer = await downloadFromStorage(job.storage_path);

  // 2. Extract pages
  const pages = await extractPDFPages(pdfBuffer);

  // 3. Enqueue OCR jobs (instead of processing)
  const ocrJobs = pages.map((page, i) => ({
    shell_file_id: job.shell_file_id,
    page_number: i + 1,
    storage_path: page.storage_path,
    status: 'pending'
  }));

  await supabase.from('ocr_processing_queue').insert(ocrJobs);

  // 4. Return immediately - OCR service will handle rest
  return { success: true, pages_enqueued: pages.length };
}
```

**3. Deployment:**
```
Render Dashboard:
1. Create new service: "OCR Worker"
   - Type: Background Worker
   - Repo: Same GitHub repo
   - Build command: cd apps/ocr-worker && pnpm install && pnpm build
   - Start command: pnpm start
   - Instances: 10
   - Cost: $70/month

2. Existing service: "Exora Health"
   - Keep as is
   - Deploy updated code (removes OCR processing)
   - Instances: 5
   - Cost: $35/month
```

### When To Use

**Good fit if:**
- >100 concurrent users
- OCR still bottleneck after batched parallel
- Want maximum parallelization
- Budget: $50-100/month acceptable
- Need to optimize OCR independently

**Not ideal if:**
- <50 concurrent users (overengineering)
- Happy with multi-instance Option A
- Want to minimize complexity

### Pros & Cons

**Pros:**
- ✅ Maximum OCR parallelization (142 pages in 45 sec)
- ✅ Main worker never blocked by OCR
- ✅ Can scale OCR and main workers independently
- ✅ Database-backed (no memory issues)
- ✅ Resume capability built-in
- ✅ Handles files of ANY size

**Cons:**
- ❌ More complex (2 services to manage)
- ❌ Database writes on every page (potential bottleneck)
- ❌ Inter-service coordination needed
- ❌ Harder to debug (distributed system)
- ❌ Higher cost ($105/month vs $35/month)

---

## Option C: Full Microservices

### Architecture

**Separate service per pass:**
```
1. PDF Extractor Service (2 instances, $14/month)
   └─ Extract pages, enqueue OCR jobs

2. OCR Service (10 instances, $70/month)
   └─ Process individual pages

3. Pass 0.5 Service (3 instances, $21/month)
   └─ Encounter discovery

4. Pass 1 Service (5 instances, $35/month)
   └─ Entity detection (most intensive)

5. Pass 2 Service (2 instances, $14/month)
   └─ Clinical extraction

Total: 22 instances, $154/month
```

### When To Use

**Only if:**
- >1000 concurrent users
- Enterprise scale requirements
- Need pass-specific optimization
- Each pass has very different resource needs
- Dedicated DevOps team

**This is overkill for pre-launch!**

### Pros & Cons

**Pros:**
- ✅ Maximum scalability
- ✅ Optimize each component independently
- ✅ Fault isolation (one service fails, others continue)
- ✅ Can use different instance types per service

**Cons:**
- ❌ Significant complexity
- ❌ High cost ($150+/month)
- ❌ Requires distributed tracing
- ❌ More potential failure points
- ❌ Team overhead to maintain

---

## Decision Framework

### Flowchart: Which Option To Choose?

```
Start: Review current metrics
  ↓
Are you experiencing performance issues?
  ├─ NO → Stay with current setup (batched OCR, 1 instance)
  └─ YES
      ↓
Is queue wait time >60 seconds?
  ├─ YES → Add more instances (Option A)
  │        Start with 3, monitor, scale to 5 if needed
  │        Cost: $21-35/month
  └─ NO
      ↓
Is OCR processing time >2 minutes for large files?
  ├─ YES → Consider separate OCR service (Option B)
  │        Only if Option A didn't solve it
  │        Cost: $105/month
  └─ NO
      ↓
Do you have >1000 concurrent users?
  ├─ YES → Full microservices (Option C)
  │        Cost: $150+/month
  └─ NO → You don't have a scaling problem yet!
```

### Cost vs Performance Comparison

| Option | Instances | Cost/Month | Concurrent Users | 142-Page OCR Time | Complexity |
|--------|-----------|------------|------------------|-------------------|------------|
| Current | 1 | $7 | 1-10 | 45 sec | Low |
| **Option A** | 3 | $21 | 10-50 | 45 sec | Low |
| **Option A** | 5 | $35 | 50-100 | 45 sec | Low |
| **Option B** | 15 | $105 | 100-500 | 45 sec (parallel) | Medium |
| **Option C** | 22+ | $154+ | 1000+ | 30 sec (optimized) | High |

**Recommendation for pre-launch:** Stay at 1 instance ($7/month) until you hit 20+ concurrent users.

---

## Migration Paths

### From Current → Option A (Trivial)

**Steps:**
1. Render Dashboard → Scaling → Increase instances
2. Monitor performance
3. Done!

**Time:** 5 minutes
**Risk:** None (reversible instantly)

### From Option A → Option B (Moderate)

**Steps:**
1. Create OCR service codebase
2. Create database tables/functions
3. Deploy OCR service
4. Update main worker to enqueue OCR jobs
5. Test both services working together
6. Migrate traffic

**Time:** 2-3 weeks
**Risk:** Medium (distributed system complexity)

### From Option B → Option C (Complex)

**Steps:**
1. Split each pass into separate service
2. Create job orchestration system
3. Deploy all services
4. Comprehensive testing
5. Gradual migration

**Time:** 1-2 months
**Risk:** High (full rewrite)

---

## Monitoring & Alerts

### Metrics To Track

**When to scale (alert thresholds):**
```
Average queue wait time:
  Warning: >30 seconds
  Critical: >60 seconds
  Action: Add instances (Option A)

OCR processing time (per page):
  Warning: >5 seconds
  Critical: >10 seconds
  Action: Investigate API issues or separate OCR (Option B)

Worker memory usage:
  Warning: >300 MB
  Critical: >400 MB
  Action: Reduce batch size or add memory

Error rate:
  Warning: >2%
  Critical: >5%
  Action: Investigate failures

Daily upload volume:
  Milestone: 500 files/day → Consider Option B
  Milestone: 5000 files/day → Consider Option C
```

---

## Cost Optimization Tips

### 1. Right-Size Instances

**Don't over-provision!**
- Start with 1 instance
- Add instances only when queue waits >60 sec
- Remove instances during low-traffic periods

### 2. Use Render's Auto-Scaling (Future)

**When available:**
- Scale up during peak hours (9 AM - 5 PM)
- Scale down at night (1-5 instances → 1 instance)
- Save ~50% on costs

### 3. Optimize Batch Size

**Tune for your workload:**
- Small files dominant? Increase batch size (20 pages)
- Large files dominant? Keep batch size moderate (10 pages)
- Monitor memory usage, adjust accordingly

---

## Timeline for Scaling Decisions

**Pre-Launch (Now - Month 1):**
- Single instance, batched OCR
- Cost: $7/month
- Target: <10 users

**Early Launch (Month 1-3):**
- Monitor usage patterns
- Add instances if needed (Option A)
- Cost: $7-35/month
- Target: 10-50 users

**Growth Phase (Month 3-6):**
- If OCR still bottleneck, implement Option B
- Cost: $35-105/month
- Target: 50-200 users

**Scale Phase (Month 6+):**
- Only if needed, consider Option C
- Cost: $105-200/month
- Target: 200+ users

**Don't prematurely optimize!** Build for today, plan for tomorrow.

---

**Related Documentation:**
- `ARCHITECTURE_CURRENT_STATE.md` - How OCR works now
- `IMPLEMENTATION_PLAN.md` - Batched parallel OCR implementation
- `testing/TEST_PLAN.md` - Performance testing
