# Multi-Vendor Architecture Design

**Status:** APPROVED FOR IMPLEMENTATION
**Date:** November 9, 2025

---

## Overview

This document describes the new abstraction layer that enables Pass 0.5 to work with multiple AI vendors (OpenAI, Google, Anthropic, etc.) using a toggle-based selection system.

---

## Architecture Principles

### 1. Toggle-Based Selection
- Boolean environment variables (true/false)
- Zero typo risk
- Visual clarity in Render.com dashboard

### 2. Fail-Fast Validation
- Validate on worker startup
- Clear error messages
- Prevent invalid configurations

### 3. Vendor Abstraction
- Common interface for all providers
- Vendor-specific implementations
- Easy to add new vendors

### 4. Automatic Cost Tracking
- Model-specific pricing
- Unified calculation logic
- Database propagation

---

## Component Architecture

```
ai-model-switching/
├── models/
│   ├── model-registry.ts      # Model definitions & metadata
│   └── model-selector.ts      # Environment variable reader & validator
├── providers/
│   ├── base-provider.ts       # Abstract base class
│   ├── openai-provider.ts     # OpenAI implementation
│   ├── google-provider.ts     # Google Gemini implementation
│   └── provider-factory.ts    # Provider creation logic
└── validation/
    └── startup-validator.ts   # Deployment validation
```

---

## Model Registry

### Purpose
Single source of truth for all model specifications

### Implementation

```typescript
// models/model-registry.ts

export interface ModelDefinition {
  // Identity
  envVar: string;                    // e.g., 'PASS_05_USE_GEMINI_2_5_FLASH'
  vendor: 'openai' | 'google' | 'anthropic';
  modelId: string;                   // e.g., 'gemini-2.5-flash'
  displayName: string;               // e.g., 'Gemini 2.5 Flash'

  // Capabilities
  contextWindow: number;             // Input token limit
  maxOutput: number;                 // Output token limit
  supportsJSON: boolean;             // Native JSON response format
  supportsVision: boolean;           // Image input capability

  // Cost (per million tokens)
  inputCostPer1M: number;
  outputCostPer1M: number;

  // Performance
  averageLatencyMs: number;         // Typical response time
  recommendedFor: string[];         // Use case recommendations
}

export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    envVar: 'PASS_05_USE_GPT5',
    vendor: 'openai',
    modelId: 'gpt-5',
    displayName: 'GPT-5',
    contextWindow: 272_000,  // 400K total, 272K input
    maxOutput: 128_000,
    supportsJSON: true,
    supportsVision: true,
    inputCostPer1M: 0.25,
    outputCostPer1M: 2.00,
    averageLatencyMs: 1500,
    recommendedFor: ['complex_reasoning', 'medical_accuracy']
  },
  {
    envVar: 'PASS_05_USE_GPT5_MINI',
    vendor: 'openai',
    modelId: 'gpt-5-mini',
    displayName: 'GPT-5-mini',
    contextWindow: 128_000,
    maxOutput: 128_000,
    supportsJSON: true,
    supportsVision: false,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    averageLatencyMs: 1200,
    recommendedFor: ['cost_optimization', 'simple_documents']
  },
  {
    envVar: 'PASS_05_USE_GEMINI_2_5_PRO',
    vendor: 'google',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    contextWindow: 1_048_576,  // 1M+ tokens
    maxOutput: 65_536,
    supportsJSON: true,
    supportsVision: true,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    averageLatencyMs: 1800,
    recommendedFor: ['complex_problems', 'large_documents', 'reasoning']
  },
  {
    envVar: 'PASS_05_USE_GEMINI_2_5_FLASH',
    vendor: 'google',
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    contextWindow: 1_048_576,  // 1M+ tokens
    maxOutput: 65_536,
    supportsJSON: true,
    supportsVision: true,
    inputCostPer1M: 0.075,  // 70% cheaper than GPT-5
    outputCostPer1M: 0.30,
    averageLatencyMs: 1200,
    recommendedFor: ['large_documents', 'cost_optimization', '220_page_docs']
  }
];
```

