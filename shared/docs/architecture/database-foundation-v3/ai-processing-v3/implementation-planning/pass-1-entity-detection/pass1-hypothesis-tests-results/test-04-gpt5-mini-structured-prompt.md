# Test 04: GPT-5-mini with Structured Prompt Evolution

**Date:** 2025-10-07
**Status:** ❌ CANCELLED - Gold Standard Proven Superior
**Priority:** HIGH (enable full medical data extraction)

---

## 🚨 EXPERIMENT CANCELLED (2025-10-07)

**This phased approach was abandoned in favor of the gold standard prompt.**

**Reason:** After multiple failed attempts to create a minimal prompt with proper schema validation:
1. **Phase 1 Attempt:** 44 validation errors (schema mismatch)
2. **Token Limit Fix:** Output exceeded 16K tokens (finish_reason: "length")
3. **Schema Compression:** AI couldn't parse compressed format

**Conclusion:** The gold standard prompt (348 lines) is OPTIMAL. The verbose schema examples are NECESSARY for AI to generate proper output structure.

**Production Decision:** Use gold standard prompt with GPT-5-mini.
- See [Test 05 - Gold Standard Production Validation](./test-05-gold-standard-production-validation.md)
- Result: 38 high-quality entities, 96% confidence, 98.3% AI-OCR agreement
- Cost: $0.194/doc (still 60% cheaper than GPT-4o)

**This file is preserved to document the failed experiment and lessons learned.**

---

## Original Experiment Plan (NOT EXECUTED)

## Hypothesis

Test 03 proved that GPT-5-mini + minimal prompt extracts entities efficiently (53 avg entities, 80% cost savings). However, the minimal prompt lacks the **structured medical data** required to populate all 7 Pass 1 database tables (immunizations, diagnoses, medications, etc.).

**Goal:** Gradually expand the minimal prompt to achieve gold standard output while maintaining:
1. Entity count: 50+ entities (proven baseline)
2. Processing time: <6 minutes (acceptable for background jobs)
3. Cost: ~$0.011/doc (GPT-5-mini advantage)
4. Structured data: 80%+ fields populated for medical tables

## Baseline (Test 03 - Minimal Prompt)

**Performance:**
- Entity Count: 53 entities avg (range: 52-55)
- Processing Time: 3m 13s avg (range: 2m41s-4m5s)
- Cost: $0.011/doc
- Prompt Size: 20 lines

**What's Missing:**
- ❌ Entity classification (no categories/subtypes)
- ❌ Structured fields (no vaccine_name, diagnosis_code, etc.)
- ❌ Medical table population (immunizations, diagnoses, medications empty)
- ❌ Confidence scoring (no quality indicators)

## Gold Standard Reference (`pass1-prompts.ts`)

**What it achieves:**
- ✅ 3-tier entity taxonomy (28 subtypes)
- ✅ Rich structured output schema
- ✅ Visual interpretation + OCR cross-reference
- ✅ Spatial information (bounding boxes, page numbers)
- ✅ Quality indicators + confidence scores
- ✅ Document coverage metrics

**Downsides:**
- ⚠️ 348 lines (massive context bloat)
- ⚠️ Previously caused under-extraction (3 entities)
- ⚠️ Token-heavy, slow processing

## Experiment Strategy: Phased Prompt Expansion

### Phase 1: Entity Taxonomy (Conservative)
**Goal:** Classify entities without losing extraction quality

**Changes:**
- Add compact 3-tier taxonomy (Clinical Events, Healthcare Context, Document Structure)
- ~28 entity subtypes with minimal examples
- Disambiguation rules
- Target: 30-35 lines added → **50-55 total lines**

**Success Criteria:**
- ✅ Entity count: 50+ (maintain baseline)
- ✅ Processing time: <5 min (slight increase acceptable)
- ✅ Entity categories: Correctly classified
- ✅ Cost: ~$0.011-0.015/doc

**Rollback Trigger:**
- ❌ Entity count drops below 45
- ❌ Processing time exceeds 8 minutes
- ❌ Cost increases above $0.020/doc

### Phase 2: Structured Fields (Moderate)
**Goal:** Extract medical data into database-ready format

**Changes:**
- Add entity-type-specific structured fields
- Simplified schema (no verbose visual interpretation)
- Focus on medical data (vaccine_name, diagnosis_code, medication_dosage)
- Target: 50-60 lines added → **100-115 total lines**

