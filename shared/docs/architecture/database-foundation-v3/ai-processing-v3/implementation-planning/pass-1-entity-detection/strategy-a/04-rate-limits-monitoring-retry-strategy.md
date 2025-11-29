# Rate Limits, Monitoring & Retry Strategy

**Created:** 2025-11-28
**Purpose:** Compact reference for API rate limits, monitoring, and retry handling across AI passes.

---

## 1. Rate Limit Fundamentals

| Term | Definition | Reset |
|------|------------|-------|
| **RPM** | Requests per minute | Every 60 seconds |
| **TPM** | Tokens per minute (input + output combined) | Every 60 seconds |
| **RPD** | Requests per day | Midnight Pacific |

**Both RPM and TPM must be satisfied** - whichever limit is hit first blocks requests (HTTP 429).

---

## 2. Current Provider Limits (Nov 2025)

### OpenAI GPT-5 Family (gpt-5, gpt-5-mini, gpt-5-nano)

Released August 2025. Context: 272K input / 128K output tokens. Pricing: $1.25/M input, $10/M output.
Rate limits doubled in September 2025. Uses unified router that auto-switches between models based on query complexity.

| Tier | TPM | Batch TPM | Notes |
|------|-----|-----------|-------|
| Tier 1 | 500,000 | 1,500,000 | Default after first payment |
| Tier 2 | 1,000,000 | 3,000,000 | After $50 spend |
| Tier 3 | 2,000,000 | - | After $100 spend |
| Tier 4 | 4,000,000 | - | After $500 spend |

*gpt-5-mini has even higher limits: 500K TPM at Tier 1, scaling to 180M TPM at top tier.*
*Auto-downgrade: Once you hit limits, requests auto-downgrade to mini versions.*

### Google Gemini 2.5 / 3.0 Family

**Free Tier (Restrictive):**

| Model | RPM | RPD | TPM |
|-------|-----|-----|-----|
| Gemini 2.5 Pro | 5 | 25 | 250,000 |
| Gemini 2.5 Flash | 10 | 250 | 250,000 |
| Gemini 2.5 Flash-Lite | 15 | 1,000 | 250,000 |

**Paid Tiers:**

| Tier | RPM | TPM | Notes |
|------|-----|-----|-------|
| Tier 1 | 300 | 1,000,000 | Pay-as-you-go |
| Tier 2+ | Higher | Higher | Based on spending |
| Enterprise | 2,000+ | 50,000+ RPD | Custom negotiated |

*Gemini 3.0 Pro (Nov 2025): $2/$12 per M tokens (up to 200K context), $4/$18 beyond 200K.*
*Auto-downgrade: Google may downgrade Pro to Flash for simple tasks to preserve resources.*

### Anthropic Claude 4/4.5 Family

**API Rate Limits (Tier-based, varies by model):**

| Model | Example Tier 2 Limits | Notes |
|-------|---------------------|-------|
| Sonnet 4.5 | ~40K-80K TPM | Shared limit across 4/4.5 |
| Opus 4/4.1 | ~20K-40K TPM | Separate, lower limits |
| Haiku 4.5 | ~100K-200K TPM | Highest throughput |

*Exact limits vary significantly by usage tier and require checking console.*
*Long context (>200K tokens) has separate, stricter limits.*
*Recent issues: Users reported unexpected limit reductions after Sonnet 4.5 launch (Sept 2025).*

### Self-Hosted (HuggingFace/Local)

| Aspect | Limit | Notes |
|--------|-------|-------|
| RPM | Unlimited | Hardware-bound only |
| TPM | Unlimited | GPU throughput-bound |
| Cost | Infrastructure only | No per-token fees |

**Self-hosted constraints:** GPU VRAM, inference speed, infrastructure cost. Break-even vs API at ~1,100+ documents/day.

---

## 3. Exora Parallel Processing Capacity

With ~5,000 tokens per Pass 1 call:

