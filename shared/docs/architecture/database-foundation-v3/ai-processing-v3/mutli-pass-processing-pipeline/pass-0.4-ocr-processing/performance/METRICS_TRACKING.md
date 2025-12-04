# Pass 0.25: Performance Metrics Tracking

**Created:** November 2, 2025
**Purpose:** Define what we measure and why for OCR performance monitoring

---

## Overview

This document defines the key performance indicators (KPIs) for Pass 0.25 OCR processing. These metrics help us:
- Monitor system health
- Identify bottlenecks
- Validate optimizations
- Trigger scaling decisions
- Debug performance issues

---

## Core Metrics

### 1. Processing Time Metrics

#### Time Per Page
**What:** Average time to OCR a single page
**Why:** Core performance indicator
**Target:** <3 seconds per page
**Alert Thresholds:**
- Warning: >5 seconds (investigate API latency)
- Critical: >10 seconds (API issue or system degradation)

**How to measure:**
```typescript
const startTime = Date.now();
const ocrResult = await callGoogleVisionOCR(page);
const duration = Date.now() - startTime;

await logMetric('ocr_time_per_page', duration, {
  page_number: pageNum,
  file_size_kb: imageSizeKB
});
```

#### Batch Processing Time
**What:** Time to process one batch of 10 pages
**Why:** Validates parallel processing efficiency
**Target:** <5 seconds per 10-page batch
**Alert Thresholds:**
- Warning: >7 seconds
- Critical: >10 seconds

**Calculation:**
```
Ideal: 10 pages in parallel = ~3 seconds
Actual: Measure time from batch start to batch complete
```

#### Total OCR Time
**What:** End-to-end time for all OCR processing
**Why:** User-facing performance metric
**Target:** <60 seconds for 142-page file
**Alert Thresholds:**
- Warning: >90 seconds
- Critical: >120 seconds

**How to measure:**
```sql
SELECT
  shell_file_id,
  ocr_processing_time_ms,
  total_pages,
  (ocr_processing_time_ms::float / total_pages) as ms_per_page
FROM pass025_ocr_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY total_pages DESC;
```

---

### 2. Memory Usage Metrics

#### Peak Memory
**What:** Maximum memory used during OCR processing
**Why:** Prevent crashes, identify leaks
**Target:** <100 MB peak
**Alert Thresholds:**
- Warning: >300 MB (approaching 512 MB limit)
- Critical: >400 MB (imminent crash risk)

**How to measure:**
```typescript
let peakMemory = 0;

function trackMemory() {
  const current = process.memoryUsage().heapUsed / 1024 / 1024;
  if (current > peakMemory) peakMemory = current;
}

// Call before each batch
trackMemory();

// Log at end
await logMetric('ocr_peak_memory_mb', peakMemory);
```

#### Memory Per Batch
**What:** Memory increase during batch processing
**Why:** Detect memory leaks or accumulation
**Target:** <20 MB increase per batch
**Alert Thresholds:**
- Warning: >30 MB per batch
- Critical: >50 MB per batch

**How to measure:**
```typescript
const memBefore = process.memoryUsage().heapUsed;
await processBatch();
const memAfter = process.memoryUsage().heapUsed;
const delta = (memAfter - memBefore) / 1024 / 1024;

await logMetric('ocr_batch_memory_delta_mb', delta);
```

#### Memory After GC
**What:** Memory retained after garbage collection
**Why:** Validate GC effectiveness
**Target:** Return to baseline (<60 MB)

**How to measure:**
```typescript
if (global.gc) {
  global.gc();
  const memAfterGC = process.memoryUsage().heapUsed / 1024 / 1024;
  await logMetric('ocr_memory_after_gc_mb', memAfterGC);
}
```

---

### 3. OCR Quality Metrics

#### Average Confidence
**What:** Mean confidence score across all pages
**Why:** OCR quality indicator
**Target:** >0.90 (90%)
**Alert Thresholds:**
- Warning: <0.85
- Critical: <0.80

**How to measure:**
```typescript
const confidences = ocrResults.map(r => r.confidence);
const avgConfidence = confidences.reduce((a, b) => a + b) / confidences.length;

await logMetric('ocr_avg_confidence', avgConfidence);
```

#### Low Confidence Pages
**What:** Count of pages with confidence <0.80
**Why:** Identify problematic pages
**Target:** 0 pages
**Alert Thresholds:**
- Warning: >5% of pages
- Critical: >10% of pages

**How to measure:**
```typescript
const lowConfPages = ocrResults.filter(r => r.confidence < 0.80).length;
const lowConfPercent = (lowConfPages / ocrResults.length) * 100;

await logMetric('ocr_low_confidence_pages', lowConfPages);
await logMetric('ocr_low_confidence_percent', lowConfPercent);
```

---

### 4. Cost Metrics

