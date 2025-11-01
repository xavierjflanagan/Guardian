# LOINC Parsing Plan for Pass 1.5
**Created:** 2025-10-31
**Purpose:** Comprehensive plan for parsing LOINC codes into standardized format for Pass 1.5 vector embedding

---

## Executive Summary

LOINC (Logical Observation Identifiers Names and Codes) contains **108,248 codes** for lab tests, vital signs, and clinical observations. This plan details how to parse these codes following the PBS pattern established in Pass 1.5.

**Key Decision:** LOINC codes will be stored in `regional_medical_codes` table (per user preference) despite being universal/international codes.

---

## 1. PBS Parsing Pattern (Reference)

### What PBS Did and Why

**PBS Parser Extracted:**
- `code_value`: `li_item_id` (most granular identifier, preserves all brand variants)
- `grouping_code`: `pbs_code` (groups brands of same medication)
- `display_name`: `drug_name + li_form` (e.g., "Paracetamol Tablet 500mg")
- `search_text`: `display_name + brand_name` (includes brand for better matching)
- `entity_type`: `medication` (all PBS codes are medications)
- `region_specific_data`: All original PBS fields preserved

**Why This Worked:**
1. **Granular preservation** - Every brand variant gets unique code_value
2. **Search optimization** - Includes brand names in search_text for hybrid matching
3. **Entity-specific** - PBS is medications only, simple categorization
4. **Regional metadata** - Preserves Australian-specific fields (pack size, PBS code, etc.)

---

## 2. LOINC Data Structure Analysis

### Source File
- **Location:** `data/medical-codes/loinc/raw/Loinc_2.81/LoincTable/Loinc.csv`
- **Total Codes:** 108,248
- **Columns:** 40 fields
- **Status:** LOINC v2.81 (August 2025 release)

### Key LOINC Columns (Relevant for Pass 1.5)

| Column # | Field Name | Example | Purpose for Pass 1.5 |
|----------|-----------|---------|---------------------|
| 1 | **LOINC_NUM** | "8867-4" | **PRIMARY** - Unique code identifier (code_value) |
| 2 | **COMPONENT** | "Heart rate" | Component being measured |
| 3 | **PROPERTY** | "NRat" | Type of property (numeric rate, mass, etc.) |
| 4 | **TIME_ASPCT** | "Pt" | Time aspect (Point in time, 24h, etc.) |
| 5 | **SYSTEM** | "XXX" | Body system/specimen (Blood, Urine, etc.) |
| 6 | **SCALE_TYP** | "Qn" | Scale type (Quantitative, Qualitative, etc.) |
| 7 | **METHOD_TYP** | "" | Method (if specified) |
| 8 | **CLASS** | "HRTRATE.ATOM" | **IMPORTANT** - Classification for entity_type mapping |
| 21 | **SHORTNAME** | "Heart rate" | Short display name |
| 26 | **LONG_COMMON_NAME** | "Heart rate" | **PRIMARY** - Human-readable display name (display_name) |
| 20 | **RELATEDNAMES2** | "Pulse; Heart beat" | **CRITICAL** - Synonyms and related terms (search_text enrichment) |

**Other Columns (Store in region_specific_data):**
- EXAMPLE_UNITS, EXAMPLE_UCUM_UNITS - Standard units
- ORDER_OBS - Whether it's orderable
- COMMON_TEST_RANK, COMMON_ORDER_RANK - Usage frequency
- STATUS - Active/Deprecated

---

## 3. Entity Type Mapping Strategy

### Challenge
LOINC codes span multiple entity types, unlike PBS (medications only). We need to classify each LOINC code into Pass 1.5 entity types.

### Mapping Strategy: CLASS Field Analysis

| LOINC CLASS | Entity Type | Count (Est.) | Examples |
|-------------|-------------|--------------|----------|
| **BP.ATOM**, **BP.MOLEC** | vital_sign | ~50 | Blood pressure (systolic/diastolic) |
| **HRTRATE.ATOM** | vital_sign | ~20 | Heart rate, pulse |
| **BODY.TEMP** | vital_sign | ~10 | Body temperature |
| **RESP.ATOM** | vital_sign | ~10 | Respiratory rate |
| **CHEM** | lab_result | ~30,000 | Chemistry tests (glucose, cholesterol, etc.) |
| **HEMATOLOGY** | lab_result | ~5,000 | Blood tests (CBC, hemoglobin, etc.) |
| **MICRO** | lab_result | ~3,000 | Microbiology cultures |
| **PANEL** | observation | ~10,000 | Multi-test panels |
| **H&P.HX**, **PHENOTYPE** | observation | ~5,000 | Clinical observations |
| **DRUG/TOX** | lab_result | ~2,000 | Drug levels, toxicology |
| **Other** | observation | ~50,000 | Default fallback |

