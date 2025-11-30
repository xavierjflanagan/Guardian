# 06 - AI Model Switching System

**Date Created:** 2025-11-30
**Status:** Operational
**Replaces:** `06-MODEL-TOGGLE-SYSTEM-IMPLEMENTATION.md`, `06-MODEL-TOGGLE-FAILURE-ANALYSIS.md`

---

## Overview

Centralized AI model switching system that controls which AI models are used across all processing passes (Pass 0.5, Pass 1, and future Pass 2). The system provides:

1. Runtime model switching via environment variables (no code changes required)
2. Centralized model definitions with parameters and pricing
3. Shared provider implementations (OpenAI, Google) to reduce code duplication
4. Easy addition of new models or passes
5. Cost tracking per API call

---

## File Structure

### Shared AI Module (Source of Truth)

```
apps/render-worker/src/shared/ai/
├── index.ts                         # Public exports
├── models/
│   ├── model-registry.ts            # All model definitions
│   └── model-selector.ts            # Environment-based selection
└── providers/
    ├── base-provider.ts             # Abstract base class
    ├── openai-provider.ts           # OpenAI implementation
    ├── google-provider.ts           # Google Gemini implementation
    └── provider-factory.ts          # Factory pattern
```

### Pass 0.5 Integration

```
apps/render-worker/src/pass05/progressive/
└── chunk-processor.ts               # Imports directly from shared/ai
```

### Pass 1 Integration

```
apps/render-worker/src/pass1-v2/
└── Pass1Detector.ts                 # Imports directly from shared/ai
```

### Worker Startup Validation

```
apps/render-worker/src/worker.ts     # Validates both PASS_05 and PASS_1 model selection
                                     # Fail-fast in production if misconfigured
```

---

## Model Registry

Location: `apps/render-worker/src/shared/ai/models/model-registry.ts`

### Current Models (as of 2025-11-30)

#### OpenAI GPT-5 Family

| Model | Model ID | Context | Max Output | Input $/1M | Output $/1M | Temp | Passes |
|-------|----------|---------|------------|------------|-------------|------|--------|
| GPT-5 | `gpt-5` | 400K | 128K | $1.25 | $10.00 | No | PASS_05, PASS_1 |
| GPT-5-mini | `gpt-5-mini` | 400K | 128K | $0.25 | $2.00 | No | PASS_05, PASS_1 |
| GPT-5-nano | `gpt-5-nano` | 400K | 128K | $0.05 | $0.40 | No | PASS_05, PASS_1 |

Note: GPT-5 family are reasoning models - `temperatureSupported: false` and use `max_completion_tokens` parameter.

#### Google Gemini Family

| Model | Model ID | Context | Max Output | Input $/1M | Output $/1M | Temp | Passes |
|-------|----------|---------|------------|------------|-------------|------|--------|
| Gemini 2.5 Pro | `gemini-2.5-pro` | 1M | 65K | $1.25 | $10.00 | Yes | PASS_05, PASS_1 |
| Gemini 2.5 Flash | `gemini-2.5-flash` | 1M | 65K | $0.30 | $2.50 | Yes | PASS_05, PASS_1 |
| Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | 1M | 65K | $0.10 | $0.40 | Yes | PASS_05, PASS_1 |

### ModelDefinition Interface

```typescript
interface ModelDefinition {
  envVarSuffix: string;        // e.g., 'USE_GPT5' (pass prefix added automatically)
  vendor: 'openai' | 'google';
  modelId: string;             // API model identifier
  displayName: string;         // Human-readable name
  contextWindow: number;       // Max input tokens
  maxOutput: number;           // Max output tokens
  inputCostPer1M: number;      // USD per 1M input tokens
  outputCostPer1M: number;     // USD per 1M output tokens
  temperatureSupported: boolean;
  maxTokensParam: 'max_tokens' | 'max_completion_tokens' | 'maxOutputTokens';
  availableForPasses: string[]; // e.g., ['PASS_05', 'PASS_1']
}
```

---

## Environment Variables

### Render.com Configuration

Each pass has its own set of model toggle environment variables. Exactly ONE model must be set to `true` per pass.

#### Pass 0.5 Variables

