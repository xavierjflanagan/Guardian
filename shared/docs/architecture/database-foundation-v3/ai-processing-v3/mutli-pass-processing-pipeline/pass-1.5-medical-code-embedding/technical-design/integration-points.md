# Integration Points

**Purpose:** Pass 1 → 1.5 → Pass 2 handoff specifications

**Status:** Core decisions documented, full implementation spec pending

**Created:** 2025-10-14

---

## Pass 1 → Pass 1.5 Input

**Source Table:** `entity_processing_audit`

**Required Fields:**
```typescript
interface Pass15Input {
  id: UUID;                              // entity_id (for lineage tracking)
  entity_subtype: string;                 // 'medication', 'diagnosis', 'vital_sign', etc.
  original_text: string;                  // AI-curated clean entity text
  ai_visual_interpretation: string | null; // AI's contextual interpretation
  visual_formatting_context: string | null; // Formatting context
  patient_id: UUID;                       // For RLS and Australian context detection
  entity_category: string;                // 'clinical_event', 'healthcare_context', 'document_structure'
}
```

**Smart Entity-Type Strategy for Embedding Text:**
```typescript
function getEmbeddingText(entity: Pass15Input): string {
  const subtype = entity.entity_subtype;

  // Medications/Immunizations: Standardized format only
  if (['medication', 'immunization'].includes(subtype)) {
    return entity.original_text;
  }

  // Diagnoses/Conditions/Allergies: Maximum clinical context
  if (['diagnosis', 'allergy', 'symptom'].includes(subtype)) {
    // Prefer AI interpretation (often expands abbreviations)
    if (entity.ai_visual_interpretation &&
        entity.ai_visual_interpretation !== entity.original_text) {
      return entity.ai_visual_interpretation;
    }
    return entity.original_text;
  }

  // Vital Signs/Labs: Need measurement type context
  if (['vital_sign', 'lab_result', 'physical_finding'].includes(subtype)) {
    const parts = [entity.original_text];
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

  // Healthcare Context: Exact identifiers
  if (['patient_identifier', 'provider_identifier', 'facility_identifier'].includes(subtype)) {
    return entity.original_text;
  }

  // Default: original_text
  return entity.original_text;
}
```

**Rationale:** Different medical code systems expect different text formats. AI's dual-input model provides both standardized text and contextual interpretation.

---

## Pass 1.5 → Pass 2 Output

**Code Candidate Selection Strategy:**

**Hard Limits:**
- MIN_CANDIDATES: 5 (unless fewer exist)
- MAX_CANDIDATES: 20 (token cost control)

**Confidence Thresholds:**
- AUTO_INCLUDE: similarity >= 0.85
- MIN_SIMILARITY: 0.60 (reject below this)
- TARGET: 10 candidates (flex 5-20 based on quality)

**Output Format:**
```typescript
interface CodeCandidate {
  code_system: string;       // 'rxnorm', 'snomed', 'loinc', 'pbs', 'mbs'
  code_value: string;
  display_name: string;
  similarity_score: number;  // 0.60-1.00
  code_type: 'universal' | 'regional';
  country_code?: string;     // For regional codes (e.g., 'AUS')
}
```

---

## PLACEHOLDER SECTIONS

**To be completed:**
- Complete API function signatures
- Error handling and fallback strategies
- Worker coordination logic
- Performance monitoring hooks

---

**Reference:** See `../../V3_Features_and_Concepts/medical-code-resolution/pass-integration.md` for integration flow.

---

**Last Updated:** 2025-10-14
**Status:** Core decisions documented