### Classification Function
```typescript
function mapLoincClassToEntityType(loincClass: string): string {
  // Vital Signs
  if (/^(BP|HRTRATE|BODY\.TEMP|RESP|PULSE)/i.test(loincClass)) {
    return 'vital_sign';
  }

  // Lab Results
  if (/^(CHEM|HEMATOLOGY|MICRO|DRUG|TOX|SERO|PATH)/i.test(loincClass)) {
    return 'lab_result';
  }

  // Clinical Observations (default)
  return 'observation';
}
```

---

## 4. Field Mapping for Pass 1.5

### Standardized Schema Mapping

| Pass 1.5 Field | LOINC Source | Transformation | Example |
|----------------|--------------|----------------|---------|
| **code_system** | Constant | Always "loinc" | "loinc" |
| **code_value** | LOINC_NUM | Direct mapping | "8867-4" |
| **grouping_code** | NULL | LOINC doesn't group | null |
| **display_name** | LONG_COMMON_NAME | Fallback to SHORTNAME or COMPONENT | "Heart rate" |
| **entity_type** | CLASS | mapLoincClassToEntityType() | "vital_sign" |
| **search_text** | LONG_COMMON_NAME + RELATEDNAMES2 + COMPONENT | Concatenate all synonyms | "Heart rate Pulse Heart beat Count/time" |
| **library_version** | Constant | LOINC version | "v2025Q3" |
| **country_code** | Constant | "AUS" (per user preference) | "AUS" |
| **region_specific_data** | Multiple columns | Preserve original metadata | See below |

### region_specific_data Fields
```typescript
{
  original_loinc_num: string;      // LOINC_NUM
  component: string;                // COMPONENT
  property: string;                 // PROPERTY
  time_aspect: string;              // TIME_ASPCT
  system: string;                   // SYSTEM
  scale_type: string;               // SCALE_TYP
  method_type: string;              // METHOD_TYP
  class: string;                    // CLASS
  short_name: string;               // SHORTNAME
  example_units: string;            // EXAMPLE_UNITS
  example_ucum_units: string;       // EXAMPLE_UCUM_UNITS
  order_obs: string;                // ORDER_OBS
  common_test_rank: number;         // COMMON_TEST_RANK
  common_order_rank: number;        // COMMON_ORDER_RANK
  status: string;                   // STATUS (ACTIVE/DEPRECATED)
}
```

---

## 5. Search Text Strategy (Critical for Embeddings)

### Why This Matters
Pass 1 AI detects entities like:
- "BP 128/82" → Need to match LOINC "Blood pressure systolic and diastolic"
- "Pulse 72" → Need to match LOINC "Heart rate"
- "HbA1c" → Need to match LOINC "Hemoglobin A1c/Hemoglobin.total in Blood"

**Challenge:** Medical abbreviations and synonyms

### Solution: Rich Search Text
```typescript
function buildSearchText(row: LOINCRow): string {
  const parts = [
    row.LONG_COMMON_NAME,     // Official name
    row.COMPONENT,            // Component name
    row.RELATEDNAMES2         // Synonyms (semicolon-separated)
  ].filter(Boolean);

  // Clean and deduplicate
  const text = parts.join(' ').trim();
  return text.replace(/;/g, ' ').replace(/\s+/g, ' ');
}

// Example Output:
// "Hemoglobin A1c/Hemoglobin.total in Blood Hemoglobin A1c HbA1c A1C Glycated hemoglobin"
```

**This enables:**
- "HbA1c" → Matches via RELATEDNAMES2 synonym
- "BP" → Matches via "Blood pressure" + "BP" related name
- "Pulse" → Matches via "Heart rate" + "Pulse" related name

---

## 6. Sample Output Format