| Variable | Current Value | Description |
|----------|---------------|-------------|
| `PASS_05_USE_GPT5` | `false` | Use GPT-5 for encounter discovery |
| `PASS_05_USE_GPT5_MINI` | `false` | Use GPT-5-mini |
| `PASS_05_USE_GPT5_NANO` | `false` | Use GPT-5-nano |
| `PASS_05_USE_GEMINI_2_5_PRO` | `false` | Use Gemini 2.5 Pro |
| `PASS_05_USE_GEMINI_2_5_FLASH` | `true` | Use Gemini 2.5 Flash (ACTIVE) |
| `PASS_05_USE_GEMINI_2_5_FLASH_LITE` | `false` | Use Gemini 2.5 Flash-Lite |

#### Pass 1 Variables

| Variable | Current Value | Description |
|----------|---------------|-------------|
| `PASS_1_USE_GPT5` | `true` | Use GPT-5 for entity detection (ACTIVE) |
| `PASS_1_USE_GPT5_MINI` | `false` | Use GPT-5-mini |
| `PASS_1_USE_GPT5_NANO` | `false` | Use GPT-5-nano |
| `PASS_1_USE_GEMINI_2_5_PRO` | `false` | Use Gemini 2.5 Pro |
| `PASS_1_USE_GEMINI_2_5_FLASH` | `false` | Use Gemini 2.5 Flash |
| `PASS_1_USE_GEMINI_2_5_FLASH_LITE` | `false` | Use Gemini 2.5 Flash-Lite |

#### API Keys (Required)

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Required for any GPT model |
| `GOOGLE_AI_API_KEY` | Required for any Gemini model |

---

## Usage Patterns

### Pass 0.5 Usage

```typescript
// apps/render-worker/src/pass05/progressive/chunk-processor.ts
import { getSelectedModel, AIProviderFactory } from '../../shared/ai';

const model = getSelectedModel();  // Uses PASS_05 prefix
const provider = AIProviderFactory.createProvider(model);
const response = await provider.generateJSON(prompt);  // No options
```

### Pass 1 Usage

```typescript
// apps/render-worker/src/pass1-v2/Pass1Detector.ts
import { getSelectedModelForPass, AIProviderFactory } from '../shared/ai';

const model = getSelectedModelForPass('PASS_1');
const provider = AIProviderFactory.createProvider(model);
const response = await provider.generateJSON(userPrompt, {
  systemMessage: systemPrompt  // Pass 1 uses system messages
});
```

### Key Difference

- **Pass 0.5**: Calls `generateJSON(prompt)` with no options - uses model's full output capacity
- **Pass 1**: Calls `generateJSON(prompt, { systemMessage })` - only passes system message, NOT maxOutputTokens

**Important**: Never pass `maxOutputTokens` to the provider. The provider uses `this.model.maxOutput` automatically (128K for GPT-5, 65K for Gemini).

---

## Adding a New Model

### Step 1: Update Model Registry

Edit `apps/render-worker/src/shared/ai/models/model-registry.ts`:

```typescript
// Add to MODEL_REGISTRY array
{
  envVarSuffix: 'USE_NEW_MODEL',
  vendor: 'openai',  // or 'google'
  modelId: 'new-model-id',
  displayName: 'New Model Name',
  contextWindow: 200_000,
  maxOutput: 100_000,
  inputCostPer1M: 0.50,
  outputCostPer1M: 1.50,
  temperatureSupported: true,
  maxTokensParam: 'max_tokens',
  availableForPasses: ['PASS_05', 'PASS_1', 'PASS_2']
}
```

### Step 2: Add Environment Variables

In Render.com dashboard, add for each pass that should use the model:
- `PASS_05_USE_NEW_MODEL=false`
- `PASS_1_USE_NEW_MODEL=false`
- `PASS_2_USE_NEW_MODEL=false`

### Step 3: Deploy

Push to main branch - auto-deploys to Render.

---

## Adding a New Pass

### Step 1: Update Model Registry

Add the new pass prefix to `availableForPasses` for each model that should be available:

```typescript
availableForPasses: ['PASS_05', 'PASS_1', 'PASS_2']  // Add PASS_2
```

### Step 2: Add Environment Variables

Add toggle variables for the new pass in Render.com:
- `PASS_2_USE_GPT5=false`
- `PASS_2_USE_GPT5_MINI=true`  // Set one to true
- etc.

