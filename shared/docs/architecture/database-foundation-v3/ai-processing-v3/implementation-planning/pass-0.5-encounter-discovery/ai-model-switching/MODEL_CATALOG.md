# AI Model Catalog for Pass 0.5

**Purpose:** Comprehensive specifications and comparison of all AI models
**Last Updated:** November 9, 2025
**Current Production Model:** GPT-5

---

## Quick Reference Table

| Model | Context (Input) | Max Output | Pricing | Best For |
|-------|-----------------|------------|---------|----------|
| **GPT-5** | 272K | 128K | See OpenAI pricing | Current production |
| **GPT-5-mini** | 128K | 128K | See OpenAI pricing | Cost optimization |
| **Gemini 2.5 Pro** | 1M | 65K | See Google AI pricing | Best reasoning |
| **Gemini 2.5 Flash** | 1M | 65K | See Google AI pricing | **Recommended** |

Pricing note: Provider pricing changes frequently and may depend on region, tier, and usage. Always compute projected costs using current provider pricing and your token estimates (see “Token Estimation Guide”).

---

## Detailed Model Specifications

### OpenAI Models

#### GPT-5

**Model ID:** `gpt-5`
**Environment Variable:** `PASS_05_USE_GPT5`
**Vendor:** OpenAI
**Release Date:** October 2025

**Capabilities:**
- Context Window: 272,000 input tokens / 128,000 output tokens (400K total)
- Temperature: Configurable
- JSON Mode: Native support via `response_format`
- Structured Output: Yes
- Function Calling: Yes

**Performance:**
- Latency: ~2-5 seconds for first token
- Throughput: ~100 tokens/second
- Reliability: 99.9% uptime SLA

**Pricing:**
- Refer to OpenAI’s pricing page (see “Verification Sources”) for current input/output token rates
- Estimate per-document cost using token counts × current rates

**Limitations:**
- Cannot handle documents over ~190 pages (272K token limit)
- Higher cost than Gemini alternatives

**Use Cases:**
- Production baseline (current)
- Documents under 190 pages
- When OpenAI ecosystem required

**Configuration:**
```bash
PASS_05_USE_GPT5=true
PASS_05_USE_GPT5_MINI=false
PASS_05_USE_GEMINI_2_5_PRO=false
PASS_05_USE_GEMINI_2_5_FLASH=false
```

---

#### GPT-5-mini

**Model ID:** `gpt-5-mini`
**Environment Variable:** `PASS_05_USE_GPT5_MINI`
**Vendor:** OpenAI
**Release Date:** October 2025

**Capabilities:**
- Context Window: 128,000 tokens (input + output combined)
- Temperature: Configurable
- JSON Mode: Native support via `response_format`
- Structured Output: Yes
- Function Calling: Yes

**Performance:**
- Latency: ~1-3 seconds for first token
- Throughput: ~150 tokens/second
- Reliability: 99.9% uptime SLA

**Pricing:**
- Refer to OpenAI’s pricing page (see “Verification Sources”) for current input/output token rates
- Estimate per-document cost using token counts × current rates

**Limitations:**
- Cannot handle documents over ~90 pages (128K token limit)
- Failed on 220-page test document

**Use Cases:**
- Small documents (<90 pages)
- Cost-sensitive applications
- Development/testing

**Configuration:**
```bash
PASS_05_USE_GPT5=false
PASS_05_USE_GPT5_MINI=true
PASS_05_USE_GEMINI_2_5_PRO=false
PASS_05_USE_GEMINI_2_5_FLASH=false
```

---

### Google Gemini Models

#### Gemini 2.5 Pro

**Model ID:** `gemini-2.5-pro`
**Environment Variable:** `PASS_05_USE_GEMINI_2_5_PRO`
**Vendor:** Google
**Release Date:** November 2025

**Capabilities:**
- Context Window: 1,048,576 input tokens / 65,536 output tokens
- Temperature: Configurable (0.0 - 2.0)
- JSON Mode: Native support via `responseMimeType`
- Multimodal: Yes (text, images, video, audio)
- Code Execution: Yes

**Performance:**
- Latency: ~3-7 seconds for first token
- Throughput: ~75 tokens/second
- Reliability: 99.9% uptime SLA
- Quality: Strong general reasoning (see model card for current public benchmarks)

**Pricing:**
- Refer to Google AI pricing (see “Verification Sources”) for current input/output token rates
- Estimate per-document cost using token counts × current rates

**Advantages:**
- **10x larger context** than GPT-5 (1M vs 272K)
- Handles 500+ page documents easily
- Superior reasoning capabilities
- Temperature control available
- Multimodal support

**Limitations:**
- Slightly slower than Flash variant
- Higher cost than Flash
- Output limited to 65K tokens

**Use Cases:**
- Complex medical reasoning
- Very large documents (500+ pages)
- When quality is paramount
- Multimodal document analysis

**Configuration:**
```bash
PASS_05_USE_GPT5=false
PASS_05_USE_GPT5_MINI=false
PASS_05_USE_GEMINI_2_5_PRO=true
PASS_05_USE_GEMINI_2_5_FLASH=false
```

---