### Example 1: Vital Sign (Heart Rate)
```json
{
  "code_system": "loinc",
  "code_value": "8867-4",
  "grouping_code": null,
  "display_name": "Heart rate",
  "entity_type": "vital_sign",
  "search_text": "Heart rate Heart beat Pulse Count/time Number rate",
  "library_version": "v2025Q3",
  "country_code": "AUS",
  "region_specific_data": {
    "original_loinc_num": "8867-4",
    "component": "Heart rate",
    "property": "NRat",
    "time_aspect": "Pt",
    "system": "XXX",
    "scale_type": "Qn",
    "method_type": "",
    "class": "HRTRATE.ATOM",
    "short_name": "Heart rate",
    "example_units": "{beats}/min",
    "example_ucum_units": "{beats}/min;{counts}/min",
    "order_obs": "",
    "common_test_rank": "18",
    "common_order_rank": "0",
    "status": "ACTIVE"
  }
}
```

### Example 2: Lab Result (Blood Glucose)
```json
{
  "code_system": "loinc",
  "code_value": "100746-7",
  "grouping_code": null,
  "display_name": "Glucose [Moles/volume] in Mixed venous blood",
  "entity_type": "lab_result",
  "search_text": "Glucose [Moles/volume] in Mixed venous blood Glucose Glu Gluc Glucoseur",
  "library_version": "v2025Q3",
  "country_code": "AUS",
  "region_specific_data": {
    "original_loinc_num": "100746-7",
    "component": "Glucose",
    "property": "SCnc",
    "time_aspect": "Pt",
    "system": "BldMV",
    "scale_type": "Qn",
    "method_type": "",
    "class": "CHEM",
    "short_name": "Glucose BldMV-sCnc",
    "example_units": "mmol/L",
    "example_ucum_units": "mmol/L",
    "order_obs": "Observation",
    "common_test_rank": "0",
    "common_order_rank": "0",
    "status": "ACTIVE"
  }
}
```

---

## 7. Validation Rules

### Required Fields Validation
```typescript
function validateLoincCode(code: MedicalCodeStandard): boolean {
  // Must have LOINC code
  if (!code.code_value || !code.code_value.match(/^\d+-\d$/)) {
    return false;
  }

  // Must have display name
  if (!code.display_name || code.display_name.trim() === '') {
    return false;
  }

  // Must have valid entity type
  const validTypes = ['lab_result', 'vital_sign', 'observation'];
  if (!validTypes.includes(code.entity_type)) {
    return false;
  }

  // Must have search text
  if (!code.search_text || code.search_text.trim() === '') {
    return false;
  }

  // Must be ACTIVE status (skip deprecated)
  if (code.region_specific_data?.status !== 'ACTIVE') {
    return false;
  }

  return true;
}
```

---

## 8. Parsing Strategy

### Filter Criteria
**Include:**
- STATUS = "ACTIVE" (skip deprecated codes)
- LONG_COMMON_NAME exists and not empty
- LOINC_NUM valid format (e.g., "8867-4")

**Exclude:**
- Deprecated codes (STATUS != "ACTIVE")
- Empty/malformed LOINC_NUM
- Missing display names

**Expected Output:** ~95,000-100,000 active codes (from 108,248 total)

---

## 9. Implementation Approach

### Step 1: Parser Script
Create `scripts/parse-loinc.ts` following PBS pattern:
- Read `Loinc_2.81/LoincTable/Loinc.csv`
- Transform each row using field mappings above
- Validate codes
- Output to `data/medical-codes/loinc/processed/loinc_codes.json`

### Step 2: Database Population
Use existing `populate-database.ts` script:
- Load LOINC JSON
- Insert into `regional_medical_codes` table
- Batch size: 1,000 codes per batch

### Step 3: Embedding Generation
Follow PBS embedding pattern:
- Use OpenAI text-embedding-3-small (1536 dimensions)
- Embed `search_text` field
- No SapBERT (medication-specific model not needed for labs/vitals)

---

## 10. Cost Estimation

**Parsing:** Free (local processing)

**Embedding Generation:**
- ~100,000 codes × 30 tokens average = 3M tokens
- OpenAI text-embedding-3-small: $0.02 per 1M tokens
- **Total Cost:** ~$0.06 USD (one-time)

**Database Storage:**
- ~100,000 rows × 2KB average = 200MB
- Plus vector embeddings: 100,000 × 1536 floats × 4 bytes = 614MB
- **Total Storage:** ~814MB

---

## 11. Key Differences from PBS

