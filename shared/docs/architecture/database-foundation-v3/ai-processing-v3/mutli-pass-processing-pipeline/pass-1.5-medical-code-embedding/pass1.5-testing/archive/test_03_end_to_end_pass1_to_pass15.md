# Test 03: End-to-End Pass 1 to Pass 1.5 Integration

**Test ID:** TEST_03_END_TO_END_PASS1_TO_PASS15  
**Date:** 2025-10-18  
**Test Type:** Complete Pipeline Integration Test  
**Status:** 🔄 READY FOR EXECUTION  

---

## Test Objective

Validate the complete integration between Pass 1 (Entity Detection) and Pass 1.5 (Medical Code Embedding) using a real uploaded medical document. This test ensures that clinical entities extracted by Pass 1 are properly processed by Pass 1.5 to generate medical code candidates ready for Pass 2.

**Complete Pipeline Under Test:**
```
Real Medical Document → Pass 1 OCR & AI → Clinical Entities → Pass 1.5 Embedding → Medical Code Candidates → Ready for Pass 2
```

---

## Test Environment

**Document Processing Infrastructure:**
- Exora V3 production architecture
- Supabase shell-file-processor-v3 Edge Function
- Pass 1 entity detection operational
- Render.com worker with Pass 1 implementation

**Medical Code Database:**
- 20,383 regional medical codes (PBS + MBS) with embeddings
- pgvector similarity search operational
- Pass 1.5 worker module implemented

**Integration Points:**
- Pass 1 output: `entity_processing_audit` table
- Pass 1.5 input: Clinical entities from Pass 1
- Pass 1.5 output: `pass15_code_candidates` table
- Ready for Pass 2: Medical code candidates available

---

## Test Phases

### Phase 1: Document Upload and Pass 1 Processing

**Test Document Requirements:**
- Real medical document (user provided)
- Contains multiple entity types:
  - ✅ **Medications** (for PBS code matching)
  - ✅ **Procedures** (for MBS code matching)  
  - ✅ **Vital Signs** (for future LOINC matching)
  - ✅ **Diagnoses** (for future SNOMED matching)

**Expected Pass 1 Output:**
- Document uploaded to Supabase Storage
- Shell file record created
- OCR text extraction completed
- AI entity detection completed
- Entities stored in `entity_processing_audit` table

**Pass 1 Validation Queries:**
```sql
-- Verify document processing completed
SELECT 
  sf.id as shell_file_id,
  sf.file_name,
  sf.pass1_status,
  COUNT(epa.id) as entities_detected
FROM shell_files sf
LEFT JOIN entity_processing_audit epa ON sf.id = epa.shell_file_id
WHERE sf.id = '[SHELL_FILE_ID]'
GROUP BY sf.id, sf.file_name, sf.pass1_status;

-- Analyze entity types detected
SELECT 
  entity_subtype,
  COUNT(*) as entity_count,
  AVG(confidence_score) as avg_confidence,
  array_agg(original_text ORDER BY confidence_score DESC LIMIT 3) as top_examples
FROM entity_processing_audit 
WHERE shell_file_id = '[SHELL_FILE_ID]'
GROUP BY entity_subtype
ORDER BY entity_count DESC;
```

**RESULT:** 🔄 PENDING (Requires real document upload)

---

### Phase 2: Pass 1.5 Entity Processing

**Test Execution:**
1. **Retrieve Pass 1 Entities:** Extract clinical entities from `entity_processing_audit`
2. **Execute Pass 1.5 Pipeline:** Process entities through Pass 1.5 worker module
3. **Generate Medical Code Candidates:** Vector similarity search for each entity
4. **Store Audit Records:** Populate `pass15_code_candidates` table

**Pass 1.5 Test Script:**
```typescript
// Extract entities from Pass 1 output
const entities = await supabase
  .from('entity_processing_audit')
  .select('*')
  .eq('shell_file_id', shellFileId)
  .eq('pass1_status', 'completed');

// Process through Pass 1.5
const pass15Results = await retrieveCodeCandidatesForBatch(
  entities.data,
  patientId,
  'AUS'
);

// Analyze results
console.log('Pass 1.5 Processing Summary:');
console.log(`- Total entities: ${entities.data.length}`);
console.log(`- Successful: ${pass15Results.successful_entities.size}`);
console.log(`- Failed: ${pass15Results.failed_entities.length}`);
console.log(`- Average candidates per entity: ${pass15Results.batch_summary.average_candidates_per_entity}`);
```

**Expected Results by Entity Type:**

| Entity Type | Expected Code System | Min Candidates | Success Rate |
|-------------|---------------------|----------------|--------------|
| medication | PBS (regional) | 5-15 | >90% |
| procedure | MBS (regional) | 5-15 | >90% |
| vital_sign | None (no LOINC yet) | 0-5 | >50% |
| diagnosis | None (no SNOMED yet) | 0-5 | >50% |

**RESULT:** 🔄 PENDING

---

### Phase 3: Medical Code Candidate Quality Analysis

**Quality Metrics to Validate:**

**1. Semantic Relevance:**
- Top candidate similarity score >0.70 for clear matches
- All candidates above 0.60 threshold
- Candidate descriptions semantically related to entity text

**2. Code System Appropriateness:**
- Medication entities → PBS codes preferred
- Procedure entities → MBS codes preferred
- No inappropriate cross-contamination

**3. Candidate Diversity:**
- 5-20 candidates per entity (configurable range)
- Mix of high and medium confidence candidates
- No duplicate codes in candidate list

**Validation Queries:**
```sql
-- Analyze candidate quality by entity type
SELECT 
  epa.entity_subtype,
  COUNT(p15.id) as total_searches,
  AVG(json_array_length(p15.regional_candidates)) as avg_regional_candidates,
  AVG(json_array_length(p15.universal_candidates)) as avg_universal_candidates,
  AVG(p15.search_duration_ms) as avg_search_time_ms
FROM entity_processing_audit epa
JOIN pass15_code_candidates p15 ON epa.id = p15.entity_id
WHERE epa.shell_file_id = '[SHELL_FILE_ID]'
GROUP BY epa.entity_subtype;

-- Review top candidate matches for quality
SELECT 
  epa.entity_subtype,
  epa.original_text,
  p15.embedding_text,
  (p15.regional_candidates->0->>'display_name') as top_regional_match,
  (p15.regional_candidates->0->>'similarity_score')::float as top_similarity,
  (p15.regional_candidates->0->>'code_system') as code_system
FROM entity_processing_audit epa
JOIN pass15_code_candidates p15 ON epa.id = p15.entity_id
WHERE epa.shell_file_id = '[SHELL_FILE_ID]'
  AND json_array_length(p15.regional_candidates) > 0
ORDER BY epa.entity_subtype, (p15.regional_candidates->0->>'similarity_score')::float DESC;
```

**RESULT:** 🔄 PENDING

---

### Phase 4: Pass 2 Readiness Validation

**Objective:** Ensure Pass 1.5 output is properly formatted for Pass 2 consumption

**Pass 2 Integration Requirements:**
1. **Structured Candidate Data:** JSON format with all required fields
2. **Patient Isolation:** All results linked to correct patient_id
3. **Audit Trail:** Complete healthcare compliance logging
4. **Error Handling:** Failed entities clearly identified

**Pass 2 Readiness Test:**
```typescript
// Simulate Pass 2 worker data consumption
async function validatePass2Readiness(shellFileId: string) {
  // 1. Retrieve all Pass 1.5 results for the document
  const candidateResults = await supabase
    .from('pass15_code_candidates')
    .select(`
      entity_id,
      embedding_text,
      universal_candidates,
      regional_candidates,
      total_candidates_found,
      search_duration_ms
    `)
    .in('entity_id', entityIds);

  // 2. Verify data structure for Pass 2 consumption
  candidateResults.data.forEach(result => {
    // Validate JSON structure
    assert(Array.isArray(result.regional_candidates));
    assert(Array.isArray(result.universal_candidates));
    
    // Validate required fields in candidates
    result.regional_candidates.forEach(candidate => {
      assert(candidate.code_system);
      assert(candidate.code_value);
      assert(candidate.display_name);
      assert(candidate.similarity_score);
    });
  });

  // 3. Create Pass 2 input format
  const pass2Input = new Map();
  candidateResults.data.forEach(result => {
    const allCandidates = [
      ...result.regional_candidates,
      ...result.universal_candidates
    ].sort((a, b) => b.similarity_score - a.similarity_score);
    
    pass2Input.set(result.entity_id, allCandidates.slice(0, 15));
  });

  return pass2Input;
}
```

**RESULT:** 🔄 PENDING

---

## Test Data Requirements

### Document Upload Preparation

**User Action Required:**
1. **Select Test Document:** Medical document with diverse entity types
2. **Upload via Exora Interface:** Use production upload flow
3. **Wait for Pass 1 Completion:** Monitor processing status
4. **Provide Document ID:** Share shell_file_id for test execution

**Ideal Document Characteristics:**
- **Format:** PDF, JPG, or PNG medical document
- **Content Type:** Patient record, lab report, or prescription
- **Entity Diversity:** 
  - 3-5 medications mentioned
  - 2-3 procedures documented  
  - 1-2 vital signs recorded
  - 1-2 diagnoses listed
- **Text Quality:** Clear, readable text (not handwritten)

### Expected Entity Examples

**Medications (PBS targets):**
- "Lisinopril 10mg once daily"
- "Metformin 500mg twice daily"  
- "Ventolin inhaler as needed"

**Procedures (MBS targets):**
- "Blood pressure measurement"
- "ECG performed"
- "Blood test ordered"

**Vital Signs (future LOINC targets):**
- "BP: 120/80 mmHg"
- "Heart rate: 72 bpm"
- "Weight: 70kg"

**Diagnoses (future SNOMED targets):**
- "Type 2 diabetes"
- "Hypertension"
- "Asthma"

---

## Success Metrics

### Primary Success Criteria

**1. Pipeline Continuity (Critical):**
- 100% of Pass 1 entities processed by Pass 1.5
- No data loss between Pass 1 and Pass 1.5
- All results properly stored for Pass 2 consumption

**2. Medical Code Matching (Critical):**
- >80% of medication entities find PBS candidates
- >80% of procedure entities find MBS candidates  
- >90% of candidates have similarity scores >0.60

**3. Performance (Important):**
- Total Pass 1.5 processing time <5 minutes for typical document
- Average entity processing time <10 seconds
- No timeout failures or memory issues

### Secondary Success Criteria

**1. Data Quality (Important):**
- Embedding text follows Smart Entity-Type Strategy
- Candidate diversity appropriate (5-20 per entity)
- No duplicate candidates in results

**2. System Reliability (Important):**
- Graceful handling of edge cases
- Comprehensive audit logging
- Proper error reporting for failed entities

**3. Healthcare Compliance (Important):**
- Patient data isolation maintained
- Complete audit trail preserved
- Sensitive information properly handled

---

## Test Execution Plan

### Pre-Test Setup (5 minutes)
1. Verify Pass 1.5 module deployment
2. Confirm database connectivity
3. Validate API keys and environment
4. Clear any test data from previous runs

### Document Upload and Processing (15-30 minutes)
1. **USER ACTION:** Upload test medical document
2. Monitor Pass 1 processing progress
3. Verify entity detection completion
4. Record shell_file_id and entity count

### Pass 1.5 Execution (10-15 minutes)
1. Extract entities from Pass 1 output
2. Execute Pass 1.5 batch processing
3. Monitor processing progress and errors
4. Verify all entities processed

### Results Analysis (15-20 minutes)
1. Analyze candidate quality and relevance
2. Validate data structures for Pass 2
3. Check performance metrics
4. Review audit trail completeness

### Reporting and Documentation (10 minutes)
1. Document test results
2. Identify any issues or improvements
3. Update system status
4. Plan next steps based on results

---

## Risk Mitigation

### High Risk Scenarios

**1. Pass 1 Processing Failure:**
- **Risk:** Document upload or entity detection fails
- **Mitigation:** Have backup documents ready, verify Pass 1 status first
- **Fallback:** Use known working document from previous tests

**2. No Medical Code Matches:**
- **Risk:** Poor quality document results in no candidate matches
- **Mitigation:** Select document with clear, standard medical terminology
- **Fallback:** Manual verification of search terms

**3. Performance Issues:**
- **Risk:** Large document causes timeout or memory issues
- **Mitigation:** Monitor processing time, use moderate-sized document
- **Fallback:** Process smaller subset of entities if needed

### Medium Risk Scenarios

**1. Data Structure Issues:**
- **Risk:** Pass 1 output format incompatible with Pass 1.5 input
- **Mitigation:** Verify entity schema compatibility before test
- **Fallback:** Adapter layer if schema mismatch found

**2. Quality Issues:**
- **Risk:** Poor candidate matches due to unclear entity text
- **Mitigation:** Analyze embedding text strategy effectiveness
- **Fallback:** Manual review of entity-to-candidate mappings

---

## Post-Test Analysis

### Success Path Actions
1. **Document Integration:** Mark Pass 1 → Pass 1.5 integration as production-ready
2. **Performance Baseline:** Record metrics for monitoring
3. **Pass 2 Preparation:** Validate data format for Pass 2 integration
4. **User Feedback:** Gather insights on medical code candidate quality

### Failure Path Actions
1. **Root Cause Analysis:** Identify specific failure points
2. **System Fixes:** Address any integration or performance issues
3. **Retest Strategy:** Plan focused retests on problem areas
4. **Documentation Updates:** Update integration guides if needed

---

## Test Artifacts

### Generated During Test
- **Test Results Document:** Complete analysis with screenshots
- **Performance Metrics:** Timing and resource usage data
- **Quality Assessment:** Sample candidate matches with relevance scores
- **Error Analysis:** Any failures with detailed error messages

### Database Records Created
- **entity_processing_audit:** Pass 1 output entities
- **pass15_code_candidates:** Pass 1.5 candidate search results
- **shell_files:** Document processing metadata

### Integration Validation
- **Pass 2 Input Format:** Validated candidate structure
- **Audit Trail:** Complete healthcare compliance logging
- **Performance Baseline:** Benchmark metrics for production

---

**Test Status:** ✅ READY FOR EXECUTION  
**Estimated Duration:** 60-90 minutes (including document upload wait time)  
**User Involvement Required:** Document upload and shell_file_id provision  
**Prerequisites:** Pass 1 operational, Pass 1.5 module deployed, 20,383 medical codes loaded