# Vendor Integration Guide: Adding New AI Providers

**Purpose:** Step-by-step guide for adding new AI vendors to Pass 0.5
**Last Updated:** November 9, 2025

---

## Overview

This guide explains how to add support for new AI vendors (e.g., Anthropic Claude, Cohere, etc.) to the Pass 0.5 model switching architecture.

---

## Integration Checklist

To add a new AI vendor, you need to:

1. [ ] Add model definitions to registry
2. [ ] Create environment variables
3. [ ] Implement provider class
4. [ ] Update provider factory
5. [ ] Add SDK dependency
6. [ ] Write tests
7. [ ] Update documentation

---

## Step-by-Step Guide

### Step 1: Add Model Definitions to Registry

**File:** `apps/render-worker/src/pass05/models/model-registry.ts`

Add your vendor's models to the MODEL_REGISTRY array:

```typescript
// Example: Adding Anthropic Claude models
{
  envVar: 'PASS_05_USE_CLAUDE_3_5_SONNET',
  vendor: 'anthropic',  // New vendor type
  modelId: 'claude-3-5-sonnet-20241022',
  displayName: 'Claude 3.5 Sonnet',
  contextWindow: 200_000,
  maxOutput: 8_192,
  inputCostPer1M: 3.00,
  outputCostPer1M: 15.00,
  temperatureSupported: true,
  maxTokensParam: 'max_tokens'
},
{
  envVar: 'PASS_05_USE_CLAUDE_3_5_HAIKU',
  vendor: 'anthropic',
  modelId: 'claude-3-5-haiku-20241022',
  displayName: 'Claude 3.5 Haiku',
  contextWindow: 200_000,
  maxOutput: 8_192,
  inputCostPer1M: 0.80,
  outputCostPer1M: 4.00,
  temperatureSupported: true,
  maxTokensParam: 'max_tokens'
}
```

**Update the vendor type union:**

```typescript
export interface ModelDefinition {
  // ...
  vendor: 'openai' | 'google' | 'anthropic';  // Add new vendor
  // ...
}
```

---

### Step 2: Create Environment Variables

**File:** `.env.example`

Add toggles and API key:

```bash
# Anthropic Models (new section)
PASS_05_USE_CLAUDE_3_5_SONNET=false
PASS_05_USE_CLAUDE_3_5_HAIKU=false

# API Keys
ANTHROPIC_API_KEY=sk-ant-xxxxx  # New API key
```

---

### Step 3: Implement Provider Class

**File:** `apps/render-worker/src/pass05/providers/anthropic-provider.ts`

Create a new provider class following the base provider interface:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider, AIResponse } from './base-provider';
import { ModelDefinition } from '../models/model-registry';

