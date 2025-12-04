# 06 - AI Output Token Optimization

**Created:** 2025-12-03
**Status:** Design Consideration
**Owner:** Xavier

---

## Overview

Pass 2 uses an expensive, high-reasoning AI model. Output tokens are costly. We must minimize what the AI outputs by having it return only information it uniquely knows - clinical content - while server-side functions add everything else.

---

## The Principle

**AI outputs only what it discovers. Server adds what it already knows.**

| Source | Who Provides |
|--------|--------------|
| Clinical content (medication name, dosage, condition) | AI |
| Spatial anchor (Y-coordinate) | AI |
| patient_id | Server (from batch context) |
| encounter_id | Server (from batch context) |
| shell_file_id | Server (from batch context) |
| UUIDs (hub id, spoke id) | Server (generated) |
| Timestamps (created_at) | Server (generated) |
| Processing flags (ai_extracted = true) | Server (constant) |

---

## What AI Should NOT Output

| Field | Why Not |
|-------|---------|
| `patient_id` | Known from batch context |
| `encounter_id` | Known from batch context |
| `shell_file_id` | Known from batch context |
| `hub_id` / `event_id` | Generated server-side after AI response |
| `spoke_id` | Generated server-side after AI response |
| `created_at` / `updated_at` | Server timestamps |
| `ai_extracted` | Always `true` for Pass 2 output |
| `source_page_number` | Derivable from Y-coordinate + batch metadata |

---

## What AI SHOULD Output

Only the clinical extraction content:

```json
{
  "medications": [
    {
      "y_anchor": 450,
      "medication_name": "Lisinopril",
      "generic_name": "Lisinopril",
      "strength": "10mg",
      "frequency": "daily",
      "route": "oral",
      "indication": "Hypertension",
      "status": "active",
      "ai_confidence": 0.95
    }
  ],
  "conditions": [
    {
      "y_anchor": 380,
      "condition_name": "Essential Hypertension",
      "clinical_status": "active",
      "onset_date": "2020-03-15",
      "ai_confidence": 0.92
    }
  ]
}
```

No IDs. No encounter/patient references. Just clinical content + spatial anchor.

---

## The Schema Design Question

How should bridge schemas be structured for the AI?

### Option A: Separate Hub + Spoke Schemas

AI receives two schemas and outputs nested structure:

```json
{
  "entities": [
    {
      "hub": { "activity_type": "intervention", "event_description": "..." },
      "spoke": { "medication_name": "...", "strength": "..." }
    }
  ]
}
```

**Pros:** Clear separation, reusable hub schema
**Cons:** More input tokens, AI must understand relationship

### Option B: Amalgamated Schema (Hub + Spoke Combined)

AI receives one schema with all fields:

```json
{
  "medications": [
    {
      "activity_type": "intervention",
      "event_description": "Lisinopril 10mg daily",
      "medication_name": "Lisinopril",
      "strength": "10mg"
    }
  ]
}
```

**Pros:** Single schema, simpler output
**Cons:** Hub fields repeated in each schema type

### Option C: Spoke-Only Schema (Recommended for Consideration)

AI receives spoke schema only. Hub fields derived server-side:

```json
{
  "medications": [
    {
      "y_anchor": 450,
      "medication_name": "Lisinopril",
      "strength": "10mg",
      "frequency": "daily"
    }
  ]
}
```

Server derives:
- `activity_type`: 'intervention' (medications are always interventions)
- `event_description`: Concatenate key fields

**Pros:** Minimum output tokens, AI focuses on clinical content
**Cons:** Server must derive hub fields, may be less natural

---

## Decision Pending

The exact schema structure will be determined during Phase 1 table triage when we audit columns for each table. Key questions to resolve:

1. **Hub field derivation** - Can `event_description` and `activity_type` always be derived from spoke data?

2. **Activity type mapping** - Is it deterministic?
   - medications -> intervention
   - conditions -> observation
   - vitals -> observation
   - immunizations -> intervention
   - etc.

3. **What about edge cases?** - Entities that don't fit neatly into one spoke type

---

## Post-AI Processing Flow

Regardless of schema approach, the server-side function does:

```typescript
function processPass2Response(aiOutput: Pass2Output, context: BatchContext) {
  for (const medication of aiOutput.medications) {
    // 1. Create hub record
    const hubId = await db.insert('patient_clinical_events', {
      id: generateUUID(),                    // Server generated
      patient_id: context.patientId,         // From context
      encounter_id: context.encounterId,     // From context
      shell_file_id: context.shellFileId,    // From context
      activity_type: 'intervention',         // Derived from entity type
      event_description: deriveDescription(medication),
      ai_extracted: true,                    // Constant
      ai_confidence: medication.ai_confidence,
      // ... other fields
    });

    // 2. Create spoke record
    await db.insert('patient_medications', {
      id: generateUUID(),                    // Server generated
      event_id: hubId,                       // Links to hub
      patient_id: context.patientId,         // From context (must match hub)
      medication_name: medication.medication_name,
      strength: medication.strength,
      frequency: medication.frequency,
      // ... all AI-extracted spoke fields
    });
  }
}
```

---

## Token Savings Estimate

Assuming 50 entities per document:

| Field | Tokens/Entity | Total Saved |
|-------|---------------|-------------|
| patient_id (UUID) | ~40 | 2,000 |
| encounter_id (UUID) | ~40 | 2,000 |
| shell_file_id (UUID) | ~40 | 2,000 |
| hub_id (UUID) | ~40 | 2,000 |
| spoke_id (UUID) | ~40 | 2,000 |
| created_at (ISO timestamp) | ~25 | 1,250 |
| ai_extracted (boolean) | ~5 | 250 |
| **Total saved per document** | | **~11,500 tokens** |

At $0.06/1K output tokens (GPT-4 class), that's ~$0.69 saved per document.

---

## Related Considerations

### Y-Anchor for Bounding Box Derivation

Instead of outputting full bounding boxes (4 coordinates), AI outputs single Y-anchor:

```json
{ "y_anchor": 450, "medication_name": "Lisinopril" }
```

Post-AI function cross-references with OCR data to derive full bounding box. This reduces output tokens by ~75% for spatial data.

### Confidence Scores

AI should still output `ai_confidence` per entity - this is information only the AI knows based on its extraction certainty.

---

**Last Updated:** 2025-12-03