---

## Model Selector

### Purpose
Read environment variables and validate configuration

### Implementation

```typescript
// models/model-selector.ts

export class ModelSelector {
  /**
   * Gets the currently active model based on environment toggles
   * Throws clear errors if configuration is invalid
   */
  static getActiveModel(): ModelDefinition {
    const activeModels: ModelDefinition[] = [];

    // Check each model's toggle
    for (const model of MODEL_REGISTRY) {
      const envValue = process.env[model.envVar];

      // Handle various boolean representations
      const isActive = ['true', 'TRUE', '1', 'yes', 'YES'].includes(envValue || 'false');

      if (isActive) {
        activeModels.push(model);
      }
    }

    // Validation: Exactly one model must be active
    if (activeModels.length === 0) {
      this.throwNoModelError();
    }

    if (activeModels.length > 1) {
      this.throwMultipleModelsError(activeModels);
    }

    const selectedModel = activeModels[0];

    // Validate required API keys
    this.validateApiKeys(selectedModel);

    console.log(`✅ Active model: ${selectedModel.displayName} (${selectedModel.modelId})`);
    return selectedModel;
  }

  private static validateApiKeys(model: ModelDefinition): void {
    const requiredKeys: Record<string, string> = {
      'openai': 'OPENAI_API_KEY',
      'google': 'GOOGLE_AI_API_KEY',
      'anthropic': 'ANTHROPIC_API_KEY'
    };

    const requiredKey = requiredKeys[model.vendor];
    if (!process.env[requiredKey]) {
      throw new Error(
        `❌ Missing API key for ${model.displayName}\n` +
        `Set ${requiredKey} in Render.com environment variables.`
      );
    }
  }
}
```

---

## Provider Abstraction

### Base Provider Class

```typescript
// providers/base-provider.ts

export interface AIResponse {
  content: string;      // JSON response
  usage: TokenUsage;    // Token counts
  model: string;        // Full model identifier
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export abstract class BaseAIProvider {
  constructor(protected model: ModelDefinition) {}

  /**
   * Generate JSON response from prompt
   */
  abstract generateJSON(params: {
    prompt: string;
    systemMessage?: string;
    maxTokens?: number;
  }): Promise<AIResponse>;

  /**
   * Calculate cost based on token usage
   */
  calculateCost(usage: TokenUsage): number {
    return (
      (usage.inputTokens / 1_000_000) * this.model.inputCostPer1M +
      (usage.outputTokens / 1_000_000) * this.model.outputCostPer1M
    );
  }

  /**
   * Get full model name for tracking
   */
  getModelName(): string {
    return this.model.modelId;  // Just model name, not vendor/model
  }
}
```

### OpenAI Provider

```typescript
// providers/openai-provider.ts

import OpenAI from 'openai';

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generateJSON(params): Promise<AIResponse> {
    const isGPT5 = this.model.modelId.startsWith('gpt-5');

    const requestParams: any = {
      model: this.model.modelId,
      messages: [
        { role: 'system', content: params.systemMessage || '' },
        { role: 'user', content: params.prompt }
      ],
      response_format: { type: 'json_object' }
    };

    // Handle GPT-5 vs GPT-4 parameter differences
    if (isGPT5) {
      requestParams.max_completion_tokens = params.maxTokens || 32000;
    } else {
      requestParams.max_tokens = params.maxTokens || 32000;
      requestParams.temperature = 0.1;
    }

    const response = await this.client.chat.completions.create(requestParams);

    return {
      content: response.choices[0].message.content || '',
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      model: this.getModelName()
    };
  }
}
```

### Google Provider