#### Gemini 2.5 Flash (RECOMMENDED)

**Model ID:** `gemini-2.5-flash`
**Environment Variable:** `PASS_05_USE_GEMINI_2_5_FLASH`
**Vendor:** Google
**Release Date:** November 2025

**Capabilities:**
- Context Window: 1,048,576 input tokens / 65,536 output tokens
- Temperature: Configurable (0.0 - 2.0)
- JSON Mode: Native support via `responseMimeType`
- Multimodal: Yes (text, images, video, audio)
- Code Execution: Limited

**Performance:**
- Latency: ~1-4 seconds for first token
- Throughput: ~120 tokens/second
- Reliability: 99.9% uptime SLA
- Quality: Excellent for document analysis

**Pricing:**
- Refer to Google AI pricing (see “Verification Sources”) for current input/output token rates
- Estimate per-document cost using token counts × current rates

**Advantages:**
- **Best price/performance ratio**
- **10x larger context** than GPT-5
- Handles 220-page failed document
- Fast response times
- Very low cost
- Temperature control

**Limitations:**
- Slightly lower reasoning than Pro variant
- Output limited to 65K tokens
- Limited code execution

**Use Cases:**
- **PRIMARY RECOMMENDATION**
- All document sizes up to 500 pages
- Cost-conscious production deployment
- High-volume processing

**Configuration:**
```bash
PASS_05_USE_GPT5=false
PASS_05_USE_GPT5_MINI=false
PASS_05_USE_GEMINI_2_5_PRO=false
PASS_05_USE_GEMINI_2_5_FLASH=true  # Recommended
```

---

## Model Comparison Matrix

### Context Window Comparison

```
Document Pages | GPT-5 | GPT-5-mini | Gemini 2.5 Pro | Gemini 2.5 Flash
---------------|-------|------------|----------------|------------------
50 pages       |   ✅  |     ✅     |       ✅       |        ✅
100 pages      |   ✅  |     ⚠️     |       ✅       |        ✅
142 pages      |   ✅  |     ❌     |       ✅       |        ✅
220 pages      |   ❌  |     ❌     |       ✅       |        ✅
500 pages      |   ❌  |     ❌     |       ✅       |        ✅
1000 pages     |   ❌  |     ❌     |       ⚠️       |        ⚠️

✅ = Handles easily
⚠️ = Near limit, may fail
❌ = Exceeds context window
```

### Cost Analysis (How to estimate per document)

1) Estimate tokens/pages (see “Token Estimation Guide”)
2) Split into input vs. output tokens for your prompts
3) Multiply by the provider’s current input/output rates (see links below)
4) Add overhead for retries and tool calls if applicable

Tip: Maintain a small script to recompute costs from logs using live pricing.

### Performance Metrics

| Metric | GPT-5 | GPT-5-mini | Gemini 2.5 Pro | Gemini 2.5 Flash |
|--------|-------|------------|----------------|------------------|
| First Token Latency | 2-5s | 1-3s | 3-7s | 1-4s |
| Tokens/Second | 100 | 150 | 75 | 120 |
| Benchmarks | See model card | See model card | See model card | See model card |
| Medical Domain | Excellent | Good | Excellent | Very Good |

---

## Token Estimation Guide

### Pages to Tokens Conversion

**Standard Medical Document:**
- Average tokens per page: 700-900
- Dense medical records: 900-1100 tokens/page
- Sparse forms: 400-600 tokens/page

**Quick Estimates:**
```
50 pages   ≈ 35,000 - 45,000 tokens
100 pages  ≈ 70,000 - 90,000 tokens
142 pages  ≈ 100,000 - 128,000 tokens
220 pages  ≈ 154,000 - 198,000 tokens
500 pages  ≈ 350,000 - 450,000 tokens
```

### Prompt Overhead

Pass 0.5 prompt adds approximately:
- System instructions: ~1,500 tokens
- JSON schema: ~500 tokens
- Metadata: ~200 tokens
- **Total overhead: ~2,200 tokens**

### Output Token Estimates

Encounters per document:
- Small (1-50 pages): 5-15 encounters
- Medium (51-150 pages): 15-50 encounters
- Large (151-300 pages): 50-100 encounters

Tokens per encounter: ~150-200
**Total output: encounters × 175 tokens (average)**

---

## Model Selection Decision Tree

```
Start: How many pages in document?
│
├─ Less than 90 pages?
│  ├─ Cost critical? → GPT-5-mini
│  └─ Quality critical? → Gemini 2.5 Flash (Recommended)
│
├─ 90-190 pages?
│  ├─ OpenAI required? → GPT-5
│  └─ Best value? → Gemini 2.5 Flash (Recommended)
│
├─ 190-500 pages?
│  ├─ Best quality? → Gemini 2.5 Pro
│  └─ Best value? → Gemini 2.5 Flash (Recommended)
│
└─ Over 500 pages?
   └─ Requires chunked processing (any model)
```

---

## API Requirements

### OpenAI Models

**API Key:** Required
```bash
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
```

**SDK Guidance:**
- Use a current stable `openai` SDK version per release notes
- Prefer the Responses API for new builds; Chat Completions remains available