**Success Criteria:**
- ✅ Entity count: 50+ (maintain)
- ✅ Structured fields: 80%+ populated correctly
- ✅ Database tables: All 7 tables populated (immunizations, diagnoses, etc.)
- ✅ Processing time: <6 min
- ✅ Cost: ~$0.015-0.020/doc

**Rollback Trigger:**
- ❌ Entity count drops below 45
- ❌ Structured data quality <60%
- ❌ Processing time exceeds 10 minutes

### Phase 3: Refinement (If Needed)
**Goal:** Edge cases, validation rules, quality improvements

**Changes:**
- Add edge case handling
- Enhance confidence scoring
- Optional: Add document coverage metrics
- Target: +10-20 lines → **110-135 total lines**

**Decision:** Only proceed if Phase 2 gaps identified

## Phased Rollout Plan

| Phase | Lines | Features Added | Test Run | Decision Point |
|-------|-------|----------------|----------|----------------|
| **Baseline** | 20 | Entity extraction + list handling | Test 03 (complete) | ✅ Validated |
| **Phase 1** | 50-55 | Entity taxonomy + classification | Test 04a (pending) | Review results |
| **Phase 2** | 100-115 | Structured fields + medical data | Test 04b (pending) | Review results |
| **Phase 3** | 110-135 | Edge cases + refinements | Test 04c (optional) | If needed |

## File Modification Strategy

**File to modify:**
`apps/render-worker/src/pass1/pass1-prompts-minimal-test.ts`

**Why in-place modification:**
- ✅ No import changes needed
- ✅ Environment variable `USE_MINIMAL_PROMPT=true` still works
- ✅ Clean git history shows evolution
- ✅ Easy rollback via git revert

**Git workflow:**
```bash
# After Phase 1
git add apps/render-worker/src/pass1/pass1-prompts-minimal-test.ts
git commit -m "Test 04 Phase 1: Add entity taxonomy to minimal prompt"
git tag test-04-phase-1
git push

# After Phase 2
git commit -m "Test 04 Phase 2: Add structured fields for medical data"
git tag test-04-phase-2
git push
```

## Metrics Tracking

**After each phase upload, measure:**

| Metric | Source | Baseline | Phase 1 Target | Phase 2 Target |
|--------|--------|----------|----------------|----------------|
| **Entity Count** | `entity_processing_audit` | 53 | 50+ | 50+ |
| **Processing Time** | `job_queue` duration | 3m 13s | <5 min | <6 min |
| **Token Usage** | Render logs | ~15K | Monitor | Monitor |
| **Cost/doc** | Token estimate | $0.011 | <$0.015 | <$0.020 |
| **Categories Present** | Manual review | 0 | 3 categories | 3 categories |
| **Structured Data %** | Manual review | 0% | N/A | 80%+ |
| **DB Table Rows** | Row counts | 1 table | 1 table | 7 tables |

## Phase 1: Entity Taxonomy Design

### Compact Taxonomy (Based on Gold Standard)

**Clinical Events** (Full Pass 2 medical processing):
- vital_sign, lab_result, physical_finding, symptom
- medication, procedure, immunization, diagnosis, allergy
- healthcare_encounter, clinical_other

**Healthcare Context** (Limited Pass 2 enrichment):
- patient_identifier, provider_identifier, facility_identifier
- appointment, referral, care_coordination
- insurance_information, billing_code, authorization
- healthcare_context_other

**Document Structure** (Logging only, no processing):
- header, footer, logo, page_marker
- signature_line, watermark, form_structure
- document_structure_other

**Disambiguation Rules:**
- Substance + dosage → medication; condition name → diagnosis
- Scheduled/future → appointment; performed/completed → procedure
- With credentials → provider_identifier; signature area → signature_line
- Multi-category entities → split into separate entities
- When uncertain → prefer clinical relevance

**Estimated Addition:** ~35 lines

### Expected Output Schema (Phase 1)

```typescript
{
  "entity_id": "ent_001",
  "original_text": "Fluvax - 15/03/2024",
  "classification": {
    "entity_category": "clinical_event",
    "entity_subtype": "immunization",
    "confidence": 0.95
  },
  "extracted_text": "Fluvax - 15/03/2024",
  "page_number": 1
}
```

## Phase 2: Structured Fields Design

### Entity-Type-Specific Fields

**Immunization:**
```typescript
structured_value: {
  vaccine_name: "Fluvax",
  administration_date: "2024-03-15",
  dose_number: 1,
  provider: "Dr. Smith"
}
```

