# Implementation Plan: AI Model Switching for Pass 0.5

**Status:** READY FOR IMPLEMENTATION
**Date:** November 9, 2025
**Estimated Time:** 6-8 hours development + 2 hours testing

---

## Overview

This document provides a step-by-step implementation guide for adding multi-vendor AI model support to Pass 0.5 encounter discovery. The implementation follows a toggle-based approach with fail-fast validation.

---

## Phase 1: Core Infrastructure (2-3 hours)

### Step 1.1: Create Model Registry

**File:** `apps/render-worker/src/pass05/models/model-registry.ts`

```typescript
export interface ModelDefinition {
  envVar: string;
  vendor: 'openai' | 'google';
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutput: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  temperatureSupported: boolean;
  maxTokensParam: string;  // 'max_tokens' or 'max_completion_tokens'
}

export const MODEL_REGISTRY: ModelDefinition[] = [
  // OpenAI Models
  {
    envVar: 'PASS_05_USE_GPT5',
    vendor: 'openai',
    modelId: 'gpt-5',
    displayName: 'GPT-5',
    contextWindow: 272_000,
    maxOutput: 128_000,
    inputCostPer1M: 0.25,
    outputCostPer1M: 2.00,
    temperatureSupported: true,  // API supports temperature, but current implementation uses default 1.0
    maxTokensParam: 'max_completion_tokens'
  },
  {
    envVar: 'PASS_05_USE_GPT5_MINI',
    vendor: 'openai',
    modelId: 'gpt-5-mini',
    displayName: 'GPT-5-mini',
    contextWindow: 128_000,
    maxOutput: 128_000,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    temperatureSupported: true,  // API supports temperature, but current implementation uses default 1.0
    maxTokensParam: 'max_completion_tokens'
  },

  // Google Gemini Models
  {
    envVar: 'PASS_05_USE_GEMINI_2_5_PRO',
    vendor: 'google',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    temperatureSupported: true,
    maxTokensParam: 'maxOutputTokens'
  },
  {
    envVar: 'PASS_05_USE_GEMINI_2_5_FLASH',
    vendor: 'google',
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    temperatureSupported: true,
    maxTokensParam: 'maxOutputTokens'
  }
];
```

### Step 1.2: Create Model Selector

**File:** `apps/render-worker/src/pass05/models/model-selector.ts`

```typescript
import { MODEL_REGISTRY, ModelDefinition } from './model-registry';

export class ModelSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelSelectionError';
  }
}

export function getSelectedModel(): ModelDefinition {
  const activeModels: ModelDefinition[] = [];

  // Check each model's environment variable
  for (const model of MODEL_REGISTRY) {
    const envValue = process.env[model.envVar];
    const isActive = ['true', 'TRUE', '1', 'yes', 'YES'].includes(envValue || 'false');

    if (isActive) {
      activeModels.push(model);
    }
  }

  // Validation: Exactly one model must be selected
  if (activeModels.length === 0) {
    const availableVars = MODEL_REGISTRY.map(m => `  ${m.envVar}=true  # ${m.displayName}`).join('\n');
    throw new ModelSelectionError(
      `CRITICAL: No AI model selected for Pass 0.5\n\n` +
      `Set exactly ONE of these in Render.com:\n${availableVars}`
    );
  }

  if (activeModels.length > 1) {
    const activeVars = activeModels.map(m => `  ${m.envVar}=true`).join('\n');
    throw new ModelSelectionError(
      `CRITICAL: Multiple AI models selected\n\n` +
      `Currently active:\n${activeVars}\n\n` +
      `Set all to false except the one you want to use.`
    );
  }

  // Validate API key is present
  const model = activeModels[0];
  const apiKeyVar = model.vendor === 'openai' ? 'OPENAI_API_KEY' : 'GOOGLE_AI_API_KEY';

  if (!process.env[apiKeyVar]) {
    throw new ModelSelectionError(
      `Missing API key for ${model.displayName}\n` +
      `Set ${apiKeyVar} in Render.com environment variables.`
    );
  }

  console.log(`[Pass 0.5] Selected model: ${model.displayName} (${model.vendor}/${model.modelId})`);
  console.log(`[Pass 0.5] Context window: ${model.contextWindow.toLocaleString()} tokens`);
  console.log(`[Pass 0.5] Cost: $${model.inputCostPer1M}/1M input, $${model.outputCostPer1M}/1M output`);

  return model;
}

// Validate on module load (fail-fast)
if (process.env.NODE_ENV === 'production') {
  try {
    getSelectedModel();
  } catch (error) {
    console.error(error.message);
    process.exit(1);  // Fail-fast in production
  }
}
```

---

## Phase 2: Provider Abstraction (2-3 hours)

### Step 2.1: Create Base Provider

**File:** `apps/render-worker/src/pass05/providers/base-provider.ts`

```typescript
import { ModelDefinition } from '../models/model-registry';

