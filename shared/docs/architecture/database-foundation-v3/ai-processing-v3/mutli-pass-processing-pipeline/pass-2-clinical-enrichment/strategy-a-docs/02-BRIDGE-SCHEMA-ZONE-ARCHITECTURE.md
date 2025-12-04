# 02 - Bridge Schema Zone Architecture

**Created:** 2025-12-02
**Status:** Design
**Owner:** Xavier
**Related:** Pass 0.5 (safe-splits), Pass 1 (zone detection), Pass 2 (enrichment)

---

## Overview

Bridge schemas are token-heavy instruction sets that guide Pass 2 in extracting and enriching clinical entities. The challenge: Pass 2 likely requires an expensive, high-reasoning AI model because it's the "final determinator" of what enters the patient's permanent health profile.

**Goals:**
1. Minimize input tokens per Pass 2 API call (cost reduction)
2. Prevent instruction dilution (accuracy preservation)
3. Enable Pass 2 parallelization (speed/UX improvement)

**Solution:** Define "zones" so each Pass 2 API call receives only the relevant bridge schemas for that zone, not all schemas for the entire document.

---

## The Zone Hierarchy

From largest (most conservative) to smallest (most optimized):

| Level | Boundary | Defined By | Current Status |
|-------|----------|------------|----------------|
| Level 0 | Entire shell_file | Default | Fallback only |
| Level 1 | Encounter | Pass 0.5 `healthcare_encounters` | Active |
| Level 2 | Safe-split batch | Pass 0.5 `safe_split_points` | Active (encounters > 3 pages) |
| Level 3 | Bridge schema zone | Pass 1 AI detection | Disabled (`PASS1_DISABLE_ZONES=true`) |

**Current state:** We use Level 1-2. Level 3 is designed but disabled pending accuracy validation.

---

## The Core Concern: Context Limit & Instruction Dilution

### The Problem

What if a single page (or small 2-3 page single-encounter file) requires ALL bridge schemas?

**Risks:**
- **Context limit failure**: Total tokens (OCR + all bridge schemas) exceeds model limit
- **Instruction dilution**: Too many schemas = AI loses focus, accuracy degrades

### When This Becomes Critical

We don't yet know the exact size of bridge schemas (depends on final table/column requirements - to be scoped by end of this week). But we need contingency plans.

### Mitigation Strategies (in order of preference)

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| **A. Accept it** | If total tokens fit comfortably and accuracy holds | Small documents, few schemas triggered |
| **B. Increase safe-split frequency** | Tell Pass 0.5 to output more safe-split points (currently 1 per 3 pages) | If Level 2 batches are still too large |
| **C. Enable Level 3 zones** | Pass 1 defines intra-batch bridge schema zones | If B is insufficient |
| **D. Sequential schema calls** | Multiple Pass 2 calls per batch, each with subset of schemas | Last resort (slower, but guaranteed to fit) |

**Decision point:** Once bridge schema sizes are finalized, we can model worst-case token counts and determine which strategy is needed.

---

## Level 1-2: Current Implementation

### How It Works Now

```
Pass 0.5 Output:
  - healthcare_encounters (with Y-coordinate boundaries)
  - safe_split_points (for encounters > 3 pages)
        |
        v
Pass 1 Processing:
  - Processes one encounter (or safe-split batch)
  - Identifies which bridge schemas are needed for this batch
  - Outputs: entities + schema_types_needed[]
        |
        v
Pass 2 Processing:
  - Receives: batch OCR + encounter context package + relevant bridge schemas only
  - Does NOT receive schemas that weren't called for
```

### Safe-Split Frequency Configuration

Currently configured for ~1 safe-split per 3 pages. This is adjustable in Pass 0.5:

```
If bridge schema token load is too high:
  - Reduce to 1 per 2 pages
  - Or 1 per 1.5 pages (more aggressive)

Trade-off: More splits = more API calls = higher cost but smaller context per call
```

---

## Level 3: Bridge Schema Zones (Future)

### The Vision

Pass 1 goes deeper than safe-split batches, defining Y-coordinate zones within a batch:

```
Page 1 (single encounter, single batch):
  Y:100-400  = medications_zone (schema: medications)
  Y:450-800  = lab_results_zone (schema: lab_results)
  Y:850-1200 = conditions_zone (schema: conditions)
```

Each zone gets its own Pass 2 API call with only its specific bridge schema.

### Benefits

- **Smaller context per call**: One schema instead of three
- **Parallelization**: All zones process simultaneously
- **Prompt caching**: Same schema can be cached across zones

### Current Status

**Disabled:** `PASS1_DISABLE_ZONES=true` in Render environment variables.

**Existing infrastructure:** The `pass1_bridge_schema_zones` table already exists from original Pass 1 design. When we enable zones, Pass 1 will write to this table.

---

## The "Cut-Out" Problem

### The Risk

A zone boundary might separate related information that Pass 2 needs together.

**Example - Lab Results:**
```
Page spans Y:0-2000

Y:100  = "Collection Date: 15 Nov 2025"    <-- Context needed
Y:150  = "Ordering Physician: Dr. Smith"   <-- Context needed
...
Y:1800 = "HbA1c: 7.2%"                     <-- The actual result
Y:1850 = "Reference Range: 4.0-5.6%"       <-- Context needed
```