| Aspect | PBS | LOINC |
|--------|-----|-------|
| **Entity Types** | Single (medication) | Multiple (lab, vital, observation) |
| **Grouping** | Yes (pbs_code groups brands) | No (each code unique) |
| **Search Text** | display_name + brand_name | display_name + component + synonyms |
| **Brand Preservation** | Critical (medical safety) | Not applicable |
| **Regional Metadata** | PBS-specific (pack size, repeats) | LOINC-specific (units, system, property) |
| **Classification** | Not needed (all meds) | CLASS field → entity_type mapping |

---

## 12. Final Decisions (Approved 2025-10-31)

1. **Entity Type Mapping:** ✅ CLASS-based classification APPROVED - maps to Pass 1's existing entity_subtype taxonomy (vital_sign, lab_result, physical_finding) with "observation" fallback

2. **Search Text Strategy:** ✅ Include ALL RELATEDNAMES2 synonyms - add `synonyms` column to regional_medical_codes table for hybrid search

3. **Status Filter:** ✅ INCLUDE DEPRECATED codes - keep all ~108K codes for comprehensive historical matching

4. **country_code:** ✅ "AUS" confirmed - stored in regional_medical_codes per user preference (can migrate to universal table later if needed)

5. **Panels:** ✅ EXCLUDE panel codes - filter out CLASS containing "PANEL" (multi-test bundles not needed for individual entity matching)

---

## 13. Implementation Status (COMPLETE)

**Completed 2025-10-31:**

1. ✅ Created `scripts/parse-loinc.ts` script following PBS pattern
2. ✅ Ran parser on full LOINC CSV (108,248 codes processed)
3. ✅ Validated output JSON structure
4. ✅ Verified sample codes across all entity types
5. ⏳ Generate embeddings using OpenAI (next step)
6. ⏳ Populate `regional_medical_codes` table (after embeddings)
7. ⏳ Test vector search with sample queries

**Parsing Results:**
- Total records processed: 108,248
- Valid codes: 102,891 (95.05% success rate)
- Panel codes excluded: 5,357
- Deprecated codes included: 4,546 (per plan)
- Output file: `data/medical-codes/loinc/processed/loinc_codes.json` (143 MB)

**Entity Type Distribution:**
- Lab results: 39,943 (38.8%)
- Observations: 61,043 (59.3%)
- Physical findings: 1,444 (1.4%)
- Vital signs: 461 (0.4%)

---

## 14. Critical Architectural Decision: Entity Type Expansion Strategy

**Issue Discovered:** LOINC's CLASS field doesn't perfectly align with Pass 1's entity_subtype taxonomy. Examples:
- Body temperature: LOINC CLASS = "BDYTMP.*" → classified as `observation` (not `vital_sign`)
- Oxygen saturation: LOINC CLASS = "HEMODYN.*" → classified as `observation` (not `vital_sign`)
- Weight/Height: LOINC CLASS = "BDYWGT.*" / "BDYHGT.*" → classified as `observation`

**Decision (2025-10-31):** Keep LOINC classifications simple, handle expansion in Pass 1.5 retrieval logic.

**Rationale:**
- Pass 1.5 uses hybrid search (vector embedding + lexical matching)
- Semantic similarity will rank correct codes highly regardless of entity_type filter
- Expanding search space (vital_sign → searches both vital_sign + observation) adds more candidates but hybrid search surfaces the right ones
- More maintainable than trying to perfectly align LOINC CLASS with Pass 1's unknown classification behavior

**Implementation:**
```typescript
// In Pass 1.5 code retrieval (future implementation)
const ENTITY_TYPE_SEARCH_EXPANSION = {
  'vital_sign': ['vital_sign', 'observation'],  // Search both
  'observation': ['observation'],                // Narrow
  'lab_result': ['lab_result'],                  // Exact
  'physical_finding': ['physical_finding', 'observation'],
};
```

**Example:** Pass 1 detects "Temp 37.2°C" as `vital_sign` → Pass 1.5 searches both `vital_sign` and `observation` categories → Embedding similarity ranks "Body temperature" (BDYTMP.ATOM, observation) in top 3 → Pass 2 AI selects correct code.

---

**Status:** PARSING COMPLETE - Ready for embedding generation
**Last Updated:** 2025-10-31
**Next Step:** Run `generate-embeddings.ts` for LOINC codes
