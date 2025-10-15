# Vector Search Architecture

**Purpose:** Core technical design for vector similarity search

**Status:** Key decisions documented, implementation details pending

**Created:** 2025-10-14

---

## Embedding Text Selection Strategy

**Smart Entity-Type Approach:**

```typescript
interface Pass1EntityInput {
  entity_subtype: string;
  original_text: string;
  ai_visual_interpretation: string | null;
  visual_formatting_context: string | null;
}

function getEmbeddingText(entity: Pass1EntityInput): string {
  const subtype = entity.entity_subtype;

  // Medications/Immunizations: AI-cleaned, standardized format
  if (['medication', 'immunization'].includes(subtype)) {
    return entity.original_text;
  }

  // Diagnoses/Conditions/Allergies: Prefer expanded clinical context
  if (['diagnosis', 'allergy', 'symptom'].includes(subtype)) {
    // Use AI interpretation if it provides additional context
    if (entity.ai_visual_interpretation &&
        entity.ai_visual_interpretation !== entity.original_text) {
      return entity.ai_visual_interpretation;
    }
    return entity.original_text;
  }

  // Vital Signs/Labs/Findings: Add measurement context
  if (['vital_sign', 'lab_result', 'physical_finding'].includes(subtype)) {
    const parts = [entity.original_text];
    // Add formatting context if meaningful (not generic "standard text")
    if (entity.visual_formatting_context &&
        !entity.visual_formatting_context.includes('standard text')) {
      parts.push(entity.visual_formatting_context);
    }
    return parts.join(' ').trim();
  }

  // Procedures: Use expanded descriptions when available
  if (subtype === 'procedure') {
    if (entity.ai_visual_interpretation &&
        entity.ai_visual_interpretation.length > entity.original_text.length) {
      return entity.ai_visual_interpretation;
    }
    return entity.original_text;
  }

  // Healthcare Context Identifiers: Use exact text
  if (['patient_identifier', 'provider_identifier', 'facility_identifier'].includes(subtype)) {
    return entity.original_text;
  }

  // Safe default: original_text
  return entity.original_text;
}
```

**Rationale:**
- **Medications:** RxNorm/PBS codes use standardized formats (AI's `original_text` already cleaned)
- **Conditions:** SNOMED/ICD codes often match expanded descriptions better (AI's `ai_visual_interpretation` expands abbreviations like "T2DM" → "Type 2 Diabetes Mellitus")
- **Vital Signs:** LOINC codes include measurement context (combining `original_text` + `visual_formatting_context` provides full picture)
- **Leverages dual-input:** Pass 1 AI processes both raw image and OCR, giving us both clean text and contextual interpretation

---

## Candidate Selection Algorithm

**Hybrid Approach with Confidence Thresholds:**

```typescript
interface CandidateSelectionConfig {
  MIN_CANDIDATES: 5;      // Always provide at least 5 (unless fewer exist)
  MAX_CANDIDATES: 20;     // Never exceed 20 (token cost control)

  AUTO_INCLUDE_THRESHOLD: 0.85;  // Always include if similarity >= 0.85
  MIN_SIMILARITY: 0.60;           // Never include if similarity < 0.60

  TARGET_CANDIDATES: 10;  // Aim for 10, flex based on confidence
}

async function selectCodeCandidates(
  vectorSearchResults: RawCandidate[]
): Promise<CodeCandidate[]> {
  // Step 1: Filter out low similarity (< 0.60)
  const filtered = vectorSearchResults.filter(c => c.similarity >= 0.60);

  // Step 2: Auto-include high confidence (>= 0.85)
  const highConfidence = filtered.filter(c => c.similarity >= 0.85);

  // Step 3: Fill to target of 10
  const remaining = filtered.filter(c => c.similarity < 0.85);
  const toInclude = Math.max(10 - highConfidence.length, 0);
  const additional = remaining.slice(0, toInclude);

  // Step 4: If many good matches (>= 0.75), include up to 20 total
  const goodMatches = filtered.filter(c => c.similarity >= 0.75);
  const finalList = goodMatches.length > 10
    ? goodMatches.slice(0, 20)
    : [...highConfidence, ...additional];

  // Step 5: Ensure minimum of 5 (if available)
  return finalList.length < 5 && filtered.length >= 5
    ? filtered.slice(0, 5)
    : finalList;
}
```

**Benefits:**
- Token cost control (hard cap at 20)
- Quality guarantee (min 0.60 threshold)
- Flexibility (5-20 based on match quality)
- Always provides options (min 5 if available)

---

## PLACEHOLDER SECTIONS

**To be completed:**
- pgvector index configuration
- OpenAI API integration details
- Caching layer design
- Performance tuning parameters
- Fork-style parallel search (universal + regional codes)

---

**Last Updated:** 2025-10-14
**Status:** Key decisions documented
