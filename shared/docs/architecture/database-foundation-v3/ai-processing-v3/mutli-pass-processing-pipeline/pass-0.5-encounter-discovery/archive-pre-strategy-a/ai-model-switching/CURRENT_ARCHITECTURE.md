# Current Architecture: OpenAI-Only Implementation

**Status:** PRODUCTION
**Last Updated:** November 9, 2025

---

## Overview

Pass 0.5 currently uses a hardcoded OpenAI GPT-5 model for encounter discovery. This document describes the existing implementation before the multi-vendor abstraction layer.

---

## Current Implementation

### Model Selection

**Location:** `apps/render-worker/src/pass05/encounterDiscovery.ts`

```typescript
// Line 84: Hardcoded model selection
const model = 'gpt-5';
const isGPT5 = model.startsWith('gpt-5');
```

**Issues:**
- Model is hardcoded as string literal
- No ability to switch models without code changes
- No vendor abstraction

### API Integration

**Location:** `apps/render-worker/src/pass05/encounterDiscovery.ts:15-23`

```typescript
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

**Issues:**
- Direct dependency on OpenAI SDK
- No abstraction layer for other vendors
- Tightly coupled to OpenAI API structure

### Cost Calculation

**Location:** `apps/render-worker/src/pass05/encounterDiscovery.ts:159-167`

```typescript
function calculateCost(inputTokens: number, outputTokens: number): number {
  // GPT-5-mini pricing (as of Oct 2025)
  const INPUT_PRICE_PER_1M = 0.25;  // $0.25 per 1M tokens (verified)
  const OUTPUT_PRICE_PER_1M = 2.00;  // $2.00 per 1M tokens (verified)

  const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_1M;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_1M;

  return inputCost + outputCost;
}
```

**Issues:**
- Prices hardcoded in function
- Only supports single model pricing
- Misleading comment (says GPT-5-mini but used for GPT-5)
- No way to update prices without code changes

### Parameter Handling

**Location:** `apps/render-worker/src/pass05/encounterDiscovery.ts:103-111`

```typescript
// Model-specific parameters (same pattern as Pass 1)
if (isGPT5) {
  // GPT-5: Uses max_completion_tokens, temperature fixed at 1.0
  requestParams.max_completion_tokens = 32000;
} else {
  // GPT-4o and earlier: Uses max_tokens and custom temperature
  requestParams.max_tokens = 32000;
  requestParams.temperature = 0.1;
}
```

**Issues:**
- GPT-specific parameter names
- No abstraction for vendor differences
- Hardcoded token limits

---

## Data Flow

### Current Flow

1. **Input:** OCR text from document
2. **Processing:**
   - Build prompt with `buildEncounterDiscoveryPromptV29()`
   - Call OpenAI API directly
   - Parse JSON response
3. **Output:**
   - Encounters array
   - Page assignments
   - Cost calculation
   - Model name (from OpenAI response)

### Cost Tracking Locations

The calculated cost flows to multiple database tables:

1. **Return from encounterDiscovery():**
   ```typescript
   return {
     aiCostUsd: cost,  // Line 141
     aiModel: response.model,  // Line 140
   }
   ```

2. **Pass to index.ts:**
   ```typescript
   // Line 96
   aiCostUsd: encounterResult.aiCostUsd
   ```

3. **Write to database:**
   - `shell_file_manifests.ai_cost_usd`
   - `ai_processing_sessions.ai_cost_usd`
   - `pass05_encounter_metrics.total_ai_cost`

---

## Environment Variables

### Current Variables

```bash
OPENAI_API_KEY=sk-xxxxx  # Required for OpenAI

# Model selection (used for prompt version, not model switching)
PASS_05_VERSION=v2.9      # Prompt version selection
PASS_05_STRATEGY=ocr      # OCR vs Vision strategy (vision not implemented)
```

**No model selection variables exist currently.**

---

## Limitations

### 1. Context Window

**GPT-5 Limits:**
- Input: 272,000 tokens (400K total context)
- Output: 128,000 tokens

**Impact:** 220-page documents approach or exceed this limit

### 2. Cost

**Current Pricing (GPT-5):**
- Estimated $0.25-0.50 per 142-page document
- No visibility into comparative costs

### 3. Vendor Lock-in

**Issues:**
- No way to test other models
- Can't leverage cheaper alternatives
- No failover options

### 4. Configuration

**Problems:**
- Requires code deployment to change models
- No A/B testing capability
- No gradual rollout path

---

## Database Schema

### Tables Storing Model Information

1. **ai_processing_sessions**
   ```sql
   ai_model_name TEXT  -- Currently stores 'gpt-5'
   ai_cost_usd NUMERIC(10,4)
   ```

2. **shell_file_manifests**
   ```sql
   ai_model_used TEXT  -- Currently stores 'gpt-5'
   ai_cost_usd NUMERIC(10,4)
   ```

3. **pass05_encounter_metrics**
   ```sql
   ai_model TEXT  -- Currently stores 'gpt-5'
   total_ai_cost NUMERIC(10,4)
   ```

**All tables expect model name as string, making migration straightforward.**

---

## Migration Requirements

To enable model switching, we need:

1. **Abstraction Layer**
   - Provider interface
   - Vendor-specific implementations
   - Factory pattern for provider creation

2. **Configuration**
   - Environment variables for model selection
   - Validation on startup
   - Clear error messages

3. **Cost Management**
   - Model registry with pricing
   - Dynamic cost calculation
   - Per-model tracking

4. **Backward Compatibility**
   - Keep existing database schema
   - Maintain same output format
   - No breaking changes

---

## Files to Modify

### Core Changes Required

1. **encounterDiscovery.ts**
   - Remove hardcoded model
   - Use provider abstraction
   - Dynamic cost calculation

2. **New Files Needed**
   - `models/model-registry.ts`
   - `models/model-selector.ts`
   - `providers/base-provider.ts`
   - `providers/openai-provider.ts`
   - `providers/google-provider.ts`
   - `providers/provider-factory.ts`

3. **Configuration**
   - Add model toggle environment variables
   - Add startup validation script

---

## Testing Considerations

### Current Test Coverage

- No unit tests for cost calculation
- No integration tests for model switching
- Manual testing only

### Required Tests

1. Model selection validation
2. Cost calculation accuracy
3. Provider abstraction correctness
4. Fallback behavior
5. API key validation

---

## Summary

The current architecture works but is inflexible. Key issues:

1. **Hardcoded model** - Can't switch without deployment
2. **No abstraction** - Tightly coupled to OpenAI
3. **Fixed pricing** - Can't update costs dynamically
4. **No validation** - No safety checks on configuration

The new architecture will address all these limitations while maintaining backward compatibility.