| Provider/Tier | Max Parallel Calls/min | Notes |
|---------------|------------------------|-------|
| OpenAI Tier 1 | 100 | 500K TPM / 5K = 100 |
| OpenAI Tier 2 | 200 | 1M TPM / 5K = 200 |
| OpenAI Tier 3 | 400 | 2M TPM / 5K = 400 |
| OpenAI Tier 4 | 800 | 4M TPM / 5K = 800 |
| gpt-5-mini Tier 1 | 100+ | Even higher limits |
| Gemini Paid Tier 1 | 200 | 1M TPM / 5K = 200 |
| Claude Tier 2 | 16 | 80K TPM / 5K = 16 |

(Claude's limits are much more complex)

**Recommendation:** OpenAI gpt-5-mini or Gemini 2.5 Flash for parallel batch processing. Claude has significantly lower limits.

---

## 4. Auto-Downgrade Risk (CRITICAL FOR EXORA)

Both GPT-5 and Gemini auto-downgrade to smaller models when limits are hit:
- **GPT-5** -> gpt-5-mini (lower accuracy)
- **Gemini Pro** -> Flash (for "simple" tasks)

**Problem:** You won't know which model processed each page!
- Can't ensure consistent quality
- Lower model might miss complex medical entities
- Can't reliably reproduce results

**Solutions:**
1. Monitor which model actually responded (check response metadata)
2. Use batch APIs (higher limits, no auto-downgrade)
3. Request manual tier upgrades before hitting limits
4. Explicitly specify model in API calls and reject auto-downgrade responses

---

## 5. Rate Limit Monitoring

### 5.1 Response Header Tracking

All providers return rate limit info in response headers:

```typescript
// OpenAI headers
const remaining = response.headers['x-ratelimit-remaining-tokens'];
const resetMs = response.headers['x-ratelimit-reset-tokens'];

// Log to metrics
await logRateLimitMetrics({
  provider: 'openai',
  remaining_tokens: remaining,
  remaining_requests: response.headers['x-ratelimit-remaining-requests'],
  reset_at: new Date(Date.now() + parseInt(resetMs))
});
```

### 4.2 Metrics Table Schema

Add to existing `pass1_entity_metrics` or create new:

```sql
-- Option A: Add columns to pass1_entity_metrics
ALTER TABLE pass1_entity_metrics ADD COLUMN rate_limit_remaining_tokens INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN rate_limit_remaining_requests INTEGER;
ALTER TABLE pass1_entity_metrics ADD COLUMN rate_limit_hit BOOLEAN DEFAULT FALSE;

-- Option B: Separate rate limit events table (for detailed tracking)
CREATE TABLE ai_rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,  -- 'openai', 'gemini', 'claude'
  pass_type TEXT NOT NULL, -- 'pass1', 'pass2', 'pass05'
  shell_file_id UUID REFERENCES shell_files(id),
  remaining_tokens INTEGER,
  remaining_requests INTEGER,
  limit_hit BOOLEAN DEFAULT FALSE,
  retry_after_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 Pre-Flight Rate Check

Before firing parallel batches:

```typescript
async function canProcessBatches(batchCount: number, tokensPerBatch: number): Promise<boolean> {
  const totalTokens = batchCount * tokensPerBatch;
  const currentRemaining = await getRateLimitStatus();

  if (currentRemaining.tokens < totalTokens) {
    logger.warn('Insufficient token capacity', {
      required: totalTokens,
      available: currentRemaining.tokens,
      wait_ms: currentRemaining.reset_ms
    });
    return false;
  }
  return true;
}
```

---

## 6. Retry Strategy

### 6.1 Exponential Backoff with Jitter

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  jitterFactor: 0.2  // +/- 20% randomization
};

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (error.status === 429) {
        // Rate limited - use Retry-After header if available
        const retryAfter = error.headers?.['retry-after'];
        const delayMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : calculateBackoff(attempt);

        logger.warn('Rate limit hit, retrying', { attempt, delay_ms: delayMs });
        await sleep(delayMs);
      } else if (error.status >= 500) {
        // Server error - retry with backoff
        const delayMs = calculateBackoff(attempt);
        await sleep(delayMs);
      } else {
        // Client error (4xx except 429) - don't retry
        throw error;
      }
    }
  }
  throw lastError;
}

function calculateBackoff(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelayMs
  );
  const jitter = delay * RETRY_CONFIG.jitterFactor * (Math.random() - 0.5);
  return Math.round(delay + jitter);
}
```

### 6.2 Batch-Level vs Call-Level Retry

| Scenario | Strategy |
|----------|----------|
| Single call fails (429) | Retry that call with backoff |
| Multiple calls fail (rate limit spike) | Pause all, wait for reset, resume |
| Persistent failures (>3 retries) | Fail the batch, mark for manual review |

### 6.3 Concurrency Limiting

Use `p-limit` or similar to cap parallel requests:

```typescript
import pLimit from 'p-limit';

const limit = pLimit(10);  // Max 10 concurrent API calls

const results = await Promise.all(
  batches.map(batch => limit(() => processPass1Batch(batch)))
);
```

---

## 7. Prompt Caching (Cost Optimization)

| Provider | Caching Support | Parallel Compatible | Typical Savings |
|----------|-----------------|---------------------|-----------------|
| OpenAI | No | N/A | 0% |
| Claude | Yes (ephemeral) | Sequential warmup needed | 35-60% |
| Gemini | Yes (context) | Yes with cache reference | 40-70% |

**For parallel batches:** Gemini context caching works best. Claude requires sequential warmup call before parallel execution.

---

## 8. Self-Hosted Alternative

When rate limits become a constraint at scale:

| Model | VRAM Required | Tokens/sec | Use Case |
|-------|---------------|------------|----------|
| Llama 3.3 70B | 2x A100 (80GB) | 10-20 | Best accuracy |
| Qwen 2.5 32B | 1x A100 (40GB) | 30-50 | Good balance |
| Mistral Small 24B | 1x A100 (40GB) | 40-60 | Fast entity extraction |

**Break-even calculation:** ~1,100 documents/day vs OpenAI API costs.

---

## 9. Batch API Strategy (Recommended for Exora)

For non-urgent document processing, batch APIs offer significant advantages:

| Provider | Realtime TPM | Batch TPM | Multiplier |
|----------|--------------|-----------|------------|
| OpenAI Tier 1 | 500K | 1,500K | 3x |
| OpenAI Tier 2 | 1M | 3M | 3x |
| Gemini | Same | Separate quota | Parallel |

**Advantages:**
- 3-5x higher rate limits
- 50% cheaper (OpenAI batch API)
- No auto-downgrading to smaller models
- Process 100-page docs overnight without hitting limits

**Implementation:**
```typescript
// Upload all batches as single batch job
const batchJob = await openai.batches.create({
  input_file_id: uploadedFile.id,
  endpoint: '/v1/chat/completions',
  completion_window: '24h'
});

// Check status periodically
const status = await openai.batches.retrieve(batchJob.id);
// Results ready in 1-24 hours
```

**Use case:** Large documents (50+ pages) where real-time response isn't required.

---

## 10. Implementation Checklist

| Task | Status |
|------|--------|
| Add rate limit header parsing to API client | [ ] |
| Implement exponential backoff retry wrapper | [ ] |
| Add concurrency limiter (p-limit) to parallel processing | [ ] |
| Create rate limit metrics logging | [ ] |
| Add pre-flight capacity check before batch processing | [ ] |
| Monitor and alert on repeated 429 errors | [ ] |
| Track actual model used per response (detect auto-downgrade) | [ ] |
| Evaluate batch API for large documents | [ ] |
