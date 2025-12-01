# Experiment 7: LOINC Embedding Validation

**Date:** November 1, 2025
**Experiment Lead:** AI Assistant
**Status:** PLANNED
**Objective:** Validate OpenAI text-embedding-3-small semantic search quality for 102,891 LOINC codes

---

## Background

### Context
LOINC (Logical Observation Identifiers Names and Codes) codes represent lab results, vital signs, observations, and physical findings. Unlike medications (PBS) or procedures (MBS), LOINC codes have:
- Hierarchical structure (System, Component, Property, Time, Scale, Method)
- High semantic overlap (e.g., "Blood glucose" vs "Glucose in serum" vs "Glucose [Mass/volume] in Serum or Plasma")
- Natural language variations (layperson vs clinical terminology)

### Embedding Strategy
- Model: OpenAI text-embedding-3-small (1536 dimensions)
- Text source: `display_name` field (clean clinical terminology)
- Rationale: Experiment 2 showed clean text > verbose text for non-medication entities

### Success Criteria from Previous Work
- **Experiment 2**: OpenAI achieved 90-96% similarity for high-similarity pairs, 14-22% for low-similarity pairs
- **Initial validation (Nov 1)**: 8/8 test pairs passed (100% success rate)

---

## Objective

Validate that LOINC embeddings enable accurate semantic search for:
1. Common lab tests with natural language queries
2. Vital sign measurements from clinical documentation
3. Observations with layperson terminology (e.g., "blood sugar" → glucose codes)
4. Physical findings from medical records

Target: ≥85% top-10 accuracy (realistic threshold given 102,891 codes vs 4,500 PBS medications)

---

## Methodology

### Test Cohort Design

**40 realistic entities** across 4 categories (10 each):

#### Category 1: Common Lab Tests (10 entities)
Represents lab results frequently mentioned in medical documents:
- Blood glucose / blood sugar
- Hemoglobin A1c / HbA1c
- Cholesterol / lipid panel
- Complete blood count / CBC / full blood count
- Liver function tests / LFTs
- Kidney function / creatinine / eGFR
- Thyroid function / TSH
- Vitamin D levels
- Iron studies / ferritin
- Urinalysis / urine test

#### Category 2: Vital Signs (10 entities)
Represents routine vital sign measurements:
- Blood pressure / BP
- Heart rate / pulse
- Body temperature / temp
- Respiratory rate / breathing rate
- Oxygen saturation / SpO2 / pulse ox
- Height / standing height
- Weight / body weight
- Body mass index / BMI
- Pain score / pain level
- Glasgow Coma Scale / GCS

#### Category 3: Clinical Observations (10 entities)
Represents clinical findings from physical exams:
- Fetal heart rate / FHR
- Abdominal circumference (fetal)
- Head circumference (pediatric)
- Pregnancy status / HCG / pregnancy test
- Allergy status / allergies
- Smoking status / tobacco use
- Medication adherence / compliance
- Fall risk assessment
- Depression screening / PHQ-9
- Cognitive assessment / MMSE

#### Category 4: Diagnostic Tests (10 entities)
Represents specialized diagnostic test results:
- Chest X-ray findings / CXR results
- ECG / EKG / electrocardiogram results
- Echocardiogram / cardiac ultrasound findings
- Spirometry / lung function tests
- Sleep study / polysomnography results
- Bone density scan / DEXA scan
- Colonoscopy findings
- Pap smear / cervical screening
- Mammogram findings
- MRI brain findings

### Search Strategy

For each entity, test 3 query variations:
1. **Clinical term** (how a doctor would write it)
2. **Layperson term** (how a patient would describe it)
3. **Abbreviation** (common clinical shorthand)

Example (Blood glucose):
```json
{
  "entity_text": "Blood glucose measurement",
  "search_variants": [
    {
      "variant_type": "clinical",
      "query": "glucose serum plasma blood",
      "expected_components": ["Glucose", "Blood", "Serum", "Plasma"]
    },
    {
      "variant_type": "layperson",
      "query": "blood sugar level test",
      "expected_components": ["Glucose", "Blood"]
    },
    {
      "variant_type": "abbreviation",
      "query": "BG BSL",
      "expected_components": ["Glucose"]
    }
  ]
}
```

---

## Test Execution

### Phase 1: Ground Truth Establishment

**Script:** `establish-ground-truth.ts`

For each entity:
1. Manual review of LOINC database to identify correct matches
2. Document expected LOINC codes by category:
   - Perfect match (exact semantic match)
   - Good match (correct test, minor variation)
   - Acceptable match (related test, clinically relevant)
3. Store ground truth in `test-data/ground-truth.json`

### Phase 2: Vector Search Testing