### Step 3: Use in Code

```typescript
import { getSelectedModelForPass, AIProviderFactory } from '../shared/ai';

const model = getSelectedModelForPass('PASS_2');
const provider = AIProviderFactory.createProvider(model);
const response = await provider.generateJSON(prompt);
```

---

## Updating Model Pricing

When AI provider pricing changes:

1. Edit `apps/render-worker/src/shared/ai/models/model-registry.ts`
2. Update `inputCostPer1M` and `outputCostPer1M` values
3. Commit and push to main

Cost calculations use these values in `base-provider.ts`:

```typescript
protected calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * this.model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * this.model.outputCostPer1M;
  return inputCost + outputCost;
}
```

---

## Switching Models at Runtime

To switch a pass to a different model:

1. Go to Render.com dashboard > Exora Health > Environment
2. Set current model's variable to `false`
3. Set new model's variable to `true`
4. Save - triggers automatic redeploy

Example: Switch Pass 1 from GPT-5 to GPT-5-mini:
- Set `PASS_1_USE_GPT5=false`
- Set `PASS_1_USE_GPT5_MINI=true`

**Validation**: The system enforces exactly ONE model per pass. If zero or multiple are set to `true`, the worker fails to start with a clear error message.

---

## Error Handling

### Model Selection Errors

The `model-selector.ts` throws `ModelSelectionError` for:

1. **No model selected**: Lists all available options
2. **Multiple models selected**: Lists which are active
3. **Missing API key**: Specifies which key is needed

### Fail-Fast on Startup

Pass 0.5's `model-selector.ts` validates on import in production:

```typescript
if (process.env.NODE_ENV === 'production') {
  try {
    getSelectedModel();
  } catch (error) {
    process.exit(1);  // Worker won't start with bad config
  }
}
```

---

## Metrics and Cost Tracking

Each AI response includes:

```typescript
interface AIResponse {
  content: string;      // JSON response
  model: string;        // Actual model used
  inputTokens: number;  // Tokens consumed
  outputTokens: number; // Tokens generated
  cost: number;         // USD cost
}
```

Passes log this to their respective metrics tables:
- Pass 0.5: Logged in chunk processing
- Pass 1: Stored in `pass1_entity_metrics` table

---

## Troubleshooting

### "No AI model selected for PASS_X"

**Cause**: No environment variable set to `true` for the pass.

**Fix**: In Render.com, set exactly one `PASS_X_USE_*` variable to `true`.

### "Multiple AI models selected for PASS_X"

**Cause**: More than one environment variable set to `true`.

**Fix**: Set all but one to `false`.

### "Missing API key for [model]"

**Cause**: The selected model's vendor API key is not set.

**Fix**: Add `OPENAI_API_KEY` or `GOOGLE_AI_API_KEY` to Render.com environment.

### Output Truncation (0 entities)

**Cause**: Passing `maxOutputTokens` override with a small value.

**Fix**: Do NOT pass `maxOutputTokens` to `generateJSON()`. Let the provider use `this.model.maxOutput`.

### Gemini MAX_TOKENS Error

**Cause**: Output exceeds Gemini's max output limit.

**Note**: Current Google provider throws on MAX_TOKENS. This may need adjustment to return partial content.

---

## Known Limitations

1. **Temperature**: GPT-5 family doesn't support temperature - ignored if passed
2. **System Messages**: Pass 0.5 doesn't use system messages; Pass 1 does
3. **Gemini MAX_TOKENS**: Currently throws error instead of returning partial content
4. **No Dynamic Pricing**: Pricing is static in code; requires redeploy to update

---

## Commit History

| Commit | Description |
|--------|-------------|
| `44d2192` | Original Pass 0.5 provider implementation |
| `ea4bb98` | Created shared AI module, Pass 0.5 re-exports |
| `384aaac` | Added GPT-5 family to Pass 1 model selection |
| `79c2f46` | Fixed Pass 1 to not pass maxOutputTokens (root cause fix) |

---

## Related Documentation

- **Pass 0.5**: `apps/render-worker/src/pass05/` - Encounter discovery
- **Pass 1**: `apps/render-worker/src/pass1-v2/` - Entity detection
- **Pass 2**: TBD - Clinical extraction (will use same shared/ai module)
