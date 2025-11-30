# Pass 1 Model Toggle System - Failure Analysis

**Date:** 2025-11-30
**Status:** ROOT CAUSE CONFIRMED - Fix Plan Ready
**Previous State:** Working with direct OpenAI client using gpt-5-mini
**Current State:** Failing after model toggle refactor

---

## Executive Summary

Pass 1 entity detection was working using direct OpenAI client calls. After refactoring to use the shared AI provider system, it now fails with:
1. **GPT-5**: Returns 0 entities despite hitting 4096 output token limit
2. **Gemini 2.5 Flash**: Throws MAX_TOKENS error

**ROOT CAUSE CONFIRMED:** Pass 1 is passing `maxOutputTokens: 4096` to the provider, but the validated Pass 0.5 provider uses `this.model.maxOutput` (128,000 tokens for GPT-5 family). The model is being artificially limited and truncating its output.

---

## Validated Pass 0.5 Provider (Source of Truth)

The original Pass 0.5 OpenAI provider at commit `44d2192` is the validated, working implementation:

```typescript
// apps/render-worker/src/pass05/providers/openai-provider.ts (commit 44d2192)
async generateJSON(prompt: string): Promise<AIResponse> {
  const promptTokens = this.estimateTokens(prompt);
  this.validateContextWindow(promptTokens);

  const requestParams: any = {
    model: this.model.modelId,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: 'json_object' }  // Force JSON response
  };

  // Set max tokens parameter (GPT-5 uses max_completion_tokens)
  if (this.model.maxTokensParam === 'max_completion_tokens') {
    requestParams.max_completion_tokens = this.model.maxOutput;  // <-- USES MODEL'S FULL CAPACITY
  } else {
    requestParams.max_tokens = this.model.maxOutput;
  }

  // Set temperature if supported
  if (this.model.temperatureSupported) {
    requestParams.temperature = 0.1;
  }

  // ... rest of implementation
}
```

**Key Characteristics of Validated Provider:**
1. Uses `response_format: { type: 'json_object' }` - this IS correct
2. Uses `this.model.maxOutput` directly - NOT an options override
3. Temperature is hardcoded to 0.1 when supported
4. No system message support (user message only)
5. No options parameter at all

---

## Root Cause: maxOutputTokens Override

### The Problem

The new shared provider added an `options` parameter:

```typescript
// Current shared/ai/providers/openai-provider.ts
async generateJSON(prompt: string, options?: GenerateOptions): Promise<AIResponse> {
  // ...
  const maxTokens = options?.maxOutputTokens || this.model.maxOutput;  // <-- ALLOWS OVERRIDE
  // ...
}
```

Pass 1 is calling it with:

```typescript
// Pass1Detector.ts line 551-555
const response = await this.provider.generateJSON(user, {
  systemMessage: system,
  temperature: this.config.temperature,
  maxOutputTokens: this.config.max_tokens  // <-- PASSES 4096!
});
```

Where `this.config.max_tokens` comes from:

```typescript
// pass1-v2-types.ts
export const DEFAULT_PASS1_CONFIG: Partial<Pass1Config> = {
  max_tokens: 4096,  // <-- THIS IS THE PROBLEM
  // ...
};
```

### The Math

- **GPT-5-mini maxOutput:** 128,000 tokens
- **Pass 1 is requesting:** 4,096 tokens
- **Result:** Output truncated at 4,096 tokens, incomplete JSON, 0 entities parsed

---

## Differences from Validated Provider

| Aspect | Validated Pass 0.5 | Current Shared Provider | Impact |
|--------|-------------------|------------------------|--------|
| maxOutputTokens | `this.model.maxOutput` (128K) | `options?.maxOutputTokens` (4096) | **CRITICAL** |
| System message | Not supported | Supported via options | Minor |
| Temperature | Hardcoded 0.1 | From options | Minor |
| response_format | Yes | Yes | OK |

---

## Previous Hypothesis (UPDATED)

The earlier analysis incorrectly suspected `response_format: { type: 'json_object' }` was the issue. This was wrong - the validated Pass 0.5 provider DOES use this parameter and works fine.

The actual root cause is the **maxOutputTokens override** being set to 4096 instead of using the model's full 128K capacity.

---

## Fix Plan

### Option A: Match Validated Pass 0.5 Behavior (RECOMMENDED)

Modify the shared provider to match the validated Pass 0.5 implementation exactly:

1. **Remove options parameter** - the validated provider doesn't have one
2. **Use `this.model.maxOutput` directly** - no overrides
3. **Hardcode temperature to 0.1** - when supported

This ensures Pass 0.5 and Pass 1 both use identical, validated behavior.

### Option B: Fix Pass 1 Caller (Alternative)

Keep the shared provider flexible but fix how Pass 1 calls it:

```typescript
// Pass1Detector.ts - DON'T pass maxOutputTokens
const response = await this.provider.generateJSON(user, {
  systemMessage: system
  // Remove: maxOutputTokens: this.config.max_tokens
  // Remove: temperature: this.config.temperature
});
```

This lets the provider use `this.model.maxOutput` (128K) as default.

### Option C: Increase Pass 1 Config (Not Recommended)

Increase `DEFAULT_PASS1_CONFIG.max_tokens` to a higher value. This is fragile because:
- Different models have different limits
- Validated pattern is to use model's full capacity

---

## Recommended Fix: Option A

Revert the shared OpenAI provider to match the validated Pass 0.5 implementation exactly:

```typescript
// shared/ai/providers/openai-provider.ts
async generateJSON(prompt: string): Promise<AIResponse> {  // NO options parameter
  const promptTokens = this.estimateTokens(prompt);
  this.validateContextWindow(promptTokens);

  const requestParams: any = {
    model: this.model.modelId,
    messages: [
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' }
  };

  if (this.model.maxTokensParam === 'max_completion_tokens') {
    requestParams.max_completion_tokens = this.model.maxOutput;  // Use model's full capacity
  } else {
    requestParams.max_tokens = this.model.maxOutput;
  }

  if (this.model.temperatureSupported) {
    requestParams.temperature = 0.1;
  }

  // ... rest unchanged
}
```

Then update Pass 1 to match Pass 0.5's calling pattern:
- Embed system instructions in the user prompt (as Pass 0.5 does)
- Don't pass options

---

## Files to Modify

| File | Change |
|------|--------|
| `shared/ai/providers/openai-provider.ts` | Revert to validated Pass 0.5 pattern |
| `shared/ai/providers/base-provider.ts` | Remove GenerateOptions if not needed |
| `pass1-v2/Pass1Detector.ts` | Update to match Pass 0.5 calling pattern |

---

## Gemini Provider Notes

The Google provider also needs adjustment:
1. Use `this.model.maxOutput` (65,536) not options override
2. Handle MAX_TOKENS gracefully (return partial content, don't throw)

---

## Validation Criteria

After fix, Pass 1 should:
1. Successfully detect entities with GPT-5-mini
2. Use 128,000 max output tokens (not 4,096)
3. Match Pass 0.5's validated behavior exactly

---

## Conclusion

The root cause is confirmed: **Pass 1 passes `maxOutputTokens: 4096` but should use the model's full 128K capacity.**

The fix is to revert the shared provider to match the validated Pass 0.5 implementation that uses `this.model.maxOutput` directly without options overrides.
