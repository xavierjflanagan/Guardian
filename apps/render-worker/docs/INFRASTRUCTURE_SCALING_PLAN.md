# Infrastructure Scaling Plan
## Exora Health - Render Worker Architecture & Growth Strategy

**Last Updated:** November 7, 2025  
**Current Status:** Pre-launch, 0 users  
**Current Infrastructure Cost:** $25/month

---

## Table of Contents

1. [Current Infrastructure Status](#current-infrastructure-status)
2. [Architecture Overview](#architecture-overview)
3. [Growth Scenarios & Scaling Strategy](#growth-scenarios--scaling-strategy)
4. [Worker Concurrency & Job Processing](#worker-concurrency--job-processing)
5. [Cost Projections](#cost-projections)
6. [Scaling Triggers & Action Items](#scaling-triggers--action-items)
7. [Technical Recommendations](#technical-recommendations)
8. [Migration Paths (10k+ Users)](#migration-paths-10k-users)

---

## Current Infrastructure Status

### Render Services (As of Nov 7, 2025)

**Worker Service - Document Processing**
- **Instance Type:** Standard
- **CPU:** 1 vCPU (dedicated core)
- **RAM:** 2 GB
- **Cost:** $25/month
- **Status:** Active
- **Concurrency:** 1 job at a time (sequential processing)

**Recent Changes:**
- **Upgraded from:** Starter tier (0.5 vCPU, 512 MB RAM, $7/month)
- **Reason:** Out of Memory (OOM) crashes on large documents (142+ pages)
- **Result:** Stable processing, no more crashes

**API/Web Service**
- Assumed to be on Vercel or separate Render instance
- Handles file uploads from Next.js frontend
- Saves files to Supabase Storage
- Creates processing jobs in database/queue

### Current Capabilities

**Processing Capacity:**
- ~2 minutes per document (average 50-100 pages)
- ~30 documents per hour
- ~720 documents per day (theoretical maximum)
- **Realistic capacity:** 500-600 documents/day with buffer

**Document Size Limits:**
- **Tested:** Up to 142 pages (stable)
- **Theoretical maximum:** ~500 pages with 2 GB RAM
- **Recommended maximum:** 300 pages for safety margin

**User Capacity:**
- **0-100 users:** Excellent performance
- **100-500 users:** Acceptable (may see queue delays at peak)
- **500-1,000 users:** Need to scale (queue will back up)

---

## Architecture Overview

### Service Separation Philosophy

**Why API and Worker are Separate Services:**

```
┌─────────────────────────────────────────────────┐
│                  USER UPLOAD                     │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │    API/Web Service         │
        │  (Responds in seconds)     │
        │                            │
        │  • Receives file upload    │
        │  • Saves to Supabase       │
        │  • Creates job record      │
        │  • Returns immediately     │
        └────────────┬───────────────┘
                     │
                     │ Job queued
                     │
                     ▼
        ┌────────────────────────────┐
        │   Worker Service (Render)  │
        │  (Processes in minutes)    │
        │                            │
        │  • Polls for new jobs      │
        │  • Downloads file          │
        │  • Format conversion       │
        │  • OCR processing          │
        │  • Saves results           │
        └────────────────────────────┘
```

**Critical Principle:** API must remain responsive at all times. Processing happens asynchronously in the background.

### Current Worker Pipeline

**Single Worker Process (Sequential):**

```
Document Processing Job:
├─ Step 1: Download file from Supabase Storage (5-10s)
├─ Step 2: Format Conversion (PDF → JPEG)
│   ├─ Load PDF pages
│   ├─ Convert to JPEG (quality: 85)
│   ├─ Optimize images
│   └─ Time: 30-60s | RAM: 200-500 MB
├─ Step 3: OCR Processing
│   ├─ Process each page with Tesseract
│   ├─ Extract text + confidence scores
│   ├─ Aggregate results
│   └─ Time: 60-120s | RAM: 500-1000 MB
└─ Step 4: Save results to database (5-10s)

Total Processing Time: 2-3 minutes per document
Peak RAM Usage: 1-1.5 GB (within 2 GB limit)
```

**Note on Architecture Decision:**
- Format conversion and OCR currently run in the same worker
- **Reason:** Pre-launch simplicity, sequential process, cost efficiency
- **Future consideration:** Split into separate workers when scaling beyond 500 docs/day

---

## Growth Scenarios & Scaling Strategy

### Scenario 1: Pre-Launch → 100 Users

**Expected Usage:**
- 100 users total
- 10% upload documents daily = 10 uploads/day
- Average 20-50 pages per document
- Peak: 2-3 uploads per hour

**Current Setup Handles This:**
- ✅ No changes needed
- ✅ Current $25/month sufficient
- ✅ No queue delays

**Monitoring to Watch:**
- Average daily document count
- Peak hour upload patterns
- Queue depth (should stay < 5)

---

### Scenario 2: 100 → 1,000 Users

**Expected Usage:**
- 1,000 users total
- 10% daily activity = 100 uploads/day
- Peak hours (9am-5pm): ~15 uploads/hour = 1 upload every 4 minutes
- Average document size: 30 pages

**Capacity Analysis:**

```
Current Capacity: 30 docs/hour
Peak Demand: 15 docs/hour
Utilization: 50% (comfortable)
```

**Infrastructure Recommendation:**

**Option A: Single Worker with Higher Concurrency (Lower Cost)**
```
Configuration:
- 1 Standard worker ($25/month)
- Concurrency: 2-3 jobs simultaneously
- Cost: $25/month
```

**Option B: Multiple Workers (More Reliable)**
```
Configuration:
- 2-3 Standard workers ($50-75/month)
- Concurrency: 1 per worker
- Total concurrent jobs: 2-3
- Cost: $50-75/month
```

**Recommended:** Option B (multiple workers)
- More reliable (if one crashes, others continue)
- Easier to scale (just add instances)
- Better isolation

**Additional Infrastructure Needed:**
- **Redis queue:** Upstash free tier or Render Redis ($10/month)
- **Monitoring:** Sentry error tracking (free tier sufficient)
- **Queue dashboard:** Custom admin panel

**Total Cost at 1,000 Users:** $60-85/month

**User Experience:**
- Upload: Instant
- Processing: 2-3 minutes average
- Queue wait (peak): 5-10 minutes maximum

---

### Scenario 3: 1,000 → 10,000 Users

**Expected Usage:**
- 10,000 users total
- 10% daily activity = 1,000 uploads/day
- Peak hours: ~100 uploads/hour
- Some users upload multiple documents (5-10 at once)

**Capacity Analysis:**

```
Demand: 100 docs/hour (peak)
Current Capacity (3 workers): 90 docs/hour
Utilization: 110% ⚠️ (over capacity)
```

**Infrastructure Recommendation:**

**Worker Configuration:**
```
5 Standard worker instances
Concurrency: 2 per instance
Total concurrent processing: 10 jobs
Cost: 5 × $25 = $125/month
```

**Auto-scaling Strategy:**
```
Queue Depth < 10:     2 workers active
Queue Depth 10-30:    5 workers active
Queue Depth 30-50:    8 workers active
Queue Depth > 50:     10 workers active
```

**Supporting Infrastructure:**
```
- Redis/BullMQ: Upstash Pro ($20/month)
- API scaling: Pro tier ($85/month)
- Monitoring: Sentry Pro ($29/month)
- Database: Supabase Pro ($25/month)
```

**Total Cost at 10,000 Users:** $300-500/month

**Feature Additions Needed:**
- Real-time queue position updates (WebSocket)
- Email notifications on completion
- Batch upload optimization (group multiple docs from same user)
- Premium tier: "Skip the queue" for paid users

---

### Scenario 4: 10,000 → 100,000 Users

**Expected Usage:**
- 100,000 users total
- 10% daily activity = 10,000 uploads/day
- Peak hours: ~400 uploads/hour sustained
- Spike events: 1,000 uploads/hour

**Critical Decision Point:**

**Render.com becomes limiting at this scale:**
- Managing 20+ worker instances manually is inefficient
- Cost per compute hour higher than AWS/GCP
- No native auto-scaling to 50+ workers
- Single region deployment (latency issues)

**Migration Recommendation: Hybrid AWS + Render**

```
API Layer:
├─ Render or Vercel (handles uploads)
└─ Cost: $200-300/month

Processing Layer:
├─ AWS Lambda (on-demand processing)
├─ Auto-scales: 0 to 1,000 concurrent executions
├─ Only pay for actual compute time
└─ Cost: $500-1,500/month (based on usage)

Supporting Infrastructure:
├─ AWS SQS: Queue management ($50/month)
├─ AWS S3: Document storage ($200-500/month)
├─ RDS PostgreSQL: Dedicated database ($200/month)
└─ CloudFront CDN: API caching ($50/month)
```

**Total Cost at 100,000 Users:** $1,200-3,000/month

**Why Lambda at Scale:**
```
Cost Comparison (10,000 docs/day):

Render (10 workers × 24/7):
- Cost: 10 × $25 = $250/month
- Utilization: ~30% (wasting $175/month on idle time)
- Fixed capacity (can't spike higher)

AWS Lambda (on-demand):
- Cost: ~$100-150/month (only pay per execution)
- Utilization: 100% (no idle costs)
- Auto-scales to handle 10x spike
```

**Migration should happen when:**
- Monthly infrastructure cost > $500/month
- Regular queue depths > 50 jobs
- Revenue > $5,000/month (can afford migration effort)

---

## Worker Concurrency & Job Processing

### How Concurrency Works

**Default Behavior: One Job at a Time**
```javascript
// worker.js (simplified)
const worker = new Worker('document-processing', async (job) => {
  await processDocument(job.data);
}, {
  concurrency: 1, // ← One job at a time (current setting)
  connection: redisConnection
});
```

**What This Means:**
```
Queue: [Job1] [Job2] [Job3] [Job4] [Job5]
         ↓
      Worker 1 (processing Job1)
      
Job1 completes → Job2 starts → Job3 starts → etc.
```

### Increasing Concurrency

**Configuration:**
```javascript
concurrency: 3  // Process 3 jobs simultaneously
```

**Behavior:**
```
Queue: [Job1] [Job2] [Job3] [Job4] [Job5]
         ↓      ↓      ↓
      Worker 1 processes Jobs 1, 2, 3 simultaneously
      
When Job1 completes → Job4 starts
When Job2 completes → Job5 starts
```

### RAM Usage Calculation

**Critical Formula:**
```
Total RAM Needed = Concurrency × RAM per Job

Safe Configuration:
Available RAM: 2 GB = 2048 MB
Safety Buffer: 20% = 410 MB
Usable RAM: 2048 - 410 = 1638 MB

If each job needs 800 MB:
Max Concurrency = 1638 / 800 = 2 jobs safely
```

**Current Settings (Recommended):**
```javascript
// Pre-launch (0-500 users)
concurrency: 1

// Rationale:
// - Documents vary wildly (10 pages to 200 pages)
// - Cannot predict RAM usage per job
// - One large doc (200 pages) might need 1.5 GB
// - Safe approach: one at a time
```

### Multiple Worker Instances vs Higher Concurrency

**Approach A: Multiple Instances (Recommended)**
```
3 worker instances on Render
Each with concurrency: 1
Total: 3 jobs processing simultaneously

Pros:
✓ Fault isolation (one crashes, others continue)
✓ Easy to scale (add/remove instances)
✓ Predictable behavior
✓ Render handles orchestration

Cons:
✗ Higher cost ($75/month vs $25/month)
```

**Approach B: Single Instance, High Concurrency (Advanced)**
```
1 worker instance on Render
Concurrency: 3
Total: 3 jobs processing simultaneously

Pros:
✓ Lower cost ($25/month)
✓ Efficient RAM usage

Cons:
✗ All eggs in one basket (crash = all jobs stop)
✗ Complex RAM management
✗ Need smart job sizing logic
✗ Risk of OOM on unexpected workload
```

**Current Recommendation:** Approach A when scaling is needed

---

## Cost Projections

### Monthly Infrastructure Costs by User Count

| User Count | Config | Monthly Cost | Cost/User | Revenue Needed (10% paid users @ $10/mo) |
|------------|--------|--------------|-----------|-------------------------------------------|
| **0-100** | 1 worker (Standard) | $25 | N/A | 3 paying users |
| **100-1,000** | 2-3 workers + Redis | $70 | $0.07 | 7 paying users |
| **1,000-10,000** | 5-8 workers + infra | $300 | $0.03 | 30 paying users (3% of user base) |
| **10,000-50,000** | 15-20 workers + premium infra | $800 | $0.016 | 80 paying users (0.8%) |
| **50,000-100,000** | AWS Lambda migration | $2,000 | $0.02 | 200 paying users (0.4%) |

**Key Insight:** Infrastructure cost per user **decreases** as you scale.

### Break-Even Analysis

**At 1,000 users:**
- Infrastructure: $70/month
- 10% conversion = 100 paid users
- At $10/month = $1,000 revenue
- **Profit margin:** 93% (after infrastructure)

**At 10,000 users:**
- Infrastructure: $300/month
- 10% conversion = 1,000 paid users
- At $10/month = $10,000 revenue
- **Profit margin:** 97% (after infrastructure)

**Conclusion:** Infrastructure scales efficiently. Focus on user acquisition.

---

## Scaling Triggers & Action Items

### Automated Monitoring Alerts

**Set up alerts for these metrics:**

**Queue Depth Alert:**
```
IF queue_depth > 20 jobs for > 15 minutes
THEN alert: "Queue backing up - consider adding worker"
```

**Average Wait Time Alert:**
```
IF average_wait_time > 15 minutes
THEN alert: "Users experiencing delays - scale workers"
```

**Worker Memory Alert:**
```
IF worker_memory > 85% for > 5 minutes
THEN alert: "Memory pressure - risk of OOM crash"
```

**Failed Job Alert:**
```
IF job_failure_rate > 5% in past hour
THEN alert: "High failure rate - investigate immediately"
```

### Manual Scaling Decision Tree

**When Queue Depth Consistently > 10:**
```
Step 1: Analyze job composition
  ├─ Are they small docs? → Increase concurrency to 2
  └─ Are they mixed sizes? → Add 2nd worker instance

Step 2: Monitor for 24 hours
  ├─ Queue stabilized? → Done
  └─ Still backing up? → Add 3rd worker instance
```

**When Users Report Slow Processing:**
```
Step 1: Check metrics dashboard
  ├─ Queue depth normal? → Investigate processing speed optimization
  └─ Queue depth high? → Add workers

Step 2: Review recent documents
  ├─ Unusually large docs? → Add RAM (upgrade to Pro tier)
  └─ Normal docs, just volume? → Add workers
```

**When Monthly Cost > $500:**
```
Step 1: Evaluate AWS migration
  ├─ Calculate Lambda costs for current volume
  ├─ If Lambda < Render by 30%+ → Begin migration planning
  └─ If Render still cheaper → Stay on Render

Step 2: Optimize before migrating
  ├─ Review processing efficiency
  ├─ Identify bottlenecks
  └─ Implement optimizations first
```

---

## Technical Recommendations

### Pre-Launch Checklist (0-100 Users)

**Infrastructure:**
- [x] Upgrade worker to Standard tier (2 GB RAM)
- [ ] Implement job queue (Redis + BullMQ)
- [ ] Set concurrency to 1 (conservative)
- [ ] Deploy basic monitoring (Sentry)

**Code:**
- [ ] Fix parallel processing bug (batch pages, don't load all at once)
- [ ] Add graceful error handling
- [ ] Implement job retry logic (max 3 attempts)
- [ ] Add timeout protection (max 10 minutes per job)

**User Experience:**
- [ ] Show "Processing..." status to user
- [ ] Add estimated completion time
- [ ] Email notification on completion
- [ ] Clear error messages on failure

**Testing:**
- [ ] Test with 5 simultaneous uploads
- [ ] Test with 200-page document
- [ ] Test with corrupted PDF
- [ ] Verify no OOM crashes

### Phase 2: First 100 Users

**Add:**
- Queue position visibility: "Your document is #3 in queue"
- Admin dashboard: Monitor queue, worker health, job status
- Metrics tracking: Document sizes, processing times, failure rates
- Automated alerts: Queue backup, worker crashes, high failure rate

**Monitor:**
- Daily document volume
- Peak hour patterns
- Average processing time
- User complaints about speed

**Scale when:**
- Queue regularly > 10 jobs
- Average wait time > 10 minutes
- Users complaining about delays

### Phase 3: 1,000+ Users

**Architecture Changes:**
- Multiple worker instances (2-3 minimum)
- Redis queue (migrate from Postgres polling if needed)
- Auto-scaling rules (if Render supports, or manual triggers)
- Batch job optimization (detect multiple uploads from same user)

**User Features:**
- Real-time progress updates (WebSocket)
- Premium tier: Skip queue ($5-10/month)
- Bulk upload discounts
- Priority processing for paid users

**Operational:**
- On-call rotation (if solo, at least monitoring alerts)
- Runbook for common issues
- Backup worker capacity for events/spikes

### Phase 4: 10,000+ Users

**Migration Planning:**
- Evaluate AWS Lambda vs Render costs
- Plan phased migration (keep Render for API, migrate workers to Lambda)
- Load testing at scale
- Multi-region deployment consideration

**Advanced Features:**
- Intelligent job routing (small docs → fast workers, large docs → dedicated workers)
- GPU workers for future ML models
- CDN for processed document results
- Archive older documents to cold storage (S3 Glacier)

---

## Migration Paths (10k+ Users)

### When to Migrate from Render

**Stay on Render if:**
- Monthly cost < $500
- Worker count < 15 instances
- Queue management is simple
- You're solo/small team (simplicity matters)

**Migrate to AWS if:**
- Monthly cost > $500 consistently
- Need to scale beyond 20 workers
- Need multi-region deployment
- Variable workload (spiky traffic)
- Have engineering resources for migration

### Phased AWS Migration Strategy

**Phase 1: Hybrid (Keep Render API)**
```
Render:
├─ API/Web service (handles uploads)
└─ Cost: $25-50/month

AWS:
├─ Lambda functions (document processing)
├─ SQS queue
├─ S3 storage
└─ Cost: $200-500/month

Total: $225-550/month
```

**Phase 2: Full AWS (Large Scale)**
```
AWS:
├─ ECS/Fargate: API service
├─ Lambda: Document processing
├─ RDS: Database
├─ S3: Storage
├─ SQS: Queue
├─ CloudFront: CDN
└─ Cost: $800-2,000/month

Render:
└─ Staging/preview environments only
```

### AWS Lambda Architecture (Future Reference)

**Processing Flow:**
```
User uploads file →
API creates job in SQS queue →
Lambda triggered automatically →
Lambda processes document →
Lambda saves results to RDS →
Lambda sends completion notification →
Lambda terminates (no idle costs)
```

**Cost Model:**
```
Per Document Processing:
- Lambda execution: 3 minutes
- Memory: 2 GB
- Cost per execution: ~$0.01

10,000 documents/day:
- Daily: 10,000 × $0.01 = $100
- Monthly: $100 × 30 = $3,000

But with optimization:
- Smaller docs (< 20 pages): 1 GB, 1 minute = $0.003/doc
- Average cost: ~$0.005/doc
- Monthly (10k/day): ~$1,500
```

**Why Lambda Wins at Scale:**
- No idle costs (Render charges 24/7)
- Auto-scales to 1,000 concurrent executions
- Pay per 100ms of execution time
- Built-in retry and error handling
- CloudWatch monitoring included

---

## Appendix: Current Worker Code Review Checklist

**Before scaling, verify these settings:**

### 1. Queue Configuration
```javascript
// Check: What's your concurrency setting?
const worker = new Worker('queue-name', processJob, {
  concurrency: 1, // Should be 1 for now
});
```

### 2. Memory Management
```javascript
// Check: Are you processing pages in batches?
// BAD:
const allPages = await Promise.all(pages.map(processPage));

// GOOD:
for (let i = 0; i < pages.length; i += 10) {
  const batch = pages.slice(i, i + 10);
  await Promise.all(batch.map(processPage));
}
```

### 3. Error Handling
```javascript
// Check: Do you have retry logic?
const worker = new Worker('queue-name', processJob, {
  attempts: 3, // Retry up to 3 times
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s delays
  },
});
```

### 4. Timeout Protection
```javascript
// Check: Is there a maximum job time?
const worker = new Worker('queue-name', processJob, {
  lockDuration: 600000, // 10 minutes max per job
});
```

---

## Document History

**November 7, 2025:**
- Initial document creation
- Upgraded worker from Starter to Standard tier (512 MB → 2 GB RAM)
- Resolved OOM crashes on large documents
- Current status: Pre-launch, 0 users, $25/month infrastructure cost

---

## Quick Reference: Scaling Cheat Sheet

| User Count | Workers | Cost/Month | Action Needed |
|------------|---------|------------|---------------|
| 0-100 | 1 Standard | $25 | ✓ Current setup (stable) |
| 100-500 | 1-2 Standard | $25-50 | Monitor queue depth |
| 500-1,000 | 2-3 Standard | $50-75 | Add 2nd worker when queue > 10 |
| 1,000-5,000 | 3-5 Standard | $75-125 | Add Redis, auto-scaling |
| 5,000-10,000 | 5-10 Standard | $125-250 | Consider Lambda migration |
| 10,000+ | AWS Lambda | $500-2,000 | Migrate to AWS |

**Rule of Thumb:** Add 1 worker for every 500 daily documents.

---

**Questions or Updates?**
Document owner: Xavier Flanagan  
Last technical review: November 7, 2025  
Next review scheduled: When reaching 100 active users