**Endpoints:**
- Recommended: `https://api.openai.com/v1/responses`
- Legacy: `https://api.openai.com/v1/chat/completions`

### Google Gemini Models

**API Key:** Required
```bash
GOOGLE_AI_API_KEY=AIzaxxxxxxxxxxxxxxxxxx
```

**SDK Guidance:**
- Use a current stable `@google/generative-ai` version per release notes

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/`

---

## Migration Recommendations

### From GPT-5 to Gemini 2.5 Flash

**Benefits:**
- Significant cost reduction (verify with current provider pricing)
- Handle 220+ page documents (currently failing)
- 10x larger context window
- Temperature control

**Migration Steps:**
1. Set `PASS_05_USE_GEMINI_2_5_FLASH=true`
2. Set `PASS_05_USE_GPT5=false`
3. Add `GOOGLE_AI_API_KEY` to environment
4. Deploy and monitor for 24 hours

**Rollback:**
1. Set `PASS_05_USE_GPT5=true`
2. Set `PASS_05_USE_GEMINI_2_5_FLASH=false`
3. Redeploy

### Testing Protocol

**Before Migration:**
1. Process test document with GPT-5
2. Save encounter output as baseline
3. Note processing time and cost

**After Migration:**
1. Process same document with new model
2. Compare encounter detection accuracy
3. Verify cost reduction
4. Check processing time

**Success Metrics:**
- Encounter detection accuracy ≥95% of baseline
- Cost reduction vs. baseline
- No increase in error rate
- Processing time within 2x of baseline

---

## Cost Optimization Strategies

### 1. Model Selection by Document Size

```javascript
function selectOptimalModel(pageCount: number): string {
  if (pageCount < 90) {
    return 'gpt-5-mini';  // Cheapest for small docs
  } else if (pageCount < 190) {
    return 'gemini-2.5-flash';  // Best value
  } else {
    return 'gemini-2.5-flash';  // Only option for large
  }
}
```

### 2. Batch Processing

Group small documents for better throughput:
- Combine multiple <10 page documents
- Process as single request
- Split results afterward

### 3. Caching Strategy

For frequently accessed documents:
- Cache encounter results for 7 days
- Skip reprocessing if unchanged
- Invalidate on document update

### 4. Prompt Optimization

Reduce input tokens:
- Compress whitespace in OCR text
- Remove redundant headers/footers
- Truncate non-medical content

---

## Monitoring and Alerting

### Key Metrics to Track

**Cost Metrics:**
```sql
SELECT
  DATE(created_at) as date,
  ai_model_name,
  COUNT(*) as documents,
  AVG(ai_cost_usd) as avg_cost,
  SUM(ai_cost_usd) as total_cost
FROM ai_processing_sessions
GROUP BY DATE(created_at), ai_model_name
ORDER BY date DESC;
```

**Performance Metrics:**
```sql
SELECT
  ai_model_name,
  AVG(processing_time_ms) as avg_time,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95_time,
  COUNT(*) FILTER (WHERE status = 'failed') as failures,
  COUNT(*) as total
FROM ai_processing_sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY ai_model_name;
```

**Alert Thresholds:**
- Cost per document > $1.00
- Failure rate > 5%
- P95 latency > 30 seconds
- Context window errors > 1/hour

---

## Future Models (Under Evaluation)

### Claude 3.5 Sonnet (Anthropic)
- Context: 200K tokens
- Cost: See Anthropic pricing
- Status: Too expensive for production

### Command R+ (Cohere)
- Context: 128K tokens
- Cost: See provider pricing
- Status: Limited context window

### Mixtral 8x22B (Self-hosted)
- Context: 64K tokens
- Cost: Infrastructure only
- Status: Requires GPU infrastructure

---

## Appendix: Environment Variable Reference

```bash
# Model Selection (set exactly ONE to true)
PASS_05_USE_GPT5=false
PASS_05_USE_GPT5_MINI=false
PASS_05_USE_GEMINI_2_5_PRO=false
PASS_05_USE_GEMINI_2_5_FLASH=true  # Recommended

# API Keys (required based on selected model)
OPENAI_API_KEY=sk-xxxxx          # For GPT models
GOOGLE_AI_API_KEY=AIzaxxxxx      # For Gemini models

# Optional Configuration
PASS_05_MAX_RETRIES=3             # API retry attempts
PASS_05_TIMEOUT_MS=30000          # Request timeout
PASS_05_LOG_TOKENS=true           # Log token usage
```

---

## Verification Sources (as of November 2025)

- OpenAI API pricing: [openai.com/api/pricing](https://openai.com/api/pricing)
- OpenAI API docs: [platform.openai.com/docs](https://platform.openai.com/docs)
- Google AI Studio pricing: [ai.google.dev/pricing](https://ai.google.dev/pricing)
- Google Gemini models: [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)
- Anthropic pricing: [anthropic.com/pricing](https://www.anthropic.com/pricing)

Always verify token limits, pricing, and feature availability against the provider’s official documentation before making production changes.

---

**Last Updated:** November 9, 2025
**Next Review:** December 2025 (after 1 month of Gemini production usage)