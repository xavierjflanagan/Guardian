# 06 - Model Toggle System Implementation

**Date:** 2025-11-30
**Purpose:** Implement shared AI model toggle system for Pass 1 (and future passes)
**Status:** In Progress

## Overview

Replicate Pass 0.5's model toggle system for Pass 1, enabling runtime model switching via Render.com environment variables. Reuse code by moving to shared location.

## Architecture

### Current State (Pass 0.5 only)
```
apps/render-worker/src/pass05/
├── models/
│   ├── model-registry.ts    # Model definitions
│   └── model-selector.ts    # Toggle-based selection
├── providers/
│   ├── base-provider.ts     # Abstract base class
│   ├── openai-provider.ts   # OpenAI implementation
│   ├── google-provider.ts   # Google implementation
│   └── provider-factory.ts  # Factory pattern
```

### Target State (Shared)
```
apps/render-worker/src/shared/ai/
├── models/
│   ├── model-registry.ts    # All model definitions (Pass 0.5 + Pass 1)
│   └── model-selector.ts    # Pass-agnostic selection
├── providers/
│   ├── base-provider.ts
│   ├── openai-provider.ts
│   ├── google-provider.ts
│   └── provider-factory.ts
└── index.ts                 # Public exports
```

## Implementation Phases

### Phase 1: Create Shared Module
- [x] Create `src/shared/ai/` directory structure
- [x] Copy and adapt `model-registry.ts` with Pass 1 models
- [x] Adapt `model-selector.ts` to accept pass prefix parameter
- [x] Copy provider files (base, openai, google, factory)
- [x] Create index.ts with exports
- [x] Update Pass 0.5 to import from shared location
- [x] Verify build passes

### Phase 2: Integrate Pass 1
- [x] Refactor `Pass1Detector.ts` to use shared providers
- [x] Remove direct OpenAI client usage
- [x] Add Pass 1 env var handling
- [x] Update `Pass1Config` type (removed openai_api_key)
- [x] Update worker.ts to use new constructor
- [x] Verify build passes

### Phase 3: Deploy and Test
- [ ] Commit changes
- [ ] Add env vars to Render.com:
  - `PASS_1_USE_GPT5=true` (active - matching Pass 0.5)
  - `PASS_1_USE_GPT5_MINI=false`
  - `PASS_1_USE_GPT5_NANO=false`
  - `PASS_1_USE_GEMINI_2_5_PRO=false`
  - `PASS_1_USE_GEMINI_2_5_FLASH=false`
  - `PASS_1_USE_GEMINI_2_5_FLASH_LITE=false`
- [ ] Deploy and test with different models

## Model Registry - Pass 1 Models

Pass 1 now uses the same GPT-5 family as Pass 0.5 for consistency:

```typescript
// OpenAI GPT-5 Family (reasoning models)
{
  envVar: 'PASS_1_USE_GPT5',
  vendor: 'openai',
  modelId: 'gpt-5',
  displayName: 'GPT-5',
  contextWindow: 400_000,
  maxOutput: 128_000,
  inputCostPer1M: 1.25,
  outputCostPer1M: 10.00,
  temperatureSupported: false,  // Reasoning model
  maxTokensParam: 'max_completion_tokens'
},
{
  envVar: 'PASS_1_USE_GPT5_MINI',
  vendor: 'openai',
  modelId: 'gpt-5-mini',
  displayName: 'GPT-5-mini',
  contextWindow: 400_000,
  maxOutput: 128_000,
  inputCostPer1M: 0.25,
  outputCostPer1M: 2.00,
  temperatureSupported: false,
  maxTokensParam: 'max_completion_tokens'
},
{
  envVar: 'PASS_1_USE_GPT5_NANO',
  vendor: 'openai',
  modelId: 'gpt-5-nano',
  displayName: 'GPT-5-nano',
  contextWindow: 400_000,
  maxOutput: 128_000,
  inputCostPer1M: 0.05,
  outputCostPer1M: 0.40,
  temperatureSupported: false,
  maxTokensParam: 'max_completion_tokens'
},
// Google Gemini Family
{
  envVar: 'PASS_1_USE_GEMINI_2_5_PRO',
  vendor: 'google',
  modelId: 'gemini-2.5-pro',
  displayName: 'Gemini 2.5 Pro',
  contextWindow: 1_048_576,
  maxOutput: 65_536,
  inputCostPer1M: 1.25,
  outputCostPer1M: 10.00,
  temperatureSupported: true,
  maxTokensParam: 'maxOutputTokens'
},
{
  envVar: 'PASS_1_USE_GEMINI_2_5_FLASH',
  vendor: 'google',
  modelId: 'gemini-2.5-flash',
  displayName: 'Gemini 2.5 Flash',
  contextWindow: 1_048_576,
  maxOutput: 65_536,
  inputCostPer1M: 0.15,
  outputCostPer1M: 0.60,
  temperatureSupported: true,
  maxTokensParam: 'maxOutputTokens'
},
{
  envVar: 'PASS_1_USE_GEMINI_2_5_FLASH_LITE',
  vendor: 'google',
  modelId: 'gemini-2.5-flash-lite',
  displayName: 'Gemini 2.5 Flash-Lite',
  contextWindow: 1_048_576,
  maxOutput: 65_536,
  inputCostPer1M: 0.10,
  outputCostPer1M: 0.40,
  temperatureSupported: true,
  maxTokensParam: 'maxOutputTokens'
}
```

## Environment Variables

### Render.com Configuration

**Pass 0.5 (existing):**
- `PASS_05_USE_GPT5=false`
- `PASS_05_USE_GPT5_MINI=false`
- `PASS_05_USE_GPT5_NANO=false`
- `PASS_05_USE_GEMINI_2_5_PRO=false`
- `PASS_05_USE_GEMINI_2_5_FLASH=true` (current)
- `PASS_05_USE_GEMINI_2_5_FLASH_LITE=false`

**Pass 1 (new):**
- `PASS_1_USE_GPT5=true` (active - matching Pass 0.5 model family)
- `PASS_1_USE_GPT5_MINI=false`
- `PASS_1_USE_GPT5_NANO=false`
- `PASS_1_USE_GEMINI_2_5_PRO=false`
- `PASS_1_USE_GEMINI_2_5_FLASH=false`
- `PASS_1_USE_GEMINI_2_5_FLASH_LITE=false`

## Key Code Changes

### Pass1Detector.ts Changes

**Before:**
```typescript
import OpenAI from 'openai';

private openai: OpenAI;

constructor(...) {
  this.openai = new OpenAI({ apiKey: this.config.openai_api_key });
}

// In processBatch():
const response = await this.openai.chat.completions.create({...});
```

**After:**
```typescript
import { getSelectedModelForPass, AIProviderFactory, BaseAIProvider } from '../shared/ai';

private provider: BaseAIProvider;

constructor(...) {
  const model = getSelectedModelForPass('PASS_1');
  this.provider = AIProviderFactory.createProvider(model);
}

// In processBatch():
const response = await this.provider.generateJSON(prompt);
```

## Rollback Plan

If issues arise:
1. Revert to direct OpenAI client in Pass1Detector.ts
2. Remove shared/ai imports
3. Pass 0.5 can continue using its local copies

## Files to Create/Modify

### New Files
- `src/shared/ai/models/model-registry.ts`
- `src/shared/ai/models/model-selector.ts`
- `src/shared/ai/providers/base-provider.ts`
- `src/shared/ai/providers/openai-provider.ts`
- `src/shared/ai/providers/google-provider.ts`
- `src/shared/ai/providers/provider-factory.ts`
- `src/shared/ai/index.ts`

### Modified Files
- `src/pass05/models/model-registry.ts` -> re-export from shared
- `src/pass05/models/model-selector.ts` -> re-export from shared
- `src/pass05/providers/*.ts` -> re-export from shared
- `src/pass1-v2/Pass1Detector.ts` -> use shared providers
- `src/pass1-v2/pass1-v2-types.ts` -> update config type