```typescript
// providers/google-provider.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

export class GoogleProvider extends BaseAIProvider {
  private client: GoogleGenerativeAI;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
  }

  async generateJSON(params): Promise<AIResponse> {
    const genModel = this.client.getGenerativeModel({
      model: this.model.modelId,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: params.maxTokens || 32000,
        temperature: 0.1  // Match OpenAI for consistency
      }
    });

    // Gemini doesn't have separate system message
    const fullPrompt = params.systemMessage
      ? `${params.systemMessage}\n\n${params.prompt}`
      : params.prompt;

    const result = await genModel.generateContent(fullPrompt);
    const response = await result.response;

    return {
      content: response.text(),
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0
      },
      model: this.getModelName()
    };
  }
}
```

### Provider Factory

```typescript
// providers/provider-factory.ts

export class AIProviderFactory {
  /**
   * Create appropriate provider for selected model
   */
  static create(model: ModelDefinition): BaseAIProvider {
    switch (model.vendor) {
      case 'openai':
        return new OpenAIProvider(model);
      case 'google':
        return new GoogleProvider(model);
      case 'anthropic':
        // Future implementation
        throw new Error('Anthropic provider not yet implemented');
      default:
        throw new Error(`Unsupported vendor: ${model.vendor}`);
    }
  }
}
```

---

## Integration with Pass 0.5

### Updated encounterDiscovery.ts

```typescript
import { ModelSelector } from '../models/model-selector';
import { AIProviderFactory } from '../providers/provider-factory';

export async function discoverEncounters(
  input: EncounterDiscoveryInput
): Promise<EncounterDiscoveryOutput> {

  try {
    // Get active model from environment toggles
    const activeModel = ModelSelector.getActiveModel(); // Throws if invalid

    // Check if document fits in context window
    const estimatedTokens = input.pageCount * 800; // ~800 tokens per page
    if (estimatedTokens > activeModel.contextWindow) {
      console.warn(
        `⚠️ Document may exceed ${activeModel.displayName} context window\n` +
        `Estimated: ${estimatedTokens} tokens, Limit: ${activeModel.contextWindow}\n` +
        `Consider chunked processing or larger model.`
      );
    }

    // Create provider for selected model
    const provider = AIProviderFactory.create(activeModel);

    // Build prompt (unchanged)
    const prompt = buildEncounterDiscoveryPromptV29({
      fullText: input.ocrOutput.fullTextAnnotation.text,
      pageCount: input.pageCount,
      ocrPages: input.ocrOutput.fullTextAnnotation.pages
    });

    // Generate response
    const aiResponse = await provider.generateJSON({
      prompt,
      systemMessage: 'You are a medical document analyzer specializing in healthcare encounter extraction.',
      maxTokens: Math.min(32000, activeModel.maxOutput)
    });

    // Parse response (unchanged)
    const parsed = await parseEncounterResponse(
      aiResponse.content,
      input.ocrOutput,
      input.patientId,
      input.shellFileId,
      input.pageCount
    );

    // Calculate cost
    const aiCostUsd = provider.calculateCost(aiResponse.usage);

    return {
      success: true,
      encounters: parsed.encounters,
      page_assignments: parsed.page_assignments,
      aiModel: aiResponse.model,  // Just model name, not vendor/model
      aiCostUsd,
      inputTokens: aiResponse.usage.inputTokens,
      outputTokens: aiResponse.usage.outputTokens
    };

  } catch (error) {
    console.error('[Pass 0.5] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      aiModel: 'unknown',
      aiCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0
    };
  }
}
```

---

## Startup Validation

### Implementation