If Pass 1 defines the zone as Y:1750-1900 (just the results), Pass 2 loses:
- The collection date
- The ordering physician
- Potentially the reference range interpretation

### Mitigation Strategies

| Strategy | Description |
|----------|-------------|
| **Conservative zones** | Start with large, overlapping zones rather than tight boundaries |
| **Context extension** | Allow zones to extend beyond strict Y boundaries when related info detected |
| **Encounter context package** | Every zone receives the overarching encounter context (dates, providers, etc.) |
| **Merge when uncertain** | If Pass 1 AI is unsure, merge zones rather than risk cutting |
| **Prompt engineering** | Pass 1 prompt must explicitly instruct: "Include ALL related context in zone boundaries" |

### Pass 1 Prompt Requirements (Future)

When we enable Level 3 zones, the Pass 1 prompt must address:

1. **Completeness over precision**: "When defining a zone, include all contextual information needed to fully understand entities within that zone"
2. **Date/time awareness**: "Dates, times, and collection information must be included in the zone they apply to"
3. **Header inheritance**: "If a header at Y:100 applies to content at Y:500, the zone should start at Y:100"
4. **Overlap permission**: "Zones may overlap if information is relevant to multiple zones"
5. **Conservative fallback**: "If uncertain about zone boundaries, extend the zone or merge with adjacent zones"

---

## Pass 2 Parallelization

### With Level 1-2 (Current)

```
Shell file with 3 encounters:
  Encounter 1 (5 pages, 2 safe-split batches)
  Encounter 2 (2 pages, 1 batch)
  Encounter 3 (3 pages, 1 batch)

Pass 2 Processing:
  - 4 parallel API calls (one per batch)
  - Each receives batch-specific OCR + batch-specific schemas
  - Total time = slowest batch
```

### With Level 3 (Future)

```
Single encounter, single batch, but 3 bridge schema zones:
  Zone A: medications (Y:100-400)
  Zone B: lab_results (Y:450-800)
  Zone C: conditions (Y:850-1200)

Pass 2 Processing:
  - 3 parallel API calls (one per zone)
  - Each receives zone-specific OCR + single schema
  - Total time = slowest zone
```

---

## Integration Points

| Pass | Responsibility | Output |
|------|----------------|--------|
| Pass 0.5 | Define encounters + safe-split points | `healthcare_encounters`, `safe_split_points` |
| Pass 1 | Identify schemas needed per batch | `schema_types_needed[]` per batch |
| Pass 1 (future) | Define intra-batch zones | `pass1_bridge_schema_zones` table |
| Pass 2 | Enrich entities within zone context | Enriched clinical entities |

---

## Database: pass1_bridge_schema_zones

This table already exists from original Pass 1 design. Currently unused due to `PASS1_DISABLE_ZONES=true`.

**When enabled, Pass 1 writes:**

| Column | Purpose |
|--------|---------|
| `id` | Zone UUID |
| `encounter_result_id` | Links to Pass 1 encounter result |
| `schema_type` | Which bridge schema applies (e.g., 'medications', 'lab_results') |
| `y_start` | Zone start Y-coordinate |
| `y_end` | Zone end Y-coordinate |
| `page_number` | Page containing the zone |
| `confidence` | How confident Pass 1 is in zone boundaries |

---

## Phased Approach

### Phase 1: Current State
- Level 1-2 only (encounters + safe-splits)
- Pass 1 identifies schemas per batch, no intra-batch zones
- `PASS1_DISABLE_ZONES=true`

### Phase 2: Bridge Schema Sizing
- Finalize bridge schema token sizes (this week)
- Model worst-case scenarios: "What if a 1-page file needs all schemas?"
- Decide if Level 2 is sufficient or if we need more aggressive splitting

### Phase 3: Safe-Split Tuning (if needed)
- Increase Pass 0.5 safe-split frequency
- Test with real documents
- Find balance between context size and API call count

### Phase 4: Level 3 Zones (if needed)
- Enable `PASS1_DISABLE_ZONES=false`
- Implement Pass 1 prompt for zone detection
- Validate zone accuracy (watch for cut-out problems)
- Enable Pass 2 zone-based parallelization

---

## Open Questions

1. **Bridge schema sizes**: What's the token count for each schema? (To be determined this week)
2. **Model context limits**: Which Pass 2 model, and what's its effective context window?
3. **Safe-split trade-off**: What's the cost/accuracy trade-off of more frequent splits?
4. **Zone accuracy threshold**: How confident must Pass 1 be before we trust a zone boundary?

---

## Summary

| Aspect | Current | Future (if needed) |
|--------|---------|-------------------|
| **Zone granularity** | Encounter / safe-split batch | Intra-batch bridge schema zones |
| **Schemas per call** | All schemas for batch | One schema per zone |
| **Parallelization** | By batch | By zone (finer-grained) |
| **Pass 1 zones** | Disabled | Enable via `PASS1_DISABLE_ZONES=false` |
| **Cut-out risk** | Low (large batches) | Higher (requires careful prompt engineering) |

**Key insight:** Start conservative with Level 1-2. Only move to Level 3 if bridge schema token load proves problematic. The infrastructure exists - we just need to validate accuracy before enabling.