export interface AIResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export abstract class BaseAIProvider {
  protected model: ModelDefinition;

  constructor(model: ModelDefinition) {
    this.model = model;
  }

  abstract generateJSON(prompt: string): Promise<AIResponse>;

  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * this.model.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * this.model.outputCostPer1M;
    return inputCost + outputCost;
  }

  protected validateContextWindow(promptTokens: number): void {
    if (promptTokens > this.model.contextWindow) {
      throw new Error(
        `Prompt exceeds ${this.model.displayName} context window: ` +
        `${promptTokens.toLocaleString()} > ${this.model.contextWindow.toLocaleString()} tokens`
      );
    }
  }
}
```

### Step 2.2: Create OpenAI Provider

**File:** `apps/render-worker/src/pass05/providers/openai-provider.ts`

```typescript
import OpenAI from 'openai';
import { BaseAIProvider, AIResponse } from './base-provider';
import { ModelDefinition } from '../models/model-registry';

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateJSON(prompt: string): Promise<AIResponse> {
    // Estimate prompt tokens (rough approximation)
    const promptTokens = Math.ceil(prompt.length / 4);
    this.validateContextWindow(promptTokens);

    const requestParams: any = {
      model: this.model.modelId,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' }
    };

    // Model-specific parameters
    if (this.model.maxTokensParam === 'max_completion_tokens') {
      requestParams.max_completion_tokens = Math.min(32000, this.model.maxOutput);
    } else {
      requestParams.max_tokens = Math.min(32000, this.model.maxOutput);
    }

    if (this.model.temperatureSupported) {
      requestParams.temperature = 0.1;
    }

    const response = await this.client.chat.completions.create(requestParams);

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = this.calculateCost(inputTokens, outputTokens);

    return {
      content: response.choices[0].message.content || '{}',
      model: response.model,
      inputTokens,
      outputTokens,
      cost
    };
  }
}
```

### Step 2.3: Create Google Provider

**File:** `apps/render-worker/src/pass05/providers/google-provider.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAIProvider, AIResponse } from './base-provider';
import { ModelDefinition } from '../models/model-registry';

export class GoogleProvider extends BaseAIProvider {
  private client: GoogleGenerativeAI;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new GoogleGenerativeAI(
      process.env.GOOGLE_AI_API_KEY || ''
    );
  }

  async generateJSON(prompt: string): Promise<AIResponse> {
    // Estimate prompt tokens
    const promptTokens = Math.ceil(prompt.length / 4);
    this.validateContextWindow(promptTokens);

    const genModel = this.client.getGenerativeModel({
      model: this.model.modelId,
      generationConfig: {
        temperature: this.model.temperatureSupported ? 0.1 : 1.0,
        maxOutputTokens: this.model.maxOutput,  // Use full model capability (65K for Gemini)
        responseMimeType: 'application/json'
      }
    });

    const result = await genModel.generateContent(prompt);
    const response = result.response;

    // Extract token counts from metadata
    const metadata = response.usageMetadata;
    const inputTokens = metadata?.promptTokenCount || promptTokens;
    const outputTokens = metadata?.candidatesTokenCount || 0;
    const cost = this.calculateCost(inputTokens, outputTokens);

    return {
      content: response.text(),
      model: this.model.modelId,
      inputTokens,
      outputTokens,
      cost
    };
  }
}
```

### Step 2.4: Create Provider Factory

**File:** `apps/render-worker/src/pass05/providers/provider-factory.ts`

```typescript
import { ModelDefinition } from '../models/model-registry';
import { BaseAIProvider } from './base-provider';
import { OpenAIProvider } from './openai-provider';
import { GoogleProvider } from './google-provider';

export class AIProviderFactory {
  static createProvider(model: ModelDefinition): BaseAIProvider {
    switch (model.vendor) {
      case 'openai':
        return new OpenAIProvider(model);
      case 'google':
        return new GoogleProvider(model);
      default:
        throw new Error(`Unsupported vendor: ${model.vendor}`);
    }
  }
}
```

---

## Phase 3: Update Encounter Discovery (1-2 hours)

### Step 3.1: Modify encounterDiscovery.ts

**Location:** `apps/render-worker/src/pass05/encounterDiscovery.ts`

**Changes Required:**

1. **Remove hardcoded model and imports:**
```typescript
// REMOVE:
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = 'gpt-5';

