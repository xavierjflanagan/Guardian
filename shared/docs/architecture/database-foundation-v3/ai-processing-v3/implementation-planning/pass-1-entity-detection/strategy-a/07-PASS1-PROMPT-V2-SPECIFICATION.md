# 07 - Pass 1 Prompt V2 Specification

**Date Created:** 2025-11-30
**Status:** Planning
**Purpose:** Define requirements for Pass 1 prompt v2 based on production testing results

---

## Executive Summary

Pass 1 v1 prompt is functional but produces suboptimal output due to a "mechanical" extraction approach. This specification defines the requirements for v2 based on real production data analysis.

**Key Metrics from 3-Page Test (Vincent Cheers):**
- 113 entities detected
- 18 bridge schema zones created
- ~10,000 output tokens
- 128 seconds processing time

**Key Problems Identified:**
1. 49 "conditions" detected, but ~39 are disease names from immunisation records (not patient conditions)
2. 10 of 18 zones are single-line (height = 1) - essentially useless point zones
3. Duplicate zones for same Y-range (immunisations AND conditions both span Y:580-1800)
4. High token cost due to entity inflation and zone fragmentation

---

## Problem Analysis

### Issue 1: Condition Entity Inflation

**Root Cause:** The AI treats every disease name as a condition, regardless of context.

**Example from production data:**
```
[Y:930] 23/05/2019 FluQuadri ( Influenza )
```
Current v1 output:
- Entity 1: `immunisation` = "FluQuadri" (CORRECT)
- Entity 2: `condition` = "Influenza" (INCORRECT - this is vaccine target, not patient condition)

**Impact:** 49 conditions detected, but only ~10 are actual patient conditions. The rest are vaccine targets extracted out of context.

**v2 Requirement:** Context-aware extraction. Disease names within immunisation records should NOT be extracted as separate condition entities.

---

### Issue 2: Fragmented Zones (Single-Line Zones)

**Root Cause:** The AI creates zones as tight bounding boxes around entities, not as semantic document sections.

**Example from production data:**
| Page | Schema Type | Y Range | Height | Problem |
|------|-------------|---------|--------|---------|
| 1 | observations | 820-821 | 1 | Single line "Nil known" |
| 1 | immunisations | 1660-1661 | 1 | Single line vaccine |
| 1 | procedures | 2000-2001 | 1 | Single line procedure |
| 2 | observations | 470-471 | 1 | Single line |

**Impact:** 10 of 18 zones are useless point zones. Pass 2 batch processing cannot use these effectively.

**v2 Requirement:** Zones should represent semantic document sections, not entity bounding boxes.

---

### Issue 3: Overlapping Duplicate Zones

**Root Cause:** The AI creates separate zones for each entity type in the same document section.

**Example from production data:**
- Page 2, Y:580-1800: `immunisations` zone (height 1220)
- Page 2, Y:580-1800: `conditions` zone (height 1220) - DUPLICATE RANGE

This happened because every immunisation line has both a vaccine name AND a disease name, creating two entity types in the same Y-range.

**Impact:** Redundant zones, confusion for Pass 2 processing.

**v2 Requirement:** One zone per semantic section. If an immunisation section contains disease names, they belong to the immunisation zone, not a separate condition zone.

---

## v1 vs v2 Philosophy Comparison

| Aspect | v1 "Mechanical" | v2 "Holistic" |
|--------|-----------------|---------------|
| **Goal** | Find keywords on lines | Digitize patient medical history |
| **Zones** | Clusters of Y-coordinates | Semantic document sections |
| **Entities** | Any medical term match | Clinical facts in context |
| **Behavior** | Isolated line processing | Context-aware section reading |
| **Disease names** | Always extract as condition | Only if actual patient condition |

---

## v2 Prompt Requirements

### R1: Clinical Expert Persona

**Current v1:**
```
You are a medical document reviewer that locates, extracts and classifies clinical entities and their locations from the uploaded document OCR text. Output minimal JSON only.
```

