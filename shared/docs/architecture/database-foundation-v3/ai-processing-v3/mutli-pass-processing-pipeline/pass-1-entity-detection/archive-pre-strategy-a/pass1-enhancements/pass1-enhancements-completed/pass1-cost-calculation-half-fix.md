# Cost Calculation Fix - Model-Specific Pricing Implementation

**Date:** 2025-10-12
**Priority:** HIGH - Cost estimates inflated by 5.46× for GPT-5 Mini
**Status:** ✅ COMPLETED - Deployed to production (commit 85f5cef)

## Executive Summary

The worker's cost calculation function uses hardcoded GPT-4o pricing ($2.50/$10.00 per 1M tokens) for ALL models, causing significant cost overestimates for GPT-5 Mini sessions.

**Impact:**
- **GPT-5 Mini sessions**: 5.46× cost overestimate ($0.1575 vs actual $0.029)
- **GPT-4o sessions**: Correct pricing (no impact)
- **Database pollution**: 20 sessions with incorrect cost estimates
- **Analytics impact**: Cost dashboards show inflated costs

**Root Cause:**
```typescript
// Pass1EntityDetector.ts:550-563 (CURRENT - WRONG)
private calculateCost(usage: any): number {
  const GPT4O_PRICING = {
    input_per_1m: 2.50,   // ❌ Hardcoded for GPT-4o
    output_per_1m: 10.00, // ❌ Hardcoded for GPT-4o
  };

  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;

  const inputCost = (promptTokens / 1_000_000) * GPT4O_PRICING.input_per_1m;
  const outputCost = (completionTokens / 1_000_000) * GPT4O_PRICING.output_per_1m;

  return inputCost + outputCost;
}
```

**Solution:** Implement model-specific pricing detection with fallback defaults.

---

## Investigation Findings

### Production Model Usage Analysis

**Query:**
```sql
SELECT
  ai_model_name,
  COUNT(*) as usage_count,
  MIN(created_at) as first_used,
  MAX(created_at) as last_used
FROM ai_processing_sessions
GROUP BY ai_model_name
ORDER BY usage_count DESC;
```

**Results:**
| Model | Sessions | First Used | Last Used | Status |
|-------|----------|------------|-----------|--------|
| gpt-5-mini | 20 | 2025-10-07 | 2025-10-12 | **Current prod model** |
| gpt-4o | 12 | 2025-10-05 | 2025-10-06 | Legacy (pre-Oct 7) |

**Key Insight:** System switched from gpt-4o to gpt-5-mini on Oct 7, 2025.

---

### OpenAI Pricing Research (2025)

**GPT-5 Mini Pricing:**
- Input: $0.25 per 1M tokens
- Output: $2.00 per 1M tokens
- Source: OpenAI official pricing page (verified 2025-10-12)

**GPT-4o Pricing:**
- Input: $2.50 per 1M tokens
- Output: $10.00 per 1M tokens
- Source: OpenAI official pricing page (verified 2025-10-12)

**Cost Comparison (Test-10 document):**
```
Token Usage: 10,653 input + 13,083 output = 23,736 total

GPT-5 Mini (CORRECT):
- Input:  (10,653 / 1M) × $0.25 = $0.002663
- Output: (13,083 / 1M) × $2.00 = $0.026166
- Total: $0.02883 (~$0.029 or 3 cents)

GPT-4o Pricing (INCORRECT for GPT-5 Mini):
- Input:  (10,653 / 1M) × $2.50 = $0.026633
- Output: (13,083 / 1M) × $10.00 = $0.130830
- Total: $0.1575 (~16 cents)

Overestimate: $0.1575 / $0.02883 = 5.46× too expensive!
```

---

### Code Locations Affected

**Primary Location:**
- `apps/render-worker/src/pass1/Pass1EntityDetector.ts:540-563`
  - `calculateCost()` method (private)
  - Called on line 394 (minimal prompt path)
  - Called on line 498 (full prompt path)

**Dependent Locations:**
- `apps/render-worker/src/pass1/Pass1EntityDetector.ts:198`
  - `cost_estimate` returned in processing result
- `apps/render-worker/src/pass1/pass1-database-builder.ts:180`
  - `processing_cost_estimate` written to shell_files table

**Documentation Impact:**
- Method docstring (lines 541-548) references "GPT-4o Vision processing"
- Comments assume single model pricing

---

## Proposed Fix

### Design Principles

1. **Model Detection:** Detect model from `this.config.model` string
2. **Pricing Tables:** Maintain clear pricing constants for each model
3. **Defensive Fallback:** Default to GPT-4o pricing if model unknown (conservative estimate)
4. **Future-Proof:** Easy to add new models
5. **Type Safety:** Use TypeScript interfaces for pricing structures
6. **Documentation:** Update docstrings and comments

