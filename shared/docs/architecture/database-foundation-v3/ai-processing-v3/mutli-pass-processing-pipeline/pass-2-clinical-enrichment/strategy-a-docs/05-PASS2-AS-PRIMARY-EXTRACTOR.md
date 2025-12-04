# 05 - Pass 2 as Primary Extractor

**Created:** 2025-12-03
**Status:** Architectural Foundation
**Owner:** Xavier

---

## Overview

In Strategy-A, Pass 2 is the **primary clinical extraction engine**. It discovers AND enriches clinical entities in a single step, writing directly to the hub-and-spoke database.

This is a significant shift from the original design where Pass 1 detected entities and Pass 2 enriched them.

---

## The Shift

### Old Model (Archived)

```
Pass 1: Entity Detection
  - Scans document
  - Outputs list of entities with categories
  - Stores in entity_processing_audit / pass1_entity_detections
       |
       v
Pass 2: Entity Enrichment
  - Receives entity list from Pass 1
  - Enriches each pre-detected entity
  - Writes to hub-and-spoke tables
```

**Problems with old model:**
- What if Pass 1 misses an entity? Pass 2 can't extract it.
- Entity handoff between passes adds complexity
- Two AI calls touching the same content
- Intermediate tables (entity_processing_audit) add overhead

### New Model (Strategy-A)

```
Pass 1: Schema Router
  - Scans batch
  - Outputs: schema_types_needed[] (e.g., ['medications', 'conditions'])
  - Does NOT output individual entities
       |
       v
Pass 2: Discovery + Enrichment
  - Receives: OCR batch + relevant bridge schemas + encounter context
  - Discovers ALL clinical entities matching those schema types
  - Extracts full enrichment data
  - Writes directly to hub-and-spoke tables
```

**Benefits of new model:**
- Pass 2 has full autonomy to find everything
- No risk of Pass 1 missing entities
- Simpler data flow (no entity handoff)
- Fewer tables to maintain
- Pass 1 can be much cheaper (just routing, not extracting)

---

## Pass 1's New Role: Schema Router

Pass 1 becomes a lightweight triage pass:

**Input:**
- OCR batch (encounter or safe-split segment)

**Output:**
```json
{
  "schema_types_needed": ["patient_medications", "patient_conditions", "patient_vitals"],
  "bridge_schema_zones": [  // Future L3 - currently disabled
    {"schema": "patient_medications", "y_start": 100, "y_end": 400, "page": 1},
    {"schema": "patient_conditions", "y_start": 450, "y_end": 700, "page": 1}
  ]
}
```

**What Pass 1 does NOT output:**
- Individual entity text
- Entity bounding boxes
- Entity categories
- Confidence scores per entity

**Implications:**
- Pass 1 can use a cheaper, faster model
- Pass 1 prompt is much simpler
- Pass 1 accuracy requirements are lower (just identify schema types)

---

## Pass 2's Expanded Role

Pass 2 now handles:

1. **Discovery** - Find all clinical entities in the batch
2. **Classification** - Determine entity type (medication, condition, vital, etc.)
3. **Enrichment** - Extract all structured fields per bridge schema
4. **Database write** - Create hub + spoke records

**Input:**
- OCR batch (text + spatial coordinates)
- Encounter context (encounter_id, patient_id, shell_file_id)
- Relevant bridge schemas (only those identified by Pass 1)

**Output:**
- Structured clinical data per schema type
- Y-anchor coordinates for bounding box derivation

---

## Pipeline Flow

```
Pass 0.5: OCR + Encounter Discovery + Safe-splits
    |
    | healthcare_encounters created
    | safe_split_points defined
    |
    v
Pass 1: Schema Router
    |
    | For each batch:
    |   - Identify schema_types_needed[]
    |   - (Future) Define bridge_schema_zones[]
    |
    v
Pass 2: Discovery + Enrichment
    |
    | For each batch:
    |   - Receive OCR + schemas + encounter context
    |   - Discover all entities matching schema types
    |   - Extract enrichment data
    |   - Write hub + spoke records
    |
    v
Pass 2.5: Medical Code Assignment
    |
    | For hub records without codes:
    |   - Agentic Waterfall (Primary/Secondary/Tertiary)
    |   - Write to medical_code_assignments
    |
    v
Pass 3: Narrative Generation (Future)
```

---

## Obsolete Tables

These tables were designed for entity handoff and are no longer needed:

| Table | Original Purpose | Status |
|-------|------------------|--------|
| `entity_processing_audit` | Track Pass 1 entities | OBSOLETE |
| `pass1_entity_detections` | Store Pass 1 entities | OBSOLETE |

**Tables that remain:**
- `pass1_bridge_schema_zones` - For future L3 zone detection
- `pass1_entity_metrics` - Repurpose for schema routing metrics

---

## Why This Works Better

1. **Single source of extraction** - Pass 2 (expensive, high-reasoning model) is the authority on what entities exist

2. **No handoff errors** - No risk of Pass 1/Pass 2 disagreement on entity boundaries

3. **Simpler schema design** - Bridge schemas describe extraction, not enrichment of pre-detected items

4. **Cost optimization via routing** - Pass 1 just figures out which schemas to load, reducing Pass 2's token input

5. **Parallelization preserved** - Batches still process in parallel; zones enable finer-grained parallelism

---

## Bridge Schema Implications

Bridge schemas now guide **discovery** not just enrichment:

**Old approach:**
> "Here is entity X. Enrich it with these fields."

**New approach:**
> "Find all medications in this OCR. For each one, extract these fields."

The schema tells Pass 2 both WHAT to look for and HOW to structure the output.

---

**Last Updated:** 2025-12-03
