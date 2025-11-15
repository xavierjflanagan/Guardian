# Pass 0.5 Strategy A - Script Analysis

**Date:** November 14, 2024
**Version:** 1.0
**Purpose:** Comprehensive review of existing scripts and planning for Strategy A

## Current Script Inventory

### Directory Structure
```
apps/render-worker/src/pass05/
├── Core Scripts
├── progressive/
├── providers/
├── models/
└── prompt-versions-and-improvements/
```

## Script Categories

### 1. KEEP AS-IS (Infrastructure)

#### Provider Scripts (`providers/`)
**Files:**
- `base-provider.ts` - Abstract base class for AI providers
- `google-provider.ts` - Google AI (Gemini) implementation
- `openai-provider.ts` - OpenAI GPT implementation
- `provider-factory.ts` - Factory pattern for provider selection

**Purpose:** Abstracts AI model interfaces, handles API calls
**Strategy A Impact:** None - works perfectly for new system
**Action:** Keep unchanged

#### Model Management (`models/`)
**Files:**
- `model-registry.ts` - Available models and configurations
- `model-selector.ts` - Model selection logic

**Purpose:** Manages which AI model to use
**Strategy A Impact:** None - compatible with Strategy A
**Action:** Keep, add new models as they become available

### 2. MODIFY SIGNIFICANTLY

#### session-manager.ts
**Current Purpose:** Manages progressive sessions for >100 page documents
**Current Logic:**
- Checks if document >100 pages
- Creates progressive session
- Orchestrates chunk processing

**Strategy A Changes:**
- Remove page count threshold check
- Always create progressive session
- Add cascade_id tracking
- Simplify metrics calculation

**New Responsibilities:**
- Universal entry point for ALL documents
- Manages chunk sequencing
- Tracks cascade chains
- Coordinates reconciliation

#### chunk-processor.ts
**Current Purpose:** Processes individual chunks
**Current Logic:**
- Receives chunk + handoff
- Calls AI
- Post-processes response
- Determines continuing status

**Strategy A Changes:**
- Remove complex continuation logic
- Add cascade_id generation
- Implement position extraction
- Always save to pending (never direct to final)

**New Responsibilities:**
- Process chunk with V11 prompt
- Generate all IDs (never AI)
- Mark cascading encounters
- Create minimal handoff

#### pending-reconciler.ts
**Current Purpose:** Complex reconciliation with fixes 2A/2B/2C
**Current Logic:**
- Merges page ranges
- Updates temp IDs
- Handles orphaned pendings

**Strategy A Changes:**
- Complete rewrite
- Primary: Group by cascade_id
- Secondary: Descriptor matching for orphans
- No complex page range merging

**New Responsibilities:**
- Simple cascade_id grouping
- Create final encounters
- Update page assignments
- Flag ambiguous matches

#### post-processor.ts
**Current Purpose:** Forces continuation status based on page boundaries
**Current Logic:**
- Checks if encounter touches chunk end
- Overrides AI status if needed
- Generates temp IDs

**Strategy A Changes:**
- Remove status enforcement
- Add cascade_id generation
- Add position field extraction
- ID generation only (no logic)

**New Responsibilities:**
- Parse AI response
- Generate deterministic IDs
- Extract position data
- Mark cascading encounters

#### handoff-builder.ts
**Current Purpose:** Creates complex handoff packages
**Current Logic:**
- Includes partial encounter data
- Page ranges
- Expected continuation

**Strategy A Changes:**
- Massive simplification
- Only cascade_id + minimal context
- No page ranges
- Just semantic summary

**New Structure:**
```json
{
  "cascade_id": "cascade_abc123",
  "encounter_type": "hospital_admission",
  "summary_snapshot": "Brief context...",
  "confidence": 0.95
}
```

### 3. DELETE (Legacy/Obsolete)

#### Old Prompt Files
**Files to Delete:**
- `aiPrompts.v2.7.ts` - Obsolete version
- `aiPrompts.v2.8.ts` - Obsolete version
- `aiPrompts.v2.9.ts` - Obsolete version
- `aiPrompts.ts` - Old default, replaced by versioned

**Reason:** Superseded by v10, soon v11
**Action:** Delete after confirming no dependencies

#### manifestBuilder.ts
**Current Purpose:** Unknown/unclear
**Usage:** Appears unused in current flow
**Action:** Investigate dependencies, then delete

#### encounterDiscovery.ts
**Current Purpose:** Original single-shot processing
**Current Logic:** Processes entire document at once
**Strategy A Impact:** Completely replaced by progressive
**Action:** Delete after migration complete

### 4. CREATE NEW

#### aiPrompts.v11.ts
**Purpose:** Unified progressive prompt for Strategy A
**Features:**
- Single prompt for all document sizes
- Cascade-aware instructions
- Position granularity support
- Clear ID handling instructions

**Key Sections:**
- Encounter detection rules
- Cascade identification logic
- Position estimation guidelines
- Handoff context handling

#### cascade-manager.ts
**Purpose:** Manage cascade ID lifecycle
**Responsibilities:**
- Generate unique cascade IDs
- Track cascade chains
- Map cascade to final IDs
- Validate cascade continuity

**Key Functions:**
- `generateCascadeId()` - Create new cascade ID
- `trackCascade()` - Record cascade in session
- `resolveCascades()` - Map to final encounters

#### position-extractor.ts
**Purpose:** Handle sub-page position data
**Responsibilities:**
- Parse position from AI response
- Validate position logic
- Convert descriptions to fractions
- Handle future bbox data

**Key Functions:**
- `extractPosition()` - Parse position string
- `positionToFraction()` - Convert to 0.0-1.0
- `validatePositions()` - Check logic consistency

#### metrics-aggregator.ts
**Purpose:** Calculate final session metrics
**Responsibilities:**
- Sum chunk costs
- Count final encounters
- Calculate processing time
- Generate summary statistics

**Key Functions:**
- `aggregateMetrics()` - Combine chunk data
- `calculateCosts()` - Total API costs
- `generateReport()` - Final metrics report

## Migration Plan

### Phase 1: Foundation (Week 1)
1. Create v11 prompt
2. Modify session-manager for universal path
3. Update chunk-processor for cascade IDs
4. Simplify handoff-builder

### Phase 2: Reconciliation (Week 2)
1. Rewrite pending-reconciler
2. Implement cascade-manager
3. Update post-processor
4. Test with 142-page document

### Phase 3: Enhancement (Week 3)
1. Add position-extractor
2. Implement metrics-aggregator
3. Delete legacy scripts
4. Full integration testing

### Phase 4: Cleanup (Week 4)
1. Remove old prompts
2. Delete unused scripts
3. Update documentation
4. Production deployment

## Testing Requirements

Each modified script needs:
- Unit tests for new functions
- Integration tests with cascade flow
- Regression tests for existing features
- Performance benchmarks

## Dependencies to Check

Before deleting scripts:
- Check for imports in other modules
- Verify no database stored procedures reference them
- Ensure no Edge Functions depend on them
- Confirm no scheduled jobs use them