```typescript
// validation/startup-validator.ts

import { ModelSelector } from '../models/model-selector';
import { MODEL_REGISTRY } from '../models/model-registry';

export function validateModelConfiguration(): void {
  console.log('🔍 Validating AI model configuration...\n');

  // Show all available models
  console.log('Available models:');
  for (const model of MODEL_REGISTRY) {
    const envValue = process.env[model.envVar] || 'false';
    const status = envValue === 'true' ? '✅ ACTIVE' : '⬜ inactive';
    console.log(`  ${status} ${model.envVar} = ${envValue}`);
    console.log(`       ${model.displayName} (${model.contextWindow.toLocaleString()} tokens)`);
  }
  console.log('');

  try {
    // This will throw if configuration is invalid
    const activeModel = ModelSelector.getActiveModel();

    console.log('✅ Configuration valid!');
    console.log(`📊 Active model: ${activeModel.displayName}`);
    console.log(`   Context: ${activeModel.contextWindow.toLocaleString()} tokens`);
    console.log(`   Cost: $${activeModel.inputCostPer1M}/M input, $${activeModel.outputCostPer1M}/M output`);

  } catch (error) {
    console.error('❌ CONFIGURATION ERROR:');
    console.error(error.message);
    console.error('\nWorker will NOT start until this is fixed.');
    process.exit(1);  // Fail-fast
  }
}
```

### Worker Integration

```typescript
// apps/render-worker/src/worker.ts

import { validateModelConfiguration } from './pass05/validation/startup-validator';

// Run validation on worker startup
validateModelConfiguration();
```

---

## Environment Variables

### Complete List

```bash
# OpenAI Models
PASS_05_USE_GPT5=false         # GPT-5 (400K context)
PASS_05_USE_GPT5_MINI=false    # GPT-5-mini (128K context)

# Google Gemini Models
PASS_05_USE_GEMINI_2_5_PRO=false     # Gemini 2.5 Pro (1M context)
PASS_05_USE_GEMINI_2_5_FLASH=true    # Gemini 2.5 Flash (1M context)

# API Keys (required based on selected model)
OPENAI_API_KEY=sk-xxxxx
GOOGLE_AI_API_KEY=xxxxx
```

---

## Database Integration

### Model Name Storage

All existing database tables will automatically receive the new model names:

```sql
-- ai_processing_sessions
ai_model_name: 'gemini-2.5-flash'  -- Previously 'gpt-5'

-- shell_file_manifests
ai_model_used: 'gemini-2.5-flash'  -- Previously 'gpt-5'

-- pass05_encounter_metrics
ai_model: 'gemini-2.5-flash'  -- Previously 'gpt-5'
```

### Cost Tracking

Costs are automatically calculated per model:

```sql
-- Example: Compare model costs
SELECT
  ai_model_name,
  COUNT(*) as jobs,
  AVG(ai_cost_usd) as avg_cost,
  MIN(ai_cost_usd) as min_cost,
  MAX(ai_cost_usd) as max_cost
FROM ai_processing_sessions
WHERE workflow_step = 'pass_0_5'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY ai_model_name
ORDER BY avg_cost;
```

---

## Benefits

### 1. Safety
- No typo risk with boolean toggles
- Fail-fast validation prevents bad deployments
- Clear error messages guide fixes

### 2. Flexibility
- Switch models without code changes
- A/B testing capability
- Gradual rollout possible

### 3. Cost Optimization
- Automatic cost tracking per model
- Easy comparison queries
- Budget-aware model selection

### 4. Future-Proofing
- Easy to add new vendors
- Minimal code changes required
- Consistent abstraction layer

---

## Migration Path

### Phase 1: Deploy (No Behavior Change)
1. Deploy new architecture
2. Set `PASS_05_USE_GPT5=true`
3. Verify startup validation works
4. Process test document

### Phase 2: Test Gemini
1. Set `PASS_05_USE_GEMINI_2_5_FLASH=true`
2. Process 142-page baseline
3. Process 220-page document
4. Compare results

### Phase 3: Production
1. Switch production to Gemini
2. Monitor for 24 hours
3. Compare costs and accuracy

---

## Summary

This architecture provides:
- ✅ Safe model switching via toggles
- ✅ Multi-vendor support
- ✅ Automatic cost tracking
- ✅ Fail-fast validation
- ✅ Easy vendor addition
- ✅ Backward compatibility

Ready for implementation with ~6-8 hours of development time.