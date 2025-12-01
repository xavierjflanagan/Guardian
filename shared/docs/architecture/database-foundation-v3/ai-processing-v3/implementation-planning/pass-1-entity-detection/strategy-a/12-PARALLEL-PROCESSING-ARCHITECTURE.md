# 12 - Pass 1 Parallel Processing Architecture

**Date:** 2025-12-01
**Status:** Implemented
**Commit:** `64b3f2f` (parallel encounters), `9f52fe0` (concurrency limit increase)

---

## Overview

Pass 1 entity detection now processes encounters in parallel, as originally specified in PASS1-STRATEGY-A-MASTER.md. This document explains the architecture, configuration, and performance characteristics.

---

## Two-Level Parallelism

Pass 1 uses parallelism at two levels:

```
Shell File (e.g., 20-page medical record)
│
├── Encounter 1 (pages 1-5)
│   ├── Batch A (pages 1-3) ──► Gemini API call
│   └── Batch B (pages 4-5) ──► Gemini API call
│
├── Encounter 2 (pages 6-10)    [PARALLEL with Encounter 1]
│   └── Batch A (pages 6-10) ──► Gemini API call
│
├── Encounter 3 (pages 11-15)   [PARALLEL with Encounters 1,2]
│   └── Batch A (pages 11-15) ──► Gemini API call
│
└── Encounter 4 (pages 16-20)   [PARALLEL with Encounters 1,2,3]
    └── Batch A (pages 16-20) ──► Gemini API call
```

**Level A (Multi-Encounter):** All encounters process in parallel
**Level B (Multi-Batch):** All batches within an encounter process in parallel

---

## Concurrency Architecture

### The Two Concurrency Settings

There are two separate concurrency controls that work together:

| Setting | Location | Value | Controls |
|---------|----------|-------|----------|
| `WORKER_CONCURRENCY` | Render env var | 3 | Jobs (shell files) processing at once |
| `concurrency_limit` | pass1-v2-types.ts | 30 | Gemini API calls per job |

### How They Interact

```
RENDER INSTANCE (1 instance, 2GB RAM, Standard plan)
│
└── WORKER PROCESS (Node.js)
    │
    ├── WORKER_CONCURRENCY = 3  (environment variable)
    │   "Process up to 3 JOBS from the queue simultaneously"
    │
    │   ┌─────────────────────────────────────────────────────────────┐
    │   │                                                             │
    │   │  JOB 1: Patient A's 10-page document                        │
    │   │    └── Pass1Detector                                        │
    │   │        └── encounterLimit = pLimit(30)                      │
    │   │            └── Up to 30 parallel Gemini API calls           │
    │   │                                                             │
    │   │  JOB 2: Patient B's 5-page document      [PARALLEL]         │
    │   │    └── Pass1Detector                                        │
    │   │        └── encounterLimit = pLimit(30)                      │
    │   │            └── Up to 30 parallel Gemini API calls           │
    │   │                                                             │
    │   │  JOB 3: Patient C's 8-page document      [PARALLEL]         │
    │   │    └── Pass1Detector                                        │
    │   │        └── encounterLimit = pLimit(30)                      │
    │   │            └── Up to 30 parallel Gemini API calls           │
    │   │                                                             │
    │   └─────────────────────────────────────────────────────────────┘
    │
    └── THEORETICAL MAX: 3 jobs x 30 API calls = 90 concurrent Gemini calls
```

### What Happens When 10 Users Upload Simultaneously?

1. All 10 files get queued in Supabase `job_queue` table
2. Worker picks up jobs 1, 2, 3 (limited by `WORKER_CONCURRENCY=3`)
3. Jobs 4-10 wait in queue
4. As each job completes, next job is picked up
5. Each job processes its encounters in parallel (up to 30 at once)

---

## Deadlock Prevention

### The Problem

Using the same `p-limit` instance for both encounters AND batches causes deadlock:

```
BAD: Shared limiter (DEADLOCK RISK)
────────────────────────────────────
this.limit = pLimit(5)

Encounter 1 ──► takes slot 1 ──► tries to run batches ──► needs slots ──► BLOCKED
Encounter 2 ──► takes slot 2 ──► tries to run batches ──► needs slots ──► BLOCKED
Encounter 3 ──► takes slot 3 ──► tries to run batches ──► needs slots ──► BLOCKED
Encounter 4 ──► takes slot 4 ──► tries to run batches ──► needs slots ──► BLOCKED
Encounter 5 ──► takes slot 5 ──► tries to run batches ──► needs slots ──► BLOCKED

All 5 slots held by encounters waiting for batches.
Batches waiting for slots held by encounters.
DEADLOCK - nothing can proceed.
```

### The Solution

Use SEPARATE `p-limit` instances:

```
GOOD: Separate limiters (NO DEADLOCK)
─────────────────────────────────────
encounterLimit = pLimit(30)  // For encounters (created per shell file)
this.limit = pLimit(30)      // For batches (class-level)

Encounter 1 ──► takes encounterLimit slot ──► runs batches with this.limit ──► OK
Encounter 2 ──► takes encounterLimit slot ──► runs batches with this.limit ──► OK
...

Encounters don't block each other's batch processing.
```