**v2 Requirement:**
The system message should establish the AI as a clinical data structurer who understands document semantics, not just a keyword scanner.

Key concepts to convey:
- Medical documents have logical sections (History, Medications, Immunisations, etc.)
- Context defines meaning (disease name in immunisation section != patient condition)
- The goal is to create a structured patient record, not a keyword dump

---

### R2: Section-Based Extraction (Two-Phase Task)

**Current v1:**
```
STEP 1 - LINE-BY-LINE EXTRACTION:
Read EVERY line of the document. For each line, determine:
- Does this line contain any clinical entities?
```

**v2 Requirement:**
Replace line-by-line scanning with section-based extraction:

**Phase 1: Identify Document Sections**
- First scan: Identify semantic sections (headers, visual groupings)
- Examples: "Current Medications:", "Immunisations:", "Active Past History:", "Prescriptions:"
- These sections become the basis for zones

**Phase 2: Extract Entities Within Sections**
- Extract entities with awareness of which section they belong to
- Apply context rules based on section type

---

### R3: Context Rules for Entity Classification

**v2 Requirement:** Explicit rules to prevent misclassification.

**Rule 1: Immunisation Section Context**
- Disease names inside immunisation records are vaccine targets, NOT patient conditions
- Extract only the vaccine name as `immunisation` entity
- Do NOT extract "Influenza", "COVID-19", "Hepatitis A" as separate conditions
- **Preserve Context:** Include the full line (e.g., "FluQuadri (Influenza)") in the `original_text` of the `immunisation` entity, but classify it ONLY as an `immunisation`.

**Rule 2: Allergy Section Context**
- "Nil known" or "No known allergies" = observation about allergy status
- NOT a condition entity

**Rule 3: Family History Context**
- Conditions listed in family history belong to relatives, NOT the patient
- May need different handling or exclusion

**Rule 4: Prescription Context**
- Each prescription entry = one medication entity
- Include dosage and instructions in original_text
- Do NOT extract disease names from "indication" fields as conditions

---

### R4: Zone Definition as Semantic Sections

**Current v1:**
```
A zone is a contiguous Y-range on a page where entities of the same type cluster.
```

**v2 Requirement:**
Redefine zones as semantic document sections:

**Zone Philosophy:**
- A zone represents a CLINICAL SECTION of the document
- It should capture the entire relevant area, including headers and whitespace
- Mental model: "If highlighting the 'Medications Section' with a pen, draw one box around the whole list"

**Zone Rules:**
- One zone per identifiable document section
- Zone spans from section header to start of next section (or page end)
- Include whitespace between items - they're part of the same section
- Do NOT create single-line zones for isolated entities
- Minimum zone height: ~100 Y-units (or contains 2+ entities)

**Zone Merging Guidance:**
- If entities of same type are within ~200 Y-units, consider them part of same zone
- A single isolated entity does NOT get its own zone - attach to nearest relevant zone or skip zone creation

---

### R5: Output Token Optimization

**Current Problem:** ~10,000 output tokens for 3 pages is expensive.

**v2 Requirement:** Reduce output size by:

1. **Fewer entities:** Stop extracting disease names from immunisation records (~30% reduction)
2. **Fewer zones:** Consolidate into semantic sections (~60% reduction in zone count)
3. **Shorter aliases:** Limit to 1-2 most common alternatives
4. **No redundant zones:** One zone per section, not per entity type

**Target:** <6,000 output tokens for a 3-page document with similar content density.

---

### R6: Maintain Extraction Completeness

**Critical Requirement:** v2 must NOT reduce extraction of actual clinical entities.

**Must still extract:**
- All medications (including from prescription sections)
- All actual patient conditions
- All immunisations (vaccine names only, not disease targets)
- All procedures and surgeries
- All observations and clinical findings
- All allergies

