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
  entity_id: UUID;              // For lineage tracking
  entity_subcategory: string;   // 'medication', 'condition', 'observation', etc.
  entity_text: string;          // Raw extracted text
  normalized_entity: string;    // Cleaned/standardized text
  patient_id: UUID;             // For Australian context detection
}
```

**Embedding Text Strategy:**
- Medications: Use `normalized_entity` (standardized dose format)
- Conditions: Use `entity_text` (preserve clinical nuance)
- Observations: Combine both for maximum context
- Default: Concatenate both fields

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
