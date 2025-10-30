# Auto-Generated Procedure Registry Design

**Date:** October 23, 2025
**Status:** PROPOSAL - Design Phase
**Scope:** Procedure entities only (surgeries, examinations, diagnostic tests)
**Purpose:** Replace MBS billing codes with clinical concept identification system

---

## Problem Statement

### Why MBS Failed for Exora's Use Case

**MBS Design Intent:** Medicare billing and reimbursement optimization
- Multiple codes for same procedure based on billing modifiers
- Example: Cholecystectomy has 3+ codes (with/without cholangiogram, with/without stone removal)
- Granularity serves financial disputes, not clinical identification

**Exora's Actual Need:** Clinical concept identification for patient health records
- Question: "Did patient have cholecystectomy?" → Binary yes/no
- Don't care about billing modifiers (cholangiogram status, stone removal)
- Need: **One concept = one identifier**

**Critical Insight from Experiment 6:**
- Entity text: "Cholecystectomy"
- Expected match: MBS 30443 (basic cholecystectomy without cholangiogram)
- Algorithm returned: MBS 30445 (#9) and 30448 (#10) - specialized billing variants
- Result: Marked as "success" but actually missed the most general/appropriate code
- **Root cause:** Using billing codes for clinical concept matching

---

## Proposed Solution: Dual-Track Approach

### Option A: SNOMED CT Integration (Reference Standard)

**SNOMED CT (Systematized Nomenclature of Medicine - Clinical Terms)**

**Why SNOMED:**
- Purpose-built for clinical terminology and EHR systems
- One concept per clinical entity (not billing variants)
- ~350,000 concepts vs MBS ~6,000 items
- Part of Australia's National Clinical Terminology Service
- Free for Australian use (SNOMED International member)

**Example Comparison:**
```
Clinical Entity: "Cholecystectomy"

SNOMED CT:
  - Code: 38102005
  - Preferred term: "Cholecystectomy"
  - Synonyms: "Gallbladder removal", "Cholecystectomy procedure"
  - Attributes: (handled separately, not as different codes)

MBS (Billing-focused):
  - 30443: Cholecystectomy without cholangiogram
  - 30445: Cholecystectomy with cholangiogram/ultrasound
  - 30448: Cholecystectomy with common duct calculi removal
  - (Same procedure, different payment codes)
```

**SNOMED Advantages:**
- Clinical semantics, not billing semantics
- Hierarchical relationships (e.g., "Cholecystectomy" is-a "Excision of digestive organ")
- Pre-mapped to ICD-10-AM, MBS (can maintain billing references if needed)
- International standard (interoperability with global systems)

**SNOMED Challenges:**
- Large dataset (~350k concepts) - indexing/search complexity
- More complex structure (relationships, hierarchies)
- Need to load SNOMED Australian release into database
- Licensing: Free but requires SNOMED International affiliate registration

---

### Option B: Auto-Generated Procedure Registry (Exora-Native)

**Concept:** Build procedure terminology organically from real Australian patient documents

**How It Works:**

1. **Initial State:** Empty procedure registry (or seed from SNOMED)

2. **Pass 1 Extraction:** Entity detected
   ```
   Entity text: "Patient underwent laparoscopic cholecystectomy"
   Entity type: procedure
   ```

3. **Pass 1.5 Matching Process:**
   ```
   Step 1: Normalize entity text
     - "laparoscopic cholecystectomy" → ["laparoscopic", "cholecystectomy"]

   Step 2: Search existing procedure registry (keyword matching)
     - Query: ["laparoscopic", "cholecystectomy", "gallbladder", "removal"]

   Step 3a: IF MATCH FOUND
     - Link to existing PROC_ID
     - Optionally: Add new variant/alias if not already stored

   Step 3b: IF NO MATCH (NEW PROCEDURE)
     - Generate new PROC_ID (e.g., PROC_20251023_001 or GUID)
     - Store canonical name: "Cholecystectomy"
     - Store variants: ["laparoscopic cholecystectomy", "lap chole", "gallbladder removal"]
     - Store search keywords: ["cholecystectomy", "gallbladder", "laparoscopic", "removal"]
     - Optional: Map to external codes (SNOMED, MBS) for reference
   ```

4. **Over Time:** Registry grows with real Australian medical terminology
   - Learns colloquialisms ("lap chole")
   - Captures Australian spelling/terminology variations
   - Adapts to how Australian doctors actually write procedures

**Database Schema:**

```sql
-- Core procedure registry
CREATE TABLE procedure_registry (
  procedure_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,  -- "Cholecystectomy"
  procedure_category TEXT,        -- "Surgery - Digestive System"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_matched_at TIMESTAMPTZ,
  match_count INTEGER DEFAULT 0,  -- How many times this procedure has been matched

  -- External code mappings (optional)
  snomed_code TEXT,
  mbs_codes TEXT[],  -- ["30443", "30445", "30448"]
  icd10_code TEXT,

  -- Metadata
  notes TEXT,
  verified BOOLEAN DEFAULT FALSE  -- Manual review flag
);

-- Procedure variants and aliases
CREATE TABLE procedure_variants (
  variant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID REFERENCES procedure_registry(procedure_id) ON DELETE CASCADE,
  variant_text TEXT NOT NULL,  -- "laparoscopic cholecystectomy", "lap chole"
  variant_type TEXT,            -- "formal_name", "colloquialism", "abbreviation"
  source TEXT,                   -- "pass1_extraction", "manual_entry", "snomed_synonym"
  confidence NUMERIC(3,2),      -- 0.0-1.0
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(procedure_id, variant_text)
);

-- Search keywords (for fast lexical matching)
CREATE TABLE procedure_keywords (
  keyword_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID REFERENCES procedure_registry(procedure_id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,        -- "cholecystectomy", "gallbladder", "laparoscopic"
  keyword_weight NUMERIC(3,2) DEFAULT 1.0,  -- Importance weighting

  UNIQUE(procedure_id, keyword)
);

-- Indexes for performance
CREATE INDEX idx_procedure_canonical ON procedure_registry(canonical_name);
CREATE INDEX idx_procedure_snomed ON procedure_registry(snomed_code);
CREATE INDEX idx_variants_text ON procedure_variants(variant_text);
CREATE INDEX idx_keywords_keyword ON procedure_keywords(keyword);
CREATE INDEX idx_keywords_procedure ON procedure_keywords(procedure_id);
```

**Matching Algorithm (Pure Lexical - No Embeddings):**

```sql
-- Search for matching procedure using keyword overlap
CREATE OR REPLACE FUNCTION search_procedure_registry(
    p_entity_text TEXT,
    p_search_keywords TEXT[],  -- Generated by AI in Pass 1
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    procedure_id UUID,
    canonical_name TEXT,
    match_score NUMERIC,
    matched_variants TEXT[],
    matched_keywords TEXT[]
) AS $$
DECLARE
    v_keyword_count INTEGER;
BEGIN
    v_keyword_count := array_length(p_search_keywords, 1);

    RETURN QUERY
    WITH keyword_matches AS (
        -- Count how many keywords match each procedure
        SELECT
            pr.procedure_id,
            pr.canonical_name,
            COUNT(DISTINCT pk.keyword) AS keyword_match_count,
            array_agg(DISTINCT pk.keyword) AS matched_keywords
        FROM procedure_registry pr
        JOIN procedure_keywords pk ON pk.procedure_id = pr.procedure_id
        WHERE pk.keyword = ANY(p_search_keywords)
        GROUP BY pr.procedure_id, pr.canonical_name
    ),
    variant_matches AS (
        -- Check for variant text matches
        SELECT
            pr.procedure_id,
            array_agg(DISTINCT pv.variant_text) AS matched_variants
        FROM procedure_registry pr
        JOIN procedure_variants pv ON pv.procedure_id = pr.procedure_id
        WHERE pv.variant_text ILIKE '%' || p_entity_text || '%'
           OR p_entity_text ILIKE '%' || pv.variant_text || '%'
        GROUP BY pr.procedure_id
    )
    SELECT
        km.procedure_id,
        km.canonical_name,
        (km.keyword_match_count::NUMERIC / v_keyword_count::NUMERIC) AS match_score,
        COALESCE(vm.matched_variants, ARRAY[]::TEXT[]),
        km.matched_keywords
    FROM keyword_matches km
    LEFT JOIN variant_matches vm ON vm.procedure_id = km.procedure_id
    WHERE km.keyword_match_count > 0
    ORDER BY match_score DESC, km.canonical_name ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## Hybrid Approach: SNOMED Seed + Auto-Growth

**Phase 1: Bootstrap with SNOMED (Recommended)**

1. Load SNOMED CT Australian Edition (~25,000 procedure concepts)
2. Populate `procedure_registry` with SNOMED procedures
3. Pre-populate variants/keywords from SNOMED synonyms
4. Use SNOMED as initial reference standard

**Phase 2: Organic Growth**

1. As Pass 1 extracts procedures, match against registry
2. If no match: Create new entry (might be Australian colloquialism)
3. If match: Increment match_count, optionally add new variant
4. Manual review queue for unverified procedures

**Phase 3: Continuous Improvement**

1. Analyze frequently matched procedures (high match_count)
2. Review low-confidence matches (manual verification)
3. Merge duplicate entries discovered over time
4. Refine keyword weights based on match success

---

## Implementation Steps

### Immediate (Experiment 7):

**Option A Track (SNOMED CT):**
1. Download SNOMED CT Australian Edition (via NCTS)
2. Extract procedure concepts (hierarchy: "Procedure" descendants)
3. Load into `regional_medical_codes` table (new code_system = 'snomed')
4. Re-run Experiment 6 with SNOMED instead of MBS
5. Compare accuracy: SNOMED vs MBS

**Option B Track (Auto-Registry):**
1. Create database schema (3 tables above)
2. Seed with 35 test procedures from Experiment 6
3. Implement `search_procedure_registry()` function
4. Test matching algorithm with same 35 entities
5. Measure accuracy and match quality

### Short-Term (Phase 1 Integration):

1. Choose approach based on Experiment 7 results:
   - Pure SNOMED (if accuracy ≥90%)
   - Hybrid SNOMED + Auto-registry (if SNOMED ~80-90%)
   - Pure Auto-registry (if SNOMED fails)

2. Update Pass 1.5 pipeline to use new system:
   - Replace `search_procedures_hybrid()` calls
   - Store procedure_id instead of MBS code
   - Link entities to procedure registry

3. Add manual review workflow:
   - Flag low-confidence matches
   - Admin UI to verify/merge/edit procedures
   - Approve new procedure entries

### Long-Term (Production):

1. Continuous registry maintenance:
   - Monitor match success rates
   - Detect duplicate/similar entries
   - Refine keywords based on match patterns

2. Cross-reference external codes:
   - Map procedures to MBS (for billing context)
   - Map to ICD-10-AM (for hospital coding)
   - Maintain SNOMED linkage

3. Multi-country expansion:
   - Add country_code to procedure_registry
   - Support US (CPT), UK (OPCS), etc.
   - Country-specific variants/terminology

---

## Non-Procedure Entities (Out of Scope)

**Explicitly EXCLUDE from Pass 1.5 coding:**
- GP consultations
- Telehealth consultations
- General medical visits
- Hospital encounters

**Rationale:**
- These are "encounters" or "events", not "procedures"
- Already classified by Pass 1 entity type
- No clinical value in assigning codes
- Handled elsewhere in data model

**Pass 1.5 Scope:**
- Procedures: Surgeries, operations
- Examinations: Imaging (X-ray, CT, MRI, ultrasound)
- Diagnostic tests: Specific investigations (ECG, spirometry)

---

## Key Design Decisions

### 1. Granularity Philosophy

**Exora Standard:** One clinical concept = one identifier

Example boundaries:
- **Same procedure:** "Cholecystectomy" (all approaches/variants)
- **Different procedure:** "Appendectomy" (separate identifier)
- **Modifiers:** Stored as attributes, not separate identifiers
  - Approach: laparoscopic vs open
  - Side: left vs right
  - Complexity: simple vs complex

### 2. Matching Strategy

**Pure lexical keyword matching** (no embeddings for now)
- Proven effective in Experiment 6 (71.4% → 90% with tuning)
- Fast, deterministic, explainable
- Can add semantic layer later if needed

### 3. Growth vs Control

**Controlled growth with approval workflow:**
- Auto-suggest new procedures (don't auto-create)
- Manual review before adding to canonical registry
- Prevents terminology explosion
- Ensures quality over quantity

### 4. External Code Mappings

**Store references, don't depend on them:**
- SNOMED code: Primary reference (clinical standard)
- MBS codes: Billing context (optional)
- ICD-10: Hospital coding (optional)
- Future: CPT (US), OPCS (UK), etc.

---

## Success Metrics

### Experiment 7 (SNOMED Validation):

- **Primary:** Top-20 accuracy ≥90%
- **Secondary:** Zero-result rate <5%
- **Comparison:** SNOMED vs MBS head-to-head

### Production Deployment:

- **Match rate:** ≥95% of procedures matched to existing entries
- **False positive rate:** <5% incorrect matches requiring manual correction
- **Registry growth:** <10 new procedures per 1000 documents (after initial seed)
- **Manual review load:** <5% of all procedure entities flagged for review

---

## Next Steps

1. **Experiment 7A: SNOMED CT Integration**
   - Load SNOMED Australian Edition
   - Re-run hybrid search experiment
   - Compare to MBS baseline

2. **Experiment 7B: Auto-Registry Prototype**
   - Implement minimal schema
   - Seed with 35 test procedures
   - Test matching algorithm

3. **Decision Point:**
   - Choose SNOMED, Auto-registry, or Hybrid
   - Based on accuracy, complexity, maintainability

4. **Phase 1 Integration:**
   - Update Pass 1.5 pipeline
   - Migrate from MBS to chosen system
   - Deploy to production

---

## Open Questions

1. **SNOMED Licensing:**
   - Does Exora qualify for free Australian use?
   - Registration process timeline?
   - Distribution restrictions?

2. **Manual Review Workflow:**
   - Who reviews flagged procedures?
   - Approval process (single reviewer vs consensus)?
   - How often to audit registry quality?

3. **Duplicate Detection:**
   - What similarity threshold to flag potential duplicates?
   - Automatic merging vs manual review?
   - How to handle regional terminology variations?

4. **Multi-Language Support:**
   - Store variants in multiple languages?
   - Translate canonical names?
   - Country-specific terminology differences?

5. **Version Control:**
   - How to handle procedure name changes over time?
   - Maintain historical mappings?
   - Migration strategy for renamed procedures?

---

## References

- SNOMED CT: https://www.snomed.org/
- SNOMED CT Australian Edition: https://www.healthterminologies.gov.au/
- MBS Online: http://www.mbsonline.gov.au/
- ICD-10-AM: https://www.ihacpa.gov.au/what-we-do/classification
- Experiment 6 Results: `../pass1.5-testing/experiment-6-hybrid-search-validation/`

---

**Document Status:** DRAFT - Awaiting decision on Option A (SNOMED) vs Option B (Auto-registry) vs Hybrid approach