### Implementation

```typescript
// =============================================================================
// COST CALCULATION (UPDATED)
// =============================================================================

/**
 * OpenAI Model Pricing (as of 2025-10-12)
 *
 * Pricing structure for OpenAI vision models.
 * Source: https://openai.com/api/pricing/
 */
interface ModelPricing {
  input_per_1m: number;   // Input tokens per 1 million
  output_per_1m: number;  // Output tokens per 1 million
  notes?: string;
}

/**
 * Model-specific pricing table
 *
 * IMPORTANT: Update this table when OpenAI changes pricing or new models are added.
 * Last verified: 2025-10-12
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-5 family (current production)
  'gpt-5-mini': {
    input_per_1m: 0.25,   // $0.25 per 1M tokens
    output_per_1m: 2.00,  // $2.00 per 1M tokens
    notes: 'GPT-5 Mini - Cost-effective model for high-volume processing',
  },
  'gpt-5': {
    input_per_1m: 1.25,   // $1.25 per 1M tokens (5× GPT-5 Mini)
    output_per_1m: 10.00, // $10.00 per 1M tokens (5× GPT-5 Mini)
    notes: 'GPT-5 Standard - Higher capability than Mini',
  },

  // GPT-4o family (legacy)
  'gpt-4o': {
    input_per_1m: 2.50,   // $2.50 per 1M tokens
    output_per_1m: 10.00, // $10.00 per 1M tokens
    notes: 'GPT-4o - Legacy production model (used until Oct 7, 2025)',
  },
  'gpt-4o-mini': {
    input_per_1m: 0.15,   // $0.15 per 1M tokens
    output_per_1m: 0.60,  // $0.60 per 1M tokens
    notes: 'GPT-4o Mini - Most cost-effective GPT-4o variant',
  },
};

/**
 * Default pricing (conservative fallback for unknown models)
 * Uses GPT-4o pricing as conservative estimate
 */
const DEFAULT_PRICING: ModelPricing = {
  input_per_1m: 2.50,
  output_per_1m: 10.00,
  notes: 'Default fallback - uses GPT-4o pricing for unknown models',
};

/**
 * Calculate cost for OpenAI API call with model-specific pricing
 *
 * Supports multiple models:
 * - gpt-5-mini: $0.25/$2.00 per 1M tokens (current production)
 * - gpt-5: $1.25/$10.00 per 1M tokens
 * - gpt-4o: $2.50/$10.00 per 1M tokens (legacy)
 * - gpt-4o-mini: $0.15/$0.60 per 1M tokens
 *
 * Falls back to GPT-4o pricing for unknown models (conservative estimate).
 *
 * Note: OpenAI's prompt_tokens already includes image tokens, so we don't
 * need to estimate or add them separately.
 *
 * @param usage - Token usage from OpenAI API response
 * @returns Estimated cost in USD
 */
private calculateCost(usage: any): number {
  const promptTokens = usage?.prompt_tokens || 0;  // Already includes image tokens
  const completionTokens = usage?.completion_tokens || 0;

  // Detect model pricing from config
  const modelName = this.config.model;
  const pricing = MODEL_PRICING[modelName] || DEFAULT_PRICING;

  // Log warning if using default pricing (helps catch new models)
  if (!MODEL_PRICING[modelName]) {
    this.logger.warn('Unknown model for cost calculation, using default pricing', {
      model: modelName,
      default_pricing: DEFAULT_PRICING,
    });
  }

  // Calculate costs
  const inputCost = (promptTokens / 1_000_000) * pricing.input_per_1m;
  const outputCost = (completionTokens / 1_000_000) * pricing.output_per_1m;
  const totalCost = inputCost + outputCost;

  // Debug logging for cost calculation
  this.logger.debug('Cost calculation completed', {
    model: modelName,
    input_tokens: promptTokens,
    output_tokens: completionTokens,
    input_cost_usd: inputCost.toFixed(6),
    output_cost_usd: outputCost.toFixed(6),
    total_cost_usd: totalCost.toFixed(6),
    pricing_input: pricing.input_per_1m,
    pricing_output: pricing.output_per_1m,
  });

  return totalCost;
}
```

---

## Verification Plan

### Test Cases

**1. GPT-5 Mini (Current Production)**
```typescript
// Test input
const usage = {
  prompt_tokens: 10653,
  completion_tokens: 13083,
  total_tokens: 23736,
};
const config = { model: 'gpt-5-mini' };

// Expected output
const expectedCost = 0.02883; // $0.029
const tolerance = 0.00001;

// Assertion
assert(Math.abs(calculateCost(usage) - expectedCost) < tolerance);
```