#### API Cost Per Page
**What:** Google Vision API cost per page
**Why:** Budget tracking
**Target:** $0.0015 per page
**Alert Thresholds:**
- Warning: >$0.002 per page (pricing change?)
- Critical: >$0.005 per page

**How to measure:**
```typescript
const GOOGLE_VISION_COST_PER_1K = 1.50; // $1.50 per 1,000 pages
const costPerPage = GOOGLE_VISION_COST_PER_1K / 1000;

const totalCost = pageCount * costPerPage;

await logMetric('ocr_api_cost_usd', totalCost, {
  pages: pageCount,
  cost_per_page: costPerPage
});
```

#### Daily OCR Cost
**What:** Total API cost per day
**Why:** Budget monitoring
**Target:** <$10/day (6,666 pages)
**Alert Thresholds:**
- Warning: >$20/day
- Critical: >$50/day

**How to measure:**
```sql
SELECT
  DATE(created_at) as date,
  SUM(total_pages) as total_pages_processed,
  SUM(total_pages * 0.0015) as estimated_cost_usd
FROM pass025_ocr_metrics
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
```

---

### 5. Reliability Metrics

#### Success Rate
**What:** Percentage of pages processed successfully
**Why:** System reliability indicator
**Target:** >99%
**Alert Thresholds:**
- Warning: <95%
- Critical: <90%

**How to measure:**
```typescript
const successfulPages = ocrResults.filter(r => r.success).length;
const successRate = (successfulPages / totalPages) * 100;

await logMetric('ocr_success_rate', successRate);
```

#### Retry Count
**What:** Number of pages requiring retry
**Why:** API stability indicator
**Target:** <1% of pages
**Alert Thresholds:**
- Warning: >5% of pages
- Critical: >10% of pages

**How to measure:**
```typescript
let retryCount = 0;

// In OCR processing loop
try {
  result = await callGoogleVisionOCR(page);
} catch (error) {
  retryCount++;
  result = await callGoogleVisionOCR(page); // Retry
}

await logMetric('ocr_retry_count', retryCount);
```

#### Batch Size Used
**What:** Actual batch size per file
**Why:** Validate configuration, debug issues
**Target:** 10 (configurable)

**How to measure:**
```typescript
const batchSize = parseInt(process.env.OCR_BATCH_SIZE || '10');
await logMetric('ocr_batch_size', batchSize);
```

---

## Database Schema for Metrics

### Table: `pass025_ocr_metrics`

```sql
CREATE TABLE IF NOT EXISTS pass025_ocr_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_file_id UUID REFERENCES shell_files(id),

  -- Processing metrics
  total_pages INTEGER NOT NULL,
  ocr_processing_time_ms INTEGER NOT NULL,
  avg_time_per_page_ms INTEGER,
  batch_count INTEGER,
  batch_size INTEGER,

  -- Memory metrics
  memory_peak_mb FLOAT,
  memory_baseline_mb FLOAT,
  memory_after_gc_mb FLOAT,

  -- Quality metrics
  ocr_average_confidence FLOAT,
  ocr_min_confidence FLOAT,
  ocr_max_confidence FLOAT,
  low_confidence_pages INTEGER, -- Count of pages <0.80

  -- Cost metrics
  api_cost_usd FLOAT,

  -- Reliability metrics
  successful_pages INTEGER,
  failed_pages INTEGER,
  retry_count INTEGER,
  success_rate FLOAT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pass025_metrics_shell_file ON pass025_ocr_metrics(shell_file_id);
CREATE INDEX idx_pass025_metrics_created ON pass025_ocr_metrics(created_at DESC);
CREATE INDEX idx_pass025_metrics_pages ON pass025_ocr_metrics(total_pages);
```

---

## Monitoring Dashboards

### Real-Time Metrics (Current Session)

**Query: Last 10 processed files**
```sql
SELECT
  m.shell_file_id,
  s.original_filename,
  m.total_pages,
  m.ocr_processing_time_ms / 1000.0 as processing_time_sec,
  ROUND(m.avg_time_per_page_ms / 1000.0, 2) as sec_per_page,
  m.memory_peak_mb,
  m.ocr_average_confidence,
  m.success_rate,
  m.api_cost_usd,
  m.created_at
FROM pass025_ocr_metrics m
JOIN shell_files s ON m.shell_file_id = s.id
ORDER BY m.created_at DESC
LIMIT 10;
```

### Performance Trends (Last 24 Hours)

**Query: Hourly aggregates**
```sql
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as files_processed,
  SUM(total_pages) as total_pages,
  AVG(avg_time_per_page_ms / 1000.0) as avg_sec_per_page,
  AVG(memory_peak_mb) as avg_memory_mb,
  AVG(ocr_average_confidence) as avg_confidence,
  SUM(api_cost_usd) as total_cost_usd
FROM pass025_ocr_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

### Performance by File Size

**Query: Metrics segmented by page count**
```sql
SELECT
  CASE
    WHEN total_pages <= 10 THEN '1-10 pages'
    WHEN total_pages <= 50 THEN '11-50 pages'
    WHEN total_pages <= 100 THEN '51-100 pages'
    WHEN total_pages <= 200 THEN '101-200 pages'
    ELSE '201+ pages'
  END as file_size_bucket,
  COUNT(*) as file_count,
  AVG(ocr_processing_time_ms / 1000.0) as avg_processing_sec,
  AVG(memory_peak_mb) as avg_memory_mb,
  AVG(ocr_average_confidence) as avg_confidence,
  MAX(total_pages) as max_pages,
  AVG(success_rate) as avg_success_rate
