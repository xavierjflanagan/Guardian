# 07b - Pass 1 Prompt V3: Patient Context Approach

**Date:** 2025-12-01
**Status:** Draft for Review
**Follows:** 07-PASS1-PROMPT-V2-SPECIFICATION.md

---

## Key Insight

The v1 prompt treats documents as "bags of medical words". The AI correctly follows instructions to "extract every clinical entity" - including disease names from vaccine records.

**The AI is not wrong. The prompt is.**

---

## Core Problem

v1 prompt philosophy:
> "Extract every clinical entity from this document"

What we actually need:
> "Extract clinical facts ABOUT THIS PATIENT from their medical record"

---

## V3 Changes

### 1. Patient-Centric Framing

| Aspect | v1 | v3 |
|--------|----|----|
| Framing | "Extract clinical entities" | "Extract facts about this patient" |
| Context | Document is text to scan | Document is patient's record |
| Entities | Any medical term | Only things true of the patient |

### 2. Zones Disabled (Toggle)

- `PASS1_DISABLE_ZONES=true` now active
- Entity-only extraction for testing
- Zones can be derived post-AI from entity Y-coordinates (see 08-POST-AI-ZONE-DERIVATION-SYSTEM.md)

### 3. Context Rules (Negative Examples)

Tell AI what NOT to extract:

| Context | Do NOT Extract | Why |
|---------|----------------|-----|
| Immunisation "(Disease)" | Disease as condition | Vaccine target, not diagnosis |
| "No evidence of X" | X as condition | Negation = patient doesn't have it |
| "low risk of X" | X as condition | Risk assessment, not diagnosis |
| Family History | Conditions | Belong to relatives |
| Allergy "Nil known" | As condition | Observation about allergies |

---

## Single-Page Test Results (gemini-2.5-flash-lite, zones disabled)

| Page | Entities | Problem |
|------|----------|---------|
| 1 | 19 | 1 fragment ("inhalation" split from Breo Ellipta) |
| 2 | 96 | 44 false positive conditions from immunisation section |
| 3 | 14 | Clean - all medications correctly extracted |
| **Total** | **129** | **~80% of conditions are false positives** |

---

## V3 Draft Prompt

### System Message (Confirmed: IS used by Pass 1)

Pass 1 calls `provider.generateJSON(userPrompt, { systemMessage })` at line 549 of `Pass1Detector.ts`.
Google provider passes this as `systemInstruction` (line 41 of `google-provider.ts`).

```
You are reviewing a patient's medical record. Your task is to extract clinical facts that are TRUE OF THIS PATIENT - their conditions, their medications, their procedures, their immunisations.

Medical documents contain many medical terms that are NOT facts about the patient:
- Vaccine names include diseases they prevent (not patient diagnoses)
- Negation phrases rule OUT conditions (patient does NOT have them)
- Family history describes relatives (not this patient)
- Side effect warnings are potential risks (not confirmed conditions)

Extract only what belongs in this patient's structured health record.
```

### User Prompt

```
PATIENT MEDICAL RECORD (OCR with Y-coordinates):
${ocrText}

TASK: Extract clinical facts about THIS PATIENT.

ENTITY TYPES: medication, condition, procedure, immunisation, allergy, lab_result, vital_sign, observation

WHAT TO EXTRACT:
- Conditions the patient HAS (diagnoses in history sections)
- Medications the patient TAKES (current medications, prescriptions)
- Procedures the patient HAD (surgeries, treatments performed on them)
- Immunisations the patient RECEIVED (vaccines administered)
- Allergies the patient HAS
- Lab results, vitals, observations about the patient

WHAT NOT TO EXTRACT:
- Disease names in vaccine records: "Stamaril (Yellow Fever)" -> extract "Stamaril" as immunisation, NOT "Yellow Fever" as condition
- Negated conditions: "No evidence of kidney disease" -> do NOT extract "kidney disease"
- Risk assessments: "low risk of prostatic neoplasia" -> do NOT extract "prostatic neoplasia"
- Family history: conditions listed under family history belong to relatives
- "Nil known" in allergy section: this is an observation that patient has no known allergies

EXTRACTION RULES:
- Use the EXACT text from the document for original_text
- Record the Y-coordinate from the [Y:###] marker
- Include 1-2 aliases for medical code lookup (SNOMED, RxNorm)
- If the same medication appears on multiple lines (different dates), extract each occurrence separately

OUTPUT JSON:
{
  "entities": [
    {
      "id": "e1",
      "original_text": "Metformin 500mg Tablet",
      "entity_type": "medication",
      "aliases": ["metformin hydrochloride", "Glucophage"],
      "y_coordinate": 1350,
      "page_number": 1
    },
    {
      "id": "e2",
      "original_text": "Type 2 Diabetes",
      "entity_type": "condition",
      "aliases": ["diabetes mellitus type 2", "T2DM"],
      "y_coordinate": 1890,
      "page_number": 1
    },
    {
      "id": "e3",
      "original_text": "Aortic valve replacement",
      "entity_type": "procedure",
      "aliases": ["AVR", "aortic valve surgery"],
      "y_coordinate": 2000,
      "page_number": 1
    },
    {
      "id": "e4",
      "original_text": "FluQuadri (Influenza)",
      "entity_type": "immunisation",
      "aliases": ["influenza vaccine", "flu shot"],
      "y_coordinate": 930,
      "page_number": 2
    },
    {
      "id": "e5",
      "original_text": "Penicillin",
      "entity_type": "allergy",
      "aliases": ["penicillin allergy", "PCN allergy"],
      "y_coordinate": 820,
      "page_number": 1
    }
  ]
}

Note: e4 shows correct immunisation handling - include "(Influenza)" in original_text but classify as immunisation, NOT as a separate condition entity.

Output ONLY valid JSON. No explanations.
```

---

## Expected Impact

| Metric | v1 (Current) | v3 (Target) |
|--------|--------------|-------------|
| Conditions extracted | 54 | ~10 (real diagnoses only) |
| False positive rate | ~80% | <5% |
| Immunisations | 34 | 34 (unchanged) |
| Medications | 27 | 27 (unchanged) |
| Output tokens | ~6,000 | ~3,000 |

---

## Test Plan

1. Apply v3 prompt to pass1-v2-prompt.ts
2. Re-upload 3 single pages with gemini-2.5-flash-lite
3. Compare entity counts, especially conditions
4. Verify no loss of real clinical entities

---

## Decision: Zone Extraction

Zones will be handled by post-AI derivation (08-POST-AI-ZONE-DERIVATION-SYSTEM.md):
- Entities have Y-coordinates
- Group entities by type per page
- Calculate zone boundaries from entity positions
- Deterministic, no AI hallucination

Toggle: `PASS1_DISABLE_ZONES=true` (currently active)
