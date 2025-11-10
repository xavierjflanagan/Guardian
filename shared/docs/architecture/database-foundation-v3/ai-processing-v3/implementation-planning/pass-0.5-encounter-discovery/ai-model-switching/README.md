# AI Model Switching Architecture for Pass 0.5

**Status:** IMPLEMENTATION READY
**Date:** November 9, 2025
**Purpose:** Enable safe, reliable switching between AI models from different vendors

---

## Overview

This architecture enables Pass 0.5 (encounter discovery) to switch between multiple AI models using environment variable toggles, with automatic cost tracking and metrics propagation.

**Key Features:**
- Toggle-based model selection (no typo risk)
- Multi-vendor support (OpenAI, Google, future vendors)
- Automatic cost calculation per model
- Fail-fast validation on deployment
- Unified metrics tracking across all models

---

## Quick Start

### 1. Select a Model (Render.com Environment Variables)

Set exactly ONE model to `true`, all others to `false`:

```bash
# OpenAI Models
PASS_05_USE_GPT5=false         # GPT-5 (400K context)
PASS_05_USE_GPT5_MINI=false    # GPT-5-mini (128K context)

# Google Gemini Models
PASS_05_USE_GEMINI_2_5_PRO=false     # Gemini 2.5 Pro (1M context)
PASS_05_USE_GEMINI_2_5_FLASH=true    # ✅ ACTIVE - Gemini 2.5 Flash (1M context)
```

### 2. Deploy Changes

When you deploy, the worker will:
1. Validate exactly one model is selected
2. Check required API keys are present
3. Start if valid, or fail with clear error message

### 3. Monitor Performance

All database tables automatically track the active model:

```sql
-- See model distribution
SELECT
  ai_model_name,
  COUNT(*) as jobs,
  AVG(ai_cost_usd) as avg_cost
FROM ai_processing_sessions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY ai_model_name;
```

---

## Supported Models

### OpenAI Models

| Model | Environment Variable | Context Window | Cost (per 1M tokens) | Best For |
|-------|---------------------|----------------|---------------------|----------|
| GPT-5 | `PASS_05_USE_GPT5=true` | 400K in / 128K out | $0.25 in / $2.00 out | Complex reasoning |
| GPT-5-mini | `PASS_05_USE_GPT5_MINI=true` | 128K in / 128K out | $0.15 in / $0.60 out | Cost optimization |

### Google Gemini Models

| Model | Environment Variable | Context Window | Cost (per 1M tokens) | Best For |
|-------|---------------------|----------------|---------------------|----------|
| Gemini 2.5 Pro | `PASS_05_USE_GEMINI_2_5_PRO=true` | 1M in / 65K out | $0.15 in / $0.60 out | Best reasoning |
| Gemini 2.5 Flash | `PASS_05_USE_GEMINI_2_5_FLASH=true` | 1M in / 65K out | $0.075 in / $0.30 out | **Recommended** |

**Why Gemini 2.5 Flash?**
- 10x larger context than GPT-5-mini (1M vs 128K)
- 70% cheaper than GPT-5 ($0.075 vs $0.25 input)
- Handles 220+ page documents without chunking
- Excellent price-performance ratio

---

## Architecture Components

### 1. Model Registry (`model-registry.ts`)
- Defines all available models with metadata
- Stores context windows, pricing, capabilities
- Single source of truth for model specifications

### 2. Model Selector (`model-selector.ts`)
- Reads environment variables
- Validates exactly one model is active
- Returns selected model configuration
- Fail-fast with clear error messages

### 3. Provider Abstraction (`providers/`)
- `BaseAIProvider` - Abstract base class
- `OpenAIProvider` - OpenAI integration
- `GoogleProvider` - Google Gemini integration
- `AIProviderFactory` - Creates appropriate provider

### 4. Cost Calculator
- Automatic cost calculation per model
- Uses model-specific pricing from registry
- Tracks input/output tokens separately

---

## Configuration Examples

### Development Testing
```bash
# Test with GPT-5-mini (cheaper, smaller context)
PASS_05_USE_GPT5=false
PASS_05_USE_GPT5_MINI=true
PASS_05_USE_GEMINI_2_5_PRO=false
PASS_05_USE_GEMINI_2_5_FLASH=false
```

### Production (220+ Page Documents)
```bash
# Use Gemini 2.5 Flash (1M context, cost-effective)
PASS_05_USE_GPT5=false
PASS_05_USE_GPT5_MINI=false
PASS_05_USE_GEMINI_2_5_PRO=false
PASS_05_USE_GEMINI_2_5_FLASH=true
```