FROM pass025_ocr_metrics
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY file_size_bucket
ORDER BY MAX(total_pages);
```

---

## Alert Configuration

### Critical Alerts (Page immediately)

1. **Memory Exhaustion Imminent**
   ```
   Condition: memory_peak_mb > 400
   Action: Page on-call engineer
   Priority: P0
   ```

2. **OCR Failure Rate High**
   ```
   Condition: success_rate < 90% for 5 consecutive files
   Action: Page on-call engineer
   Priority: P0
   ```

3. **Processing Time Extreme**
   ```
   Condition: avg_time_per_page_ms > 10000 (10 sec/page)
   Action: Check Google Vision API status
   Priority: P1
   ```

### Warning Alerts (Email/Slack)

1. **Memory Usage High**
   ```
   Condition: memory_peak_mb > 300
   Action: Slack alert to team
   Priority: P2
   ```

2. **OCR Quality Degraded**
   ```
   Condition: ocr_average_confidence < 0.85
   Action: Email to team
   Priority: P2
   ```

3. **Cost Spike**
   ```
   Condition: Daily cost > $20
   Action: Email to finance + engineering
   Priority: P2
   ```

---

## Performance Targets Summary

| Metric | Current | Target | Warning | Critical |
|--------|---------|--------|---------|----------|
| **Time per page** | 3 sec | <3 sec | >5 sec | >10 sec |
| **142-page file** | 45 sec | <60 sec | >90 sec | >120 sec |
| **Peak memory** | 70 MB | <100 MB | >300 MB | >400 MB |
| **OCR confidence** | 0.95 | >0.90 | <0.85 | <0.80 |
| **Success rate** | 99% | >99% | <95% | <90% |
| **Cost per page** | $0.0015 | <$0.002 | >$0.002 | >$0.005 |
| **Daily cost** | $3 | <$10 | >$20 | >$50 |

---

## Metrics Collection Implementation

### In Worker Code

```typescript
// apps/render-worker/src/utils/metrics.ts

interface OCRMetrics {
  shell_file_id: string;
  total_pages: number;
  ocr_processing_time_ms: number;
  memory_peak_mb: number;
  ocr_average_confidence: number;
  batch_count: number;
  batch_size: number;
  // ... other fields
}

export async function saveOCRMetrics(metrics: OCRMetrics): Promise<void> {
  await supabase.from('pass025_ocr_metrics').insert(metrics);
}

// Usage in OCR processing:
const metrics = {
  shell_file_id: shellFileId,
  total_pages: pages.length,
  ocr_processing_time_ms: totalTime,
  memory_peak_mb: peakMemory,
  ocr_average_confidence: avgConfidence,
  batch_count: Math.ceil(pages.length / BATCH_SIZE),
  batch_size: BATCH_SIZE,
  successful_pages: successCount,
  failed_pages: failCount,
  retry_count: retries,
  success_rate: (successCount / pages.length) * 100,
  api_cost_usd: pages.length * 0.0015,
  started_at: startTime,
  completed_at: new Date()
};

await saveOCRMetrics(metrics);
```

---

## Reporting

### Daily Performance Report (Automated)

**Send via email/Slack every morning:**
```
Pass 0.25 OCR Performance Report - [Date]

Files Processed: XX
Total Pages: XXX
Average Processing Time: X.X sec/page
Peak Memory Usage: XX MB
Average OCR Confidence: 0.XX
Success Rate: XX%
Total API Cost: $X.XX

Issues:
- [List any warnings or critical alerts]

Top 5 Slowest Files:
1. filename.pdf (XXX pages, XX sec)
...
```

### Weekly Trends Report

**Send every Monday:**
```
Pass 0.25 OCR Weekly Summary - Week of [Date]

Total Files: XXX (+/-X% vs last week)
Total Pages: X,XXX (+/-X%)
Average Time/Page: X.X sec (+/-X%)
Total Cost: $XX.XX (+/-X%)

Performance Improvements:
- [List any optimizations deployed]

Issues Identified:
- [List recurring problems]

Action Items:
- [Recommendations for next week]
```

---

**Related Documentation:**
- `BOTTLENECK_ANALYSIS.md` - Why OCR is the slowest component
- `OPTIMIZATION_HISTORY.md` - Chronicle of improvements
- `../testing/TEST_PLAN.md` - How to measure these metrics