**Vital Sign:**
```typescript
structured_value: {
  measurement_type: "blood_pressure",
  value: "140/90",
  unit: "mmHg",
  measured_date: "2024-03-15"
}
```

**Medication:**
```typescript
structured_value: {
  medication_name: "Lisinopril",
  dosage: "10mg",
  frequency: "daily",
  route: "oral"
}
```

**Diagnosis:**
```typescript
structured_value: {
  condition: "Type 2 Diabetes",
  icd10_code: "E11.9",
  diagnosed_date: "2024-01-15"
}
```

**Estimated Addition:** ~50-60 lines

## What We're NOT Adding (For Now)

**Deferred to later optimization:**
- ❌ Visual interpretation details (`ai_sees`, `formatting_context`)
- ❌ OCR cross-reference (`ai_ocr_agreement`, `discrepancy_notes`)
- ❌ Spatial bounding boxes (pixel coordinates)
- ❌ Document coverage metrics (unclassified segments tracking)

**Rationale:**
- Focus on medical data extraction first
- Can add observability later once core functionality works
- Minimize token bloat during iteration

## Test Documentation Structure

**Each phase will document:**

### Test 04a (Phase 1)
- Job ID, duration, entity count
- Entity category distribution
- Token usage changes
- Processing time impact
- Decision: Proceed to Phase 2 or rollback

### Test 04b (Phase 2)
- Job ID, duration, entity count
- Structured field population %
- Database table row counts (all 7 tables)
- Sample entity quality review
- Decision: Production-ready or refinement needed

### Test 04c (Phase 3 - If Needed)
- Edge case handling validation
- Final quality review
- Production deployment decision

## Success Definition

**Production-ready criteria:**
- ✅ Entity count: 50+ (maintain Test 03 baseline)
- ✅ Entity classification: 95%+ accurate
- ✅ Structured data: 80%+ fields populated
- ✅ Database tables: All 7 tables receiving data
- ✅ Processing time: <6 minutes (acceptable for background)
- ✅ Cost: <$0.020/doc (still massive savings vs GPT-4o)
- ✅ Consistency: 3+ validation runs

**If achieved:** Deploy to production, update worker config, document in CLAUDE.md

## Rollback Strategy

**If any phase fails criteria:**
1. Git revert to previous tag
2. Redeploy worker
3. Document failure in test file
4. Analyze root cause
5. Adjust approach or revert to Test 03 baseline

## Related Documentation

- [Test 03 - Minimal Prompt Baseline](./test-03-gpt5-mini-minimal-prompt.md)
- [Test 02 - Minimal vs Complex Prompt](./test-02-minimal-prompt-gpt4o.md)
- [Gold Standard Prompt](../../../../../apps/render-worker/src/pass1/pass1-prompts.ts)
- [Minimal Prompt (Baseline)](../../../../../apps/render-worker/src/pass1/pass1-prompts-minimal-test.ts)

## Current Status

**Phase 1:** 🚧 Ready to implement
**Phase 2:** ⏸️ Pending Phase 1 validation
**Phase 3:** ⏸️ TBD based on Phase 2 results

---

## Test 04a: Phase 1 - Entity Taxonomy (Pending)

**Date:** TBD
**Status:** 📝 Not started

**Prompt Changes:**
- [ ] Add 3-tier entity taxonomy (Clinical/Context/Structure)
- [ ] Add disambiguation rules
- [ ] Update output schema to include classification
- [ ] Target: 50-55 total lines

**Deployment:**
- [ ] Modify `pass1-prompts-minimal-test.ts`
- [ ] Git commit and tag `test-04-phase-1`
- [ ] Deploy to Render.com
- [ ] Upload test document

**Results:** (To be filled after test)
- Job ID:
- Entity Count:
- Processing Time:
- Entity Categories:
- Decision:

---

## Test 04b: Phase 2 - Structured Fields (Pending)

**Date:** TBD
**Status:** ⏸️ Awaiting Phase 1 completion

**Prompt Changes:**
- [ ] Add entity-type-specific structured fields
- [ ] Add medical data extraction requirements
- [ ] Target: 100-115 total lines

**Deployment:**
- [ ] Modify `pass1-prompts-minimal-test.ts`
- [ ] Git commit and tag `test-04-phase-2`
- [ ] Deploy to Render.com
- [ ] Upload test document

**Results:** (To be filled after test)
- Job ID:
- Entity Count:
- Processing Time:
- Structured Data %:
- Database Tables Populated:
- Decision:

---

**Last Updated:** 2025-10-07
**Next Action:** Implement Phase 1 entity taxonomy