**2. GPT-4o (Legacy)**
```typescript
// Test input
const usage = {
  prompt_tokens: 10653,
  completion_tokens: 13083,
  total_tokens: 23736,
};
const config = { model: 'gpt-4o' };

// Expected output
const expectedCost = 0.1575; // $0.1575
const tolerance = 0.0001;

// Assertion
assert(Math.abs(calculateCost(usage) - expectedCost) < tolerance);
```

**3. Unknown Model (Fallback)**
```typescript
// Test input
const usage = {
  prompt_tokens: 10653,
  completion_tokens: 13083,
  total_tokens: 23736,
};
const config = { model: 'gpt-6-experimental' };

// Expected output (should fallback to GPT-4o pricing)
const expectedCost = 0.1575; // $0.1575 (GPT-4o pricing)
const tolerance = 0.0001;

// Assertion
assert(Math.abs(calculateCost(usage) - expectedCost) < tolerance);
// Assert warning logged
assert(logContains('Unknown model for cost calculation'));
```

### Production Validation

After deployment, validate with real data:

```sql
-- Check cost estimates before and after fix
SELECT
  ai_model_name,
  COUNT(*) as session_count,
  AVG((processing_metadata->'cost_estimate')::numeric) as avg_cost_before_fix,
  AVG(
    CASE
      WHEN ai_model_name = 'gpt-5-mini' THEN
        ((token_usage->'input_tokens')::numeric / 1000000.0 * 0.25) +
        ((token_usage->'output_tokens')::numeric / 1000000.0 * 2.00)
      WHEN ai_model_name = 'gpt-4o' THEN
        ((token_usage->'input_tokens')::numeric / 1000000.0 * 2.50) +
        ((token_usage->'output_tokens')::numeric / 1000000.0 * 10.00)
    END
  ) as expected_cost_after_fix
FROM ai_processing_sessions aps
JOIN pass1_entity_metrics pem ON aps.id = pem.processing_session_id
GROUP BY ai_model_name;
```

**Expected Results:**
| Model | Sessions | Avg Cost (Before) | Expected Cost (After) | Correction |
|-------|----------|-------------------|----------------------|------------|
| gpt-5-mini | 20 | ~$0.1575 | ~$0.029 | 5.46× reduction |
| gpt-4o | 12 | ~$0.1575 | ~$0.1575 | No change ✓ |

---

## Migration Considerations

### Historical Data Correction

**Decision Required:** Should we retroactively correct the 20 GPT-5 Mini sessions with incorrect costs?

**Option 1: Leave Historical Data (Recommended)**
```sql
-- NO-OP: Historical data remains as-is
-- Rationale:
--   - Preserves audit trail integrity
--   - Fix prevents future errors
--   - Historical overestimates are conservative (not misleading)
```

**Pros:**
- ✅ Preserves audit trail
- ✅ No migration risk
- ✅ Simple deployment

**Cons:**
- ❌ Analytics dashboards show inflated historical costs
- ❌ Total cost metrics will be incorrect

**Option 2: Retroactive Correction (Complex)**
```sql
-- Recalculate costs for GPT-5 Mini sessions
UPDATE shell_files sf
SET processing_cost_estimate = (
  SELECT
    ((pem.input_tokens / 1000000.0) * 0.25) +
    ((pem.output_tokens / 1000000.0) * 2.00)
  FROM pass1_entity_metrics pem
  JOIN ai_processing_sessions aps ON pem.processing_session_id = aps.id
  WHERE aps.shell_file_id = sf.id
  AND aps.ai_model_name = 'gpt-5-mini'
)
WHERE id IN (
  SELECT sf2.id
  FROM shell_files sf2
  JOIN ai_processing_sessions aps2 ON sf2.id = aps2.shell_file_id
  WHERE aps2.ai_model_name = 'gpt-5-mini'
);
```

**Pros:**
- ✅ Accurate historical analytics
- ✅ Correct total cost metrics

**Cons:**
- ❌ Modifies historical data (audit concern)
- ❌ Requires careful testing
- ❌ Potential for migration bugs

**Recommendation:** Use Option 1 (leave historical data). Fix prevents future errors, and conservative historical overestimates are not misleading.

---

## Deployment Plan

### Pre-Deployment Checklist

- [ ] Code review approved
- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] Documentation updated (docstrings, comments)
- [ ] Pricing table verified against OpenAI docs
- [ ] Historical data decision documented

### Deployment Steps

1. **Merge PR to main branch**
   - Code changes reviewed
   - Tests passing
   - No breaking changes