### A/B Testing
```bash
# Alternate between models for comparison
# Monday-Wednesday: Gemini
PASS_05_USE_GEMINI_2_5_FLASH=true

# Thursday-Sunday: GPT-5
PASS_05_USE_GPT5=true
```

---

## Validation and Error Handling

### Startup Validation

The worker validates configuration on startup:

1. **No Model Selected:**
```
❌ CRITICAL: No AI model selected for Pass 0.5

Set exactly ONE of these in Render.com:
  PASS_05_USE_GPT5=true          # GPT-5
  PASS_05_USE_GPT5_MINI=true     # GPT-5-mini
  PASS_05_USE_GEMINI_2_5_PRO=true    # Gemini 2.5 Pro
  PASS_05_USE_GEMINI_2_5_FLASH=true  # Gemini 2.5 Flash
```

2. **Multiple Models Selected:**
```
❌ CRITICAL: Multiple AI models selected

Currently active:
  PASS_05_USE_GPT5=true
  PASS_05_USE_GEMINI_2_5_FLASH=true

Set all to false except the one you want to use.
```

3. **Missing API Key:**
```
❌ Missing API key for Gemini 2.5 Flash
Set GOOGLE_AI_API_KEY in Render.com environment variables.
```

---

## Adding New Models

To add a new AI model (e.g., Claude 4):

### 1. Add Environment Variable
```bash
PASS_05_USE_CLAUDE_4_SONNET=false  # New model toggle
```

### 2. Update Model Registry
```typescript
// model-registry.ts
{
  envVar: 'PASS_05_USE_CLAUDE_4_SONNET',
  vendor: 'anthropic',
  modelId: 'claude-4-sonnet',
  displayName: 'Claude 4 Sonnet',
  contextWindow: 500_000,
  maxOutput: 16_000,
  inputCostPer1M: 3.00,
  outputCostPer1M: 15.00,
  // ... other metadata
}
```

### 3. Create Provider (if new vendor)
```typescript
// providers/anthropic-provider.ts
export class AnthropicProvider extends BaseAIProvider {
  // Implement generateJSON() method
}
```

### 4. Update Factory
```typescript
// provider-factory.ts
case 'anthropic':
  return new AnthropicProvider(model);
```

---

## Cost Tracking

### Current Implementation

Pass 0.5 already tracks costs in multiple places:
- `encounterDiscovery.ts:159-167` - Basic cost calculation
- `ai_processing_sessions.ai_cost_usd` - Database storage
- `shell_file_manifests.ai_cost_usd` - Per-document tracking

### Updated Cost Calculation

The new architecture automatically:
1. Retrieves model-specific pricing from registry
2. Calculates cost based on actual token usage
3. Stores in all relevant database tables
4. Enables cost comparison queries

### Example Cost Query
```sql
-- Compare costs across models
SELECT
  ai_model_name,
  COUNT(*) as documents,
  AVG(ai_cost_usd) as avg_cost_per_doc,
  SUM(ai_cost_usd) as total_cost,
  AVG(page_count) as avg_pages
FROM ai_processing_sessions aps
JOIN shell_files sf ON sf.id = aps.shell_file_id
WHERE aps.created_at > NOW() - INTERVAL '30 days'
GROUP BY ai_model_name
ORDER BY avg_cost_per_doc;
```

---

## Migration Path

### Phase 1: Deploy Architecture (2 hours)
1. Deploy new model switching code
2. Keep GPT-5 as default (no behavior change)
3. Validate startup checks work

### Phase 2: Test Gemini (1 hour)
1. Enable Gemini 2.5 Flash in staging
2. Process test documents
3. Compare accuracy and costs

### Phase 3: Production Rollout
1. Switch production to Gemini 2.5 Flash
2. Monitor for 24 hours
3. Ready to switch back if issues

---

## Documentation Structure

```
ai-model-switching/
├── README.md                          # This file
├── CURRENT_ARCHITECTURE.md            # Existing OpenAI-only implementation
├── MULTI_VENDOR_ARCHITECTURE.md       # New abstraction design
├── IMPLEMENTATION_PLAN.md             # Step-by-step migration
├── VENDOR_INTEGRATION_GUIDE.md        # How to add new vendors
└── MODEL_CATALOG.md                   # Detailed model specifications
```

---

## Next Steps

1. Review and approve this architecture
2. Implement model switching code (~6-8 hours)
3. Test with 142-page baseline document
4. Test with 220-page document that failed
5. Deploy to production with Gemini 2.5 Flash

---

**Questions?** Check the detailed documentation in this folder or review the implementation code.