### Implementation

File: `apps/render-worker/src/pass1-v2/Pass1Detector.ts` (lines 164-172)

```typescript
// Process encounters in parallel
// CRITICAL: Use separate limiter for encounters to avoid deadlock with batch-level this.limit
const encounterLimit = pLimit(this.config.concurrency_limit);

const encounterPromises = encounters.map(encounter =>
  encounterLimit(() => this.processEncounter(encounter, processing_session_id))
);

const results = await Promise.all(encounterPromises);
```

---

## Rate Limits

### Gemini Flash-Lite Limits (Paid Tier 1)

| Metric | Limit |
|--------|-------|
| Requests per minute (RPM) | 300 |
| Tokens per minute (TPM) | 1,000,000 |

### Our Configuration vs Limits

| Scenario | Max Concurrent API Calls | vs 300 RPM |
|----------|--------------------------|------------|
| 1 job, 30 encounters | 30 | Safe (10%) |
| 3 jobs, 30 encounters each | 90 | Safe (30%) |
| 3 jobs, 100 encounters each | 90 | Safe (30%) |

The `concurrency_limit` caps us at 90 worst-case, well under the 300 RPM limit.

---

## Performance Results

### 5-Page Lab Results Document (8 encounters)

| Mode | Processing Time | Speedup |
|------|-----------------|---------|
| Sequential (old) | ~60 seconds | - |
| Parallel (concurrency=5) | ~16 seconds | 3.7x |
| Parallel (concurrency=30) | ~14 seconds* | 4.3x |

*Limited by slowest encounter (14s for 2-page/38-entity encounter)

### Why Not Faster?

The bottleneck is **Gemini API latency**, not our infrastructure:

| Metric | During Processing | Limit | Usage |
|--------|-------------------|-------|-------|
| Render CPU | 6.5% | 100% | Minimal |
| Render Memory | 255MB | 2GB | 12% |

The worker is mostly waiting for HTTP responses. Increasing Render instances won't help single-document speed - it would only help throughput for multiple simultaneous documents.

---

## Configuration Reference

### Pass 1 Config (pass1-v2-types.ts)

```typescript
export const DEFAULT_PASS1_CONFIG: Pass1Config = {
  max_retries: 3,
  concurrency_limit: 30,        // Gemini API calls per job
  batch_min_pages: 3,
  batch_max_pages: 10,
  batch_hard_ceiling: 50,
  include_zones_in_prompt: process.env.PASS1_DISABLE_ZONES !== 'true'
};
```

### Render Environment Variables

```bash
WORKER_CONCURRENCY=3           # Jobs processing simultaneously
WORKER_ID=render-${RENDER_SERVICE_ID}
NODE_ENV=production
```

### Changing Concurrency

**To process more documents simultaneously:**
- Increase `WORKER_CONCURRENCY` in Render dashboard
- Consider memory: each job uses ~100-150MB during processing
- With 2GB RAM, safe to run 10-15 concurrent jobs

**To process single documents faster:**
- Increase `concurrency_limit` in pass1-v2-types.ts
- Limited by Gemini rate limits (300 RPM)
- Current 30 is already near optimal for most documents

---

## Error Handling

### Behavior Change from Sequential

| Aspect | Sequential (Old) | Parallel (New) |
|--------|------------------|----------------|
| First encounter fails | Stop immediately | All encounters complete |
| Result aggregation | Partial (up to failure) | Complete (all results) |
| Shell file status | Failed | Failed (if any encounter failed) |
| Error reporting | First failure only | First failure (same interface) |

### Retry Logic

Retries happen at the **batch level**, not encounter level:

1. Batch fails with transient error (rate limit, timeout)
2. Exponential backoff delay
3. Retry up to `max_retries` (default: 3)
4. If still failing, batch marked failed
5. Encounter marked failed
6. Other encounters continue (parallel)
7. Shell file marked failed if any encounter failed

---

## Files Modified

| File | Change |
|------|--------|
| `Pass1Detector.ts` | Parallel encounter processing with separate `encounterLimit` |
| `pass1-v2-types.ts` | `concurrency_limit` increased from 5 to 30 |

---

## Future Considerations

### Scaling Options

1. **More Render instances**: Process more documents simultaneously (horizontal scaling)
2. **Higher WORKER_CONCURRENCY**: Process more jobs per instance (if memory allows)
3. **Higher concurrency_limit**: More API calls per job (if rate limits allow)

### Monitoring

Watch for:
- Gemini 429 errors (rate limit exceeded) - reduce `concurrency_limit`
- Memory pressure during processing - reduce `WORKER_CONCURRENCY`
- Long queue times - add Render instances or increase `WORKER_CONCURRENCY`

---

## Summary

Pass 1 now processes encounters in parallel using two separate `p-limit` instances to avoid deadlock. With `concurrency_limit=30` and `WORKER_CONCURRENCY=3`, we can process up to 90 concurrent Gemini API calls while staying well under the 300 RPM rate limit. Single-document processing time is now limited by the slowest Gemini API response (~14 seconds for complex encounters) rather than sequential processing overhead.