2. **Render.com auto-deploy**
   - Worker service redeploys automatically
   - No downtime (rolling deploy)
   - New sessions use corrected pricing

3. **Post-deployment validation**
   - Monitor next 5 processing sessions
   - Verify cost estimates match expected values
   - Check logs for "Unknown model" warnings

4. **Analytics review (24 hours post-deploy)**
   - Compare cost trends before/after
   - Verify GPT-5 Mini costs dropped to ~$0.029
   - Confirm GPT-4o costs unchanged

### Rollback Plan

If incorrect costs detected post-deployment:

```bash
# Revert to previous commit
git revert <commit-hash>
git push origin main

# Render.com auto-redeploys to previous version
# All future sessions use old (incorrect but conservative) pricing
```

---

## Future Enhancements

### 1. Cached Input Pricing Support

GPT-5 models support semantic caching with 90% cost reduction on cached inputs.

**Current:** No cache detection
**Future:** Detect `cached_tokens` from OpenAI usage response

```typescript
// Future enhancement
const cachedTokens = usage?.cached_tokens || 0;
const uncachedInputTokens = promptTokens - cachedTokens;
const cachedInputCost = (cachedTokens / 1_000_000) * (pricing.input_per_1m * 0.10); // 90% discount
const uncachedInputCost = (uncachedInputTokens / 1_000_000) * pricing.input_per_1m;
const totalInputCost = cachedInputCost + uncachedInputCost;
```

### 2. Dynamic Pricing Updates

**Current:** Hardcoded pricing table in code
**Future:** Fetch pricing from database or config service

Benefits:
- Update pricing without code deploy
- Support A/B testing with multiple models
- Track pricing changes over time

### 3. Cost Monitoring Alerts

**Future:** Alert if costs exceed thresholds

```typescript
if (totalCost > 0.50) {  // $0.50 per document threshold
  this.logger.warn('High processing cost detected', {
    cost_usd: totalCost,
    model: modelName,
    shell_file_id: input.shell_file_id,
  });
}
```

---

## References

### Production Evidence
- **Test-10 Validation:** `test-10-migration-22-23-database-schema-validation.md`
  - Documented 5.46× cost overestimate for GPT-5 Mini
  - Validated with production session data

### Code Locations
- **Primary:** `apps/render-worker/src/pass1/Pass1EntityDetector.ts:540-563`
- **Dependent:** `apps/render-worker/src/pass1/pass1-database-builder.ts:180`

### External Sources
- **OpenAI Pricing:** https://openai.com/api/pricing/
- **GPT-5 Mini:** $0.25/$2.00 per 1M tokens
- **GPT-4o:** $2.50/$10.00 per 1M tokens

---

## Approval Checklist

- [X] **Investigation complete** - All findings documented
- [X] **Fix reviewed** - Code changes appropriate
- [X] **Tests planned** - Verification strategy defined
- [X] **Migration decision** - Historical data approach chosen (Option 1 - leave historical)
- [X] **Deployment plan** - Steps and rollback documented
- [X] **User approval** - Ready to proceed with implementation

---

## Implementation Summary

**Status:** ✅ COMPLETED - Deployed to production on 2025-10-12

**Deployment Details:**
- **Commit:** 85f5cef
- **Branch:** main
- **Files Changed:**
  - `apps/render-worker/src/pass1/Pass1EntityDetector.ts` (lines 540-609)
  - `apps/render-worker/src/pass1/__tests__/Pass1EntityDetector-cost-calculation.test.ts` (new)
- **Deployment Method:** Git push to main → Render.com auto-deploy

**Verification Results:**
- [X] TypeScript typecheck: PASSED
- [X] Unit tests: 9/9 PASSED
  - GPT-5 Mini pricing: $0.029 ✓
  - GPT-4o pricing: $0.1575 ✓
  - Unknown model fallback with warning ✓
  - Edge cases (zero tokens, missing usage) ✓
  - Cost comparison: 5.46× reduction verified ✓

**Migration Decision:**
- Option 1 (Leave historical data) - CHOSEN
- Rationale: Pre-launch test data, preserves audit trail, no retroactive changes
- Impact: 20 historical sessions retain inflated costs, all future sessions use correct pricing

**Production Impact:**
- All future GPT-5 Mini sessions: $0.029 (vs $0.1575 before fix)
- All future GPT-4o sessions: $0.1575 (unchanged)
- Cost reduction: 5.46× more accurate for GPT-5 Mini

**Next Processing Session:**
- Will use model-specific pricing
- Expected cost for typical document: ~$0.029 (GPT-5 Mini)
- Monitor via pass1_entity_metrics table

---

**Implementation Time:** 1.5 hours (investigation + code + tests + deploy)