**Script:** `test-loinc-vector-search.ts`

For each entity and query variation:
1. Generate embedding for query using OpenAI API
2. Execute vector similarity search against LOINC codes:
```typescript
const { data } = await supabase
  .from('regional_medical_codes')
  .select('code_value, display_name, entity_type, embedding <=> $1 as similarity')
  .eq('code_system', 'loinc')
  .eq('country_code', 'AUS')
  .order('similarity', { ascending: true })
  .limit(10);
```
3. Calculate metrics:
   - Top-1 accuracy (correct code in position 1)
   - Top-5 accuracy (correct code in top 5)
   - Top-10 accuracy (correct code in top 10)
   - Mean Reciprocal Rank (MRR)
   - Semantic similarity scores

### Phase 3: Entity Type Distribution Analysis

**Script:** `analyze-entity-distribution.ts`

Verify that search results respect entity type boundaries:
- Lab test queries should return `lab_result` entity types
- Vital sign queries should return `vital_sign` entity types
- Observation queries should return `observation` entity types
- Physical finding queries should return `physical_finding` entity types

### Phase 4: Cross-Category Confusion Matrix

**Script:** `generate-confusion-matrix.ts`

Test potential confusion scenarios:
- "Glucose" query: Should distinguish blood glucose (lab) from glucose tolerance test (procedure)
- "Temperature" query: Should distinguish body temp (vital) from specimen temp (property)
- "Pressure" query: Should distinguish blood pressure (vital) from intracranial pressure (observation)

---

## Success Metrics

### Primary Metrics
- **Top-1 accuracy**: ≥60% (strict - exact match in position 1)
- **Top-5 accuracy**: ≥75% (good - correct match in top 5)
- **Top-10 accuracy**: ≥85% (target - correct match in top 10)

### Secondary Metrics
- **Mean Reciprocal Rank (MRR)**: ≥0.70 (measures average ranking quality)
- **Entity type precision**: ≥90% (correct entity type in top-5 results)
- **Layperson query accuracy**: Within 10% of clinical query accuracy
- **Abbreviation query accuracy**: ≥70% top-10 (abbreviations are harder)

### Failure Analysis
If success criteria not met:
1. Analyze failure patterns by category
2. Identify specific LOINC code ambiguities
3. Evaluate whether display_name vs search_text would improve results
4. Consider hybrid search strategy (vector + keyword)

---

## Expected Challenges

### Challenge 1: LOINC Granularity
LOINC has multiple codes for similar concepts:
- "Glucose [Mass/volume] in Blood"
- "Glucose [Mass/volume] in Serum"
- "Glucose [Mass/volume] in Plasma"
- "Glucose [Moles/volume] in Blood"

**Mitigation:** Accept multiple valid matches in ground truth

### Challenge 2: Layperson vs Clinical Terms
Patients say "blood sugar", doctors say "glucose", LOINC says "Glucose [Mass/volume]".

**Mitigation:** Test all three query types and measure cross-query consistency

### Challenge 3: Scale of Search Space
102,891 codes vs 4,500 PBS medications = 22x larger search space.

**Mitigation:** Lower top-10 accuracy threshold from 90% (PBS) to 85% (LOINC)

### Challenge 4: Acronym Ambiguity
"BP" could mean Blood Pressure or Bipolar, "TSH" could mean Thyroid Stimulating Hormone or something else.

**Mitigation:** Include clinical context in queries where needed

---

## Deliverables

1. **Ground Truth Dataset**: `test-data/ground-truth.json` (40 entities, 120 query variations)
2. **Test Scripts**:
   - `scripts/establish-ground-truth.ts`
   - `scripts/test-loinc-vector-search.ts`
   - `scripts/analyze-entity-distribution.ts`
   - `scripts/generate-confusion-matrix.ts`
3. **Results**:
   - `results/search-results-raw.json` (all search results)
   - `results/accuracy-metrics.json` (computed metrics)
   - `results/failure-analysis.json` (failed queries + reasons)
4. **Summary Report**: `RESULTS_SUMMARY.md` with findings and recommendations

---

## Timeline

- **Ground truth establishment**: 2-3 hours (manual LOINC review)
- **Script development**: 3-4 hours
- **Test execution**: 30 minutes (120 queries × ~15 sec each)
- **Analysis & reporting**: 2-3 hours
- **Total**: 8-10 hours

---

## Next Steps After Completion

1. If success: Integrate LOINC search into Pass 1.5 entity matching
2. If partial success: Implement hybrid search (vector + keyword) for low-performing categories
3. If failure: Re-evaluate embedding strategy (search_text vs display_name, model choice)
4. Document lessons learned for SNOMED CT implementation (next code system)