// ADD:
import { getSelectedModel } from './models/model-selector';
import { AIProviderFactory } from './providers/provider-factory';
```

2. **Update main function:**
```typescript
export async function performEncounterDiscovery(
  ocrText: string,
  documentMetadata: DocumentMetadata
): Promise<EncounterDiscoveryResult> {
  const startTime = Date.now();

  // Get selected model and create provider
  const model = getSelectedModel();
  const provider = AIProviderFactory.createProvider(model);

  // Build prompt
  const prompt = buildEncounterDiscoveryPromptV29(ocrText, documentMetadata);

  // Validate context window
  const promptTokens = Math.ceil(prompt.length / 4);
  if (promptTokens > model.contextWindow) {
    throw new Error(
      `Document too large for ${model.displayName}: ` +
      `~${promptTokens.toLocaleString()} tokens > ${model.contextWindow.toLocaleString()} limit`
    );
  }

  try {
    // Generate response using provider abstraction
    const response = await provider.generateJSON(prompt);

    // Parse and validate response
    const result = JSON.parse(response.content);

    // ... existing validation logic ...

    return {
      encounters: result.encounters,
      pageAssignments: result.pageAssignments,
      processingTime: Date.now() - startTime,
      aiModel: response.model,
      aiCostUsd: response.cost,
      tokenUsage: {
        input: response.inputTokens,
        output: response.outputTokens,
        total: response.inputTokens + response.outputTokens
      }
    };
  } catch (error) {
    console.error(`[Pass 0.5] ${model.displayName} error:`, error);
    throw error;
  }
}
```

3. **Remove old calculateCost function** (now in BaseAIProvider)

---

## Phase 4: Add Google AI SDK (30 minutes)

### Step 4.1: Update package.json

**File:** `apps/render-worker/package.json`

Add Google Generative AI dependency:
```json
{
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    // ... existing dependencies
  }
}
```

### Step 4.2: Update Environment Variables

**File:** `.env.example`

Add new environment variables:
```bash
# AI Model Selection (set exactly ONE to true)
PASS_05_USE_GPT5=false
PASS_05_USE_GPT5_MINI=false
PASS_05_USE_GEMINI_2_5_PRO=false
PASS_05_USE_GEMINI_2_5_FLASH=true

# API Keys
OPENAI_API_KEY=sk-xxxxx
GOOGLE_AI_API_KEY=AIzaxxxxx
```

---

## Phase 5: Testing (2 hours)

### Step 5.1: Unit Tests

**File:** `apps/render-worker/src/pass05/models/__tests__/model-selector.test.ts`

```typescript
describe('Model Selector', () => {
  it('should select single active model', () => {
    process.env.PASS_05_USE_GEMINI_2_5_FLASH = 'true';
    const model = getSelectedModel();
    expect(model.modelId).toBe('gemini-2.5-flash');
  });

  it('should fail when no model selected', () => {
    // All models false
    expect(() => getSelectedModel()).toThrow('No AI model selected');
  });

  it('should fail when multiple models selected', () => {
    process.env.PASS_05_USE_GPT5 = 'true';
    process.env.PASS_05_USE_GEMINI_2_5_FLASH = 'true';
    expect(() => getSelectedModel()).toThrow('Multiple AI models selected');
  });
});
```

### Step 5.2: Integration Testing

**Test Documents:**
1. 142-page baseline document (should work with all models)
2. 220-page failed document (should work with Gemini models)
3. Small 10-page document (verify no regressions)

**Test Matrix:**

| Model | 142-page | 220-page | Cost Tracking | Database Write |
|-------|----------|----------|---------------|----------------|
| GPT-5 | ✅ Pass | ❌ Fail (context) | ✅ Verify | ✅ Verify |
| GPT-5-mini | ✅ Pass | ❌ Fail (context) | ✅ Verify | ✅ Verify |
| Gemini 2.5 Pro | ✅ Pass | ✅ Pass | ✅ Verify | ✅ Verify |
| Gemini 2.5 Flash | ✅ Pass | ✅ Pass | ✅ Verify | ✅ Verify |

### Step 5.3: Validation Queries

```sql
-- Verify model names are stored correctly
SELECT DISTINCT ai_model_name, COUNT(*)
FROM ai_processing_sessions
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY ai_model_name;

-- Compare costs across models
SELECT
  ai_model_name,
  AVG(ai_cost_usd) as avg_cost,
  MIN(ai_cost_usd) as min_cost,
  MAX(ai_cost_usd) as max_cost
FROM ai_processing_sessions
GROUP BY ai_model_name;
```

---

## Phase 6: Deployment (30 minutes)

### Step 6.1: Render.com Configuration

1. **Navigate to Render.com Dashboard**
2. **Select "Exora Health" service**
3. **Go to Environment section**
4. **Add environment variables:**

```bash
# Start with Gemini 2.5 Flash (recommended)
PASS_05_USE_GPT5=false
PASS_05_USE_GPT5_MINI=false
PASS_05_USE_GEMINI_2_5_PRO=false
PASS_05_USE_GEMINI_2_5_FLASH=true