**Validation metric:** Compare entity counts by type between v1 and v2 on same document. Medications and immunisations should be similar. Conditions should be significantly lower (only real patient conditions).

---

## v2 Prompt Structure (Draft Outline)

```
SYSTEM MESSAGE:
"You are an expert Clinical Data Structurer. Your goal is to transform unstructured medical OCR text into a structured patient record. You understand that medical documents are organized into logical sections, and that context defines meaning."

USER PROMPT:

DOCUMENT OCR:
[OCR text with Y-coordinates]

TASK - TWO PHASE EXTRACTION:

PHASE 1 - IDENTIFY DOCUMENT SECTIONS:
Scan the document and identify semantic sections:
- Look for headers like "Current Medications:", "Immunisations:", "Past History:"
- Note the Y-range of each section
- These sections will become your zones

PHASE 2 - EXTRACT ENTITIES WITH CONTEXT:
For each section, extract clinical entities appropriate to that section type.

CONTEXT RULES:
1. IMMUNISATION SECTIONS: Extract vaccine names only. Disease names in parentheses (e.g., "Influenza" in "FluQuadri (Influenza)") are vaccine targets, NOT patient conditions.
2. ALLERGY SECTIONS: "Nil known" is an observation, not a condition.
3. PRESCRIPTION SECTIONS: Each script = one medication. Do not extract indications as conditions.
4. HISTORY SECTIONS: Extract conditions and procedures. Dates indicate when they occurred.

ZONE DEFINITION:
A zone is a SEMANTIC SECTION, not a bounding box.
- Span the entire section from header to next section
- Include whitespace between items
- Do NOT create single-line zones
- Minimum meaningful zone: 2+ entities OR >100 Y-unit range

ENTITY TYPES: [list]

OUTPUT JSON:
{
  "entities": [...],
  "bridge_schema_zones": [...]
}
```

---

## Validation Plan

### Test 1: Same Document Comparison
Run v1 and v2 on the same 3-page Vincent Cheers document.

**Expected Results:**
| Metric | v1 Actual | v2 Target |
|--------|-----------|-----------|
| Medication entities | 23 | ~23 (same) |
| Immunisation entities | 34 | ~34 (same) |
| Condition entities | 49 | ~10-15 (only real conditions) |
| Total entities | 113 | ~70-80 |
| Zones | 18 | ~6-8 |
| Single-line zones | 10 | 0 |
| Output tokens | ~10,000 | ~5,000-6,000 |

### Test 2: Entity Accuracy Audit
Manual review of condition entities to verify:
- All real patient conditions are captured
- No disease names from immunisation records are included
- No family history conditions are included as patient conditions

### Test 3: Zone Usefulness
Verify zones are actionable for Pass 2:
- Each zone covers a meaningful document section
- Zone Y-ranges can be used to slice OCR text for parallel processing
- No overlapping zones of different types for same Y-range

---

## Implementation Notes

### File Location
New prompt file: `apps/render-worker/src/pass1-v2/pass1-v2-prompt-v2.ts`

### Backward Compatibility
- Keep v1 prompt available for A/B testing
- Add version flag to detector configuration
- Log prompt version in metrics for comparison

### Rollout Strategy
1. Implement v2 prompt
2. Run on test documents with both v1 and v2
3. Compare metrics and accuracy
4. If v2 meets targets, switch production to v2
5. Monitor for regression in entity extraction

---

## Open Questions

1. **Family History:** Should conditions in family history be extracted with a different entity type or excluded entirely?

2. **Prescription Indications:** Some prescriptions include "for [condition]" - should these be extracted as conditions or ignored?

3. **Zone Granularity:** Should we have a minimum entity count for zone creation, or allow zones based on section headers alone?

4. **Multi-Page Sections:** If a medication list spans pages 3-4, should it be one zone or two (one per page)?
   *   **Decision:** It MUST be two zones. The `bridge_schema_zones` table structure requires a single integer `page_number` per zone. A section spanning multiple pages must be split into separate zones for each page (e.g., "Medications" zone on Page 3, "Medications" zone on Page 4).