export class AnthropicProvider extends BaseAIProvider {
  private client: Anthropic;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async generateJSON(prompt: string): Promise<AIResponse> {
    // Estimate prompt tokens
    const promptTokens = Math.ceil(prompt.length / 4);
    this.validateContextWindow(promptTokens);

    // Prepare system prompt for JSON output
    const systemPrompt = 'You are a medical document analyzer. Always respond with valid JSON.';

    try {
      const response = await this.client.messages.create({
        model: this.model.modelId,
        max_tokens: Math.min(8192, this.model.maxOutput),
        temperature: this.model.temperatureSupported ? 0.1 : 1.0,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Extract content (Claude returns array of content blocks)
      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      // Calculate tokens from usage
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cost = this.calculateCost(inputTokens, outputTokens);

      return {
        content,
        model: response.model,
        inputTokens,
        outputTokens,
        cost
      };
    } catch (error) {
      console.error(`[Anthropic Provider] Error:`, error);
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
}
```

---

### Step 4: Update Provider Factory

**File:** `apps/render-worker/src/pass05/providers/provider-factory.ts`

Add case for new vendor:

```typescript
import { AnthropicProvider } from './anthropic-provider';

export class AIProviderFactory {
  static createProvider(model: ModelDefinition): BaseAIProvider {
    switch (model.vendor) {
      case 'openai':
        return new OpenAIProvider(model);
      case 'google':
        return new GoogleProvider(model);
      case 'anthropic':  // New vendor
        return new AnthropicProvider(model);
      default:
        throw new Error(`Unsupported vendor: ${model.vendor}`);
    }
  }
}
```

---

### Step 5: Add SDK Dependency

**File:** `apps/render-worker/package.json`

Add vendor SDK:

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",  // New dependency
    "@google/generative-ai": "^0.21.0",
    "openai": "^4.67.0"
  }
}
```

Run installation:
```bash
pnpm install
```

---

### Step 6: Update Model Selector Validation

**File:** `apps/render-worker/src/pass05/models/model-selector.ts`

Add API key validation for new vendor:

```typescript
// In getSelectedModel() function, update API key validation:

let apiKeyVar: string;
switch (model.vendor) {
  case 'openai':
    apiKeyVar = 'OPENAI_API_KEY';
    break;
  case 'google':
    apiKeyVar = 'GOOGLE_AI_API_KEY';
    break;
  case 'anthropic':  // New vendor
    apiKeyVar = 'ANTHROPIC_API_KEY';
    break;
  default:
    throw new Error(`Unknown vendor: ${model.vendor}`);
}

if (!process.env[apiKeyVar]) {
  throw new ModelSelectionError(
    `Missing API key for ${model.displayName}\n` +
    `Set ${apiKeyVar} in Render.com environment variables.`
  );
}
```

---

## Vendor-Specific Considerations

### 1. JSON Output Format

Different vendors have different approaches to JSON output:

| Vendor | JSON Support | Implementation |
|--------|--------------|----------------|
| OpenAI | Native `response_format: {type: 'json_object'}` | Built-in |
| Google | Native `responseMimeType: 'application/json'` | Built-in |
| Anthropic | No native support | Use system prompt |
| Cohere | `response_format` parameter | Similar to OpenAI |

**For vendors without native JSON support:**

```typescript
// Add JSON instruction to system prompt
const systemPrompt = `
You must respond with valid JSON only.
Do not include any text before or after the JSON.
Ensure all JSON is properly formatted and valid.
`;
```

### 2. Token Counting

Different vendors provide token counts differently:

| Vendor | Token Count Source | Fallback Strategy |
|--------|-------------------|-------------------|
| OpenAI | `response.usage.prompt_tokens` | Estimate: length/4 |
| Google | `response.usageMetadata.promptTokenCount` | Estimate: length/4 |
| Anthropic | `response.usage.input_tokens` | Estimate: length/4 |
| Cohere | `response.meta.tokens` | Estimate: length/4 |

### 3. Rate Limiting

Implement retry logic for rate limits:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      // Check for rate limit error
      if (error.status === 429) {
        const delay = error.headers?.['retry-after']
          ? parseInt(error.headers['retry-after']) * 1000
          : delayMs * Math.pow(2, i);

        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;  // Don't retry non-rate-limit errors
      }
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 4. Error Handling

Vendor-specific error codes:

```typescript
function normalizeError(vendor: string, error: any): Error {
  switch (vendor) {
    case 'openai':
      if (error.code === 'context_length_exceeded') {
        return new Error('Document too large for model');
      }
      break;
    case 'anthropic':
      if (error.error?.type === 'invalid_request_error') {
        return new Error(`Invalid request: ${error.error.message}`);
      }
      break;
    case 'google':
      if (error.message?.includes('RESOURCE_EXHAUSTED')) {
        return new Error('Quota exceeded or rate limited');
      }
      break;
  }
  return new Error(`${vendor} API error: ${error.message}`);
}
```

---

## Testing New Vendors

### 1. Unit Tests

**File:** `apps/render-worker/src/pass05/providers/__tests__/anthropic-provider.test.ts`

```typescript
import { AnthropicProvider } from '../anthropic-provider';
import { ModelDefinition } from '../../models/model-registry';

describe('AnthropicProvider', () => {
  const mockModel: ModelDefinition = {
    envVar: 'PASS_05_USE_CLAUDE_3_5_SONNET',
    vendor: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    contextWindow: 200_000,
    maxOutput: 8_192,
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    temperatureSupported: true,
    maxTokensParam: 'max_tokens'
  };

  it('should calculate cost correctly', () => {
    const provider = new AnthropicProvider(mockModel);
    // Use protected method through reflection
    const cost = provider['calculateCost'](10000, 2000);

    // 10,000 input tokens at $3/1M = $0.03
    // 2,000 output tokens at $15/1M = $0.03
    expect(cost).toBeCloseTo(0.06, 4);
  });

  it('should validate context window', () => {
    const provider = new AnthropicProvider(mockModel);

    // Should not throw for valid size
    expect(() => provider['validateContextWindow'](150000)).not.toThrow();

    // Should throw for exceeding context
    expect(() => provider['validateContextWindow'](250000)).toThrow(
      'Prompt exceeds Claude 3.5 Sonnet context window'
    );
  });
});
```

### 2. Integration Tests

Test with actual API calls (requires API key):

```typescript
describe('AnthropicProvider Integration', () => {
  it('should generate JSON response', async () => {
    // Skip if no API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('Skipping Anthropic integration test - no API key');
      return;
    }

    const provider = new AnthropicProvider(mockModel);
    const prompt = 'Return JSON with a single field "test" set to "success"';

    const response = await provider.generateJSON(prompt);

    expect(response).toMatchObject({
      content: expect.any(String),
      model: expect.stringContaining('claude'),
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
      cost: expect.any(Number)
    });

    const parsed = JSON.parse(response.content);
    expect(parsed.test).toBe('success');
  });
});
```

### 3. End-to-End Testing

Test with real medical document:

```typescript
// Test with 142-page baseline document
const testDocument = await loadTestDocument('baseline-142-pages.pdf');
const ocrText = await extractOCR(testDocument);

// Test each new model
for (const modelEnvVar of ['PASS_05_USE_CLAUDE_3_5_SONNET', 'PASS_05_USE_CLAUDE_3_5_HAIKU']) {
  // Set only this model to true
  process.env[modelEnvVar] = 'true';

  const result = await performEncounterDiscovery(ocrText, metadata);

  // Verify result structure
  expect(result).toHaveProperty('encounters');
  expect(result).toHaveProperty('pageAssignments');
  expect(result).toHaveProperty('aiCostUsd');
  expect(result.aiModel).toContain('claude');

  // Reset
  process.env[modelEnvVar] = 'false';
}
```

---

## Common Integration Patterns

### Pattern 1: Streaming Responses

For vendors that support streaming (useful for large outputs):

```typescript
async generateJSONStream(prompt: string): AsyncGenerator<string> {
  const stream = await this.client.messages.stream({
    model: this.model.modelId,
    messages: [{ role: 'user', content: prompt }],
    stream: true
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta') {
      yield chunk.delta.text;
    }
  }
}
```

### Pattern 2: Batch Processing

For vendors that support batch API:

```typescript
async processBatch(prompts: string[]): Promise<AIResponse[]> {
  const requests = prompts.map(prompt => ({
    model: this.model.modelId,
    messages: [{ role: 'user', content: prompt }]
  }));

  const responses = await this.client.batch.create({
    requests,
    completion_window: '24h'
  });

  return responses.map(r => this.parseResponse(r));
}
```

### Pattern 3: Caching

For vendors that support prompt caching:

```typescript
async generateWithCache(prompt: string, cacheKey?: string): Promise<AIResponse> {
  const cacheControl = cacheKey ? {
    cache_control: {
      type: 'ephemeral',
      key: cacheKey
    }
  } : undefined;

  const response = await this.client.messages.create({
    model: this.model.modelId,
    messages: [{ role: 'user', content: prompt }],
    ...cacheControl
  });

  return this.parseResponse(response);
}
```

---

## Deployment Checklist

After adding a new vendor:

1. **Code Changes:**
   - [ ] Model definitions added to registry
   - [ ] Provider class implemented
   - [ ] Factory updated
   - [ ] API key validation added
   - [ ] Tests written and passing

2. **Documentation:**
   - [ ] Update MODEL_CATALOG.md with new models
   - [ ] Update README.md supported models table
   - [ ] Add vendor-specific notes to this guide

3. **Environment Setup:**
   - [ ] Add API key to Render.com
   - [ ] Set all new model toggles to false
   - [ ] Document API key acquisition process

4. **Testing:**
   - [ ] Unit tests pass
   - [ ] Integration tests pass (with API key)
   - [ ] 142-page document processes successfully
   - [ ] Cost tracking accurate

5. **Monitoring:**
   - [ ] Verify logs show correct model selection
   - [ ] Check database for model name storage
   - [ ] Monitor error rates for 24 hours

---

## Troubleshooting

### Common Issues

**1. "Missing API key" error on deployment:**
- Verify environment variable name matches exactly
- Check Render.com has the API key set
- Ensure no typos in variable name

**2. JSON parsing errors:**
- Add explicit JSON instructions to prompt
- Validate response is pure JSON (no markdown)
- Consider pre/post-processing to clean response

**3. Token count mismatch:**
- Use vendor's official tokenizer if available
- Fall back to estimation (length/4) if needed
- Log actual vs estimated for calibration

**4. Rate limiting:**
- Implement exponential backoff
- Check vendor's rate limits documentation
- Consider request batching

**5. Cost calculation errors:**
- Verify pricing is up-to-date
- Check token counts match billing
- Compare with vendor's pricing calculator

---

## Vendor Contact Information

| Vendor | Documentation | API Keys | Support |
|--------|--------------|----------|---------|
| OpenAI | [platform.openai.com/docs](https://platform.openai.com/docs) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | [help.openai.com](https://help.openai.com) |
| Google | [ai.google.dev/docs](https://ai.google.dev/docs) | [aistudio.google.com](https://aistudio.google.com) | [support.google.com](https://support.google.com) |
| Anthropic | [docs.anthropic.com](https://docs.anthropic.com) | [console.anthropic.com](https://console.anthropic.com) | [support.anthropic.com](https://support.anthropic.com) |
| Cohere | [docs.cohere.com](https://docs.cohere.com) | [dashboard.cohere.com](https://dashboard.cohere.com) | [cohere.com/support](https://cohere.com/support) |

---

## Example: Complete Cohere Integration

Here's a complete example of adding Cohere as a new vendor:

### 1. Model Registry Addition

```typescript
// model-registry.ts
{
  envVar: 'PASS_05_USE_COMMAND_R_PLUS',
  vendor: 'cohere',
  modelId: 'command-r-plus',
  displayName: 'Command R+',
  contextWindow: 128_000,
  maxOutput: 4_096,
  inputCostPer1M: 2.50,
  outputCostPer1M: 10.00,
  temperatureSupported: true,
  maxTokensParam: 'max_tokens'
}
```

### 2. Cohere Provider Implementation

```typescript
// cohere-provider.ts
import { CohereClient } from 'cohere-ai';
import { BaseAIProvider, AIResponse } from './base-provider';

export class CohereProvider extends BaseAIProvider {
  private client: CohereClient;

  constructor(model: ModelDefinition) {
    super(model);
    this.client = new CohereClient({
      token: process.env.COHERE_API_KEY
    });
  }

  async generateJSON(prompt: string): Promise<AIResponse> {
    const promptTokens = Math.ceil(prompt.length / 4);
    this.validateContextWindow(promptTokens);

    const response = await this.client.chat({
      model: this.model.modelId,
      message: prompt,
      temperature: this.model.temperatureSupported ? 0.1 : 1.0,
      maxTokens: Math.min(4096, this.model.maxOutput),
      responseFormat: { type: 'json_object' }
    });

    return {
      content: response.text,
      model: this.model.modelId,
      inputTokens: response.meta.tokens.inputTokens,
      outputTokens: response.meta.tokens.outputTokens,
      cost: this.calculateCost(
        response.meta.tokens.inputTokens,
        response.meta.tokens.outputTokens
      )
    };
  }
}
```

### 3. Factory Update

```typescript
// provider-factory.ts
case 'cohere':
  return new CohereProvider(model);
```

### 4. Package.json

```json
"cohere-ai": "^7.10.0"
```

---

This completes the vendor integration. Test thoroughly before deploying to production!