# Add Google AI API key
GOOGLE_AI_API_KEY=your-api-key-here
```

5. **Save and Deploy**

### Step 6.2: Monitor Deployment

```bash
# Watch logs for validation
render logs --service exora-health --tail

# Expected output:
# [Pass 0.5] Selected model: Gemini 2.5 Flash (google/gemini-2.5-flash)
# [Pass 0.5] Context window: 1,048,576 tokens
# [Pass 0.5] Cost: $0.075/1M input, $0.30/1M output
```

### Step 6.3: Rollback Plan

If issues occur:

1. **Quick Rollback to GPT-5:**
```bash
PASS_05_USE_GPT5=true
PASS_05_USE_GPT5_MINI=false
PASS_05_USE_GEMINI_2_5_PRO=false
PASS_05_USE_GEMINI_2_5_FLASH=false
```

2. **Monitor error rates:**
```sql
SELECT
  ai_model_name,
  COUNT(*) FILTER (WHERE status = 'failed') as failures,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / COUNT(*), 2) as failure_rate
FROM ai_processing_sessions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY ai_model_name;
```

---

## Migration Checklist

### Pre-Implementation
- [ ] Review this plan with team
- [ ] Obtain Google AI API key
- [ ] Backup current production code
- [ ] Create test documents

### Implementation
- [ ] Create model registry
- [ ] Create model selector with validation
- [ ] Create base provider class
- [ ] Create OpenAI provider
- [ ] Create Google provider
- [ ] Create provider factory
- [ ] Update encounterDiscovery.ts
- [ ] Add Google AI SDK dependency
- [ ] Write unit tests
- [ ] Write integration tests

### Testing
- [ ] Test with GPT-5 (current model)
- [ ] Test with GPT-5-mini
- [ ] Test with Gemini 2.5 Pro
- [ ] Test with Gemini 2.5 Flash
- [ ] Verify 220-page document works with Gemini
- [ ] Verify cost tracking accuracy
- [ ] Verify database writes

### Deployment
- [ ] Update Render.com environment variables
- [ ] Deploy to production
- [ ] Monitor logs for 30 minutes
- [ ] Verify metrics in database
- [ ] Document any issues

### Post-Deployment
- [ ] Update team on new capability
- [ ] Monitor costs for 24 hours
- [ ] Compare model performance
- [ ] Plan A/B testing schedule

---

## Success Criteria

1. **Functional Requirements:**
   - Worker starts only with exactly one model selected
   - API key validation prevents startup without credentials
   - All 4 models can be selected and used
   - 220-page documents process successfully with Gemini models

2. **Performance Requirements:**
   - No regression in processing time for 142-page documents
   - Gemini models handle 220+ page documents without failure
   - Cost tracking matches expected pricing

3. **Operational Requirements:**
   - Clear error messages on misconfiguration
   - Easy rollback to previous model
   - Metrics properly tracked in all tables
   - No breaking changes to existing data

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google API failures | High | Keep OpenAI as fallback option |
| Cost increase | Medium | Monitor costs hourly, set alerts |
| Quality degradation | High | Test output quality before full rollout |
| Configuration errors | Low | Fail-fast validation prevents bad deploys |
| Context window exceeded | Medium | Clear error messages, document limits |

---

## Timeline

**Day 1 (6 hours):**
- Morning: Implement core infrastructure (3 hours)
- Afternoon: Create provider abstraction (3 hours)

**Day 2 (4 hours):**
- Morning: Update encounter discovery (2 hours)
- Afternoon: Testing with all models (2 hours)

**Day 3 (1 hour):**
- Deploy to production (30 minutes)
- Monitor and validate (30 minutes)

**Total: ~11 hours** (including buffer time)

---

## Next Steps

1. Get approval for this implementation plan
2. Obtain Google AI API key from Google AI Studio
3. Start Phase 1 implementation
4. Coordinate deployment window with team

---

## Future Enhancements

### Environment-Based Pricing (Optional)

The current implementation stores model pricing in the registry (`inputCostPer1M`, `outputCostPer1M`). This approach:
- Provides a single source of truth for cost calculation
- Simplifies deployment (fewer environment variables)
- Triggers code review when pricing changes

**If pricing becomes critical to track dynamically**, consider adding optional environment variable overrides:

```typescript
// In model-registry.ts
inputCostPer1M: parseFloat(process.env.GPT5_INPUT_COST_PER_1M || '0.25'),
outputCostPer1M: parseFloat(process.env.GPT5_OUTPUT_COST_PER_1M || '2.00'),
```

**When to implement:**
- Provider changes pricing more than quarterly
- Need to track costs without code deployments
- Multiple regions with different pricing tiers
- A/B testing different pricing assumptions

**For now:** Registry-based pricing is simpler and sufficient for initial implementation.

---

**Questions?** Review the architecture documentation in this folder or contact the development team.