---

## Appendix: Sample Output Comparison

### v1 Output (Current)
```json
{
  "entities": [
    {"id": "e1", "original_text": "FluQuadri", "entity_type": "immunisation", "y_coordinate": 930},
    {"id": "e2", "original_text": "Influenza", "entity_type": "condition", "y_coordinate": 930},
    {"id": "e3", "original_text": "Pfizer Comirnaty", "entity_type": "immunisation", "y_coordinate": 1420},
    {"id": "e4", "original_text": "COVID - 19", "entity_type": "condition", "y_coordinate": 1420}
  ],
  "bridge_schema_zones": [
    {"schema_type": "immunisations", "y_start": 580, "y_end": 1800, "page_number": 2},
    {"schema_type": "conditions", "y_start": 580, "y_end": 1800, "page_number": 2}
  ]
}
```

### v2 Output (Target)
```json
{
  "entities": [
    {"id": "e1", "original_text": "FluQuadri (Influenza)", "entity_type": "immunisation", "y_coordinate": 930},
    {"id": "e2", "original_text": "Pfizer Comirnaty (COVID-19)", "entity_type": "immunisation", "y_coordinate": 1420}
  ],
  "bridge_schema_zones": [
    {"schema_type": "immunisations", "y_start": 550, "y_end": 1810, "page_number": 2}
  ]
}
```

**Improvement:**
- 4 entities reduced to 2 (disease names included in immunisation text, not separate)
- 2 zones reduced to 1 (single immunisation section, not duplicate zones)
- Output tokens reduced by ~50%

---

## Related Documents

- `06-AI-MODEL-SWITCHING-SYSTEM.md` - Model configuration
- `pass1-v2-prompt.ts` - Current v1 prompt implementation
- `PASS1-STRATEGY-A-MASTER.md` - Overall Pass 1 strategy








old prompt 1st december 2025

TASK: Identify and extract every clinical entity from this document.

STEP 1 - LINE-BY-LINE EXTRACTION:
Read EVERY line of the document. For each line, determine:
- Does this line contain any clinical entities?
- If yes, extract ALL clinical entities with their exact text, entity_type, page_number, and y_coordinate
`;

  // Only add zone instructions if includeZones is true
  if (includeZones) {
    prompt += `
STEP 2 - GROUP INTO ZONES:
After extracting all entities, group them into bridge_schema_zones to help with downstream parallel batch processing.
A zone is a contiguous Y-range on a page where entities of the same type cluster.
`;
  }

  prompt += `
ENTITY TYPES: ${entityTypesList}

EXTRACTION RULES:
- A clinical entity is ANY mention of a medication, condition, disease, procedure, immunisation, allergy, test result, vital measurement, or clinical observation - essentially anything that is a clinical event, clinical fact or clinical context.
- Read every line - entities may be scattered throughout without section headers
- DO NOT DEDUPLICATE: If the same medication/vaccine appears on 5 different lines, output 5 separate entities with different y_coordinates
- Each line that contains clinical entities = at least one entity in your output (even if the clinical entity is listed on other lines)
- Extract the EXACT text as it appears in the document for original_text
- Use y_coordinate from the [Y:###] marker for that line
- When uncertain whether something is a clinical entity, include it
- Aliases: 1-3 common alternatives for medical code lookup (SNOMED, RxNorm, LOINC)

COMMON PATTERNS TO RECOGNIZE:
- "Prescriptions:" or "Script date:" sections contain medications
- Immunisation records often have format: "DATE Vaccine Name (Disease)"
- Past History sections contain conditions AND procedures
- Lines with "mg", "mcg", "mL", "Tablet", "Capsule", "Injection" are likely medications or immunisations
- Lines with dates followed by medical terms are likely clinical events`;