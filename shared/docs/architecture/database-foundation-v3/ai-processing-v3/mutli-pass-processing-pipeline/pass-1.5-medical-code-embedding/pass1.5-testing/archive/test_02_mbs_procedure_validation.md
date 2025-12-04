# Test 02: MBS Procedure Code Validation

**Test ID:** TEST_02_MBS_PROCEDURE_VALIDATION  
**Date:** 2025-10-18  
**Test Type:** MBS Component Validation  
**Status:** 🔄 IN PROGRESS  

---

## Test Objective

Validate the newly implemented MBS (Medicare Benefits Schedule) procedure code component within the Pass 1.5 medical code embedding system. This test ensures MBS codes are properly embedded, searchable, and integrate correctly with the existing PBS medication codes.

**Component Under Test:**
```
MBS Procedure Entities → Smart Entity-Type Strategy → OpenAI Embedding → Vector Search → MBS Code Candidates
```

---

## Test Environment

**Database:**
- Supabase PostgreSQL with pgvector v0.8.0
- 6,001 MBS procedure codes with embeddings (NEW)
- 14,382 PBS medication codes with embeddings (EXISTING)
- Total: 20,383 regional medical codes
- IVFFlat index with vector_cosine_ops

**AI Integration:**
- OpenAI text-embedding-3-small model
- 1536 dimensions
- API key sourced from `apps/web/.env.local`

**Test Infrastructure:**
- TypeScript test scripts with Pass 1.5 worker module
- Direct database queries via Supabase MCP
- Mock procedure entities for comprehensive testing

---

## Test Cases

### Test Case 1: MBS Data Population Verification

**Objective:** Verify all 6,001 MBS codes are properly loaded with embeddings

**Expected Result:**
- 6,001 MBS codes in `regional_medical_codes` table
- All codes have embeddings (no NULL values)
- All codes marked as active
- Proper MBS complexity levels assigned

**Test Query:**
```sql
SELECT 
  COUNT(*) as total_mbs_codes,
  COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as codes_with_embeddings,
  COUNT(CASE WHEN active = true THEN 1 END) as active_codes,
  COUNT(CASE WHEN mbs_complexity_level IS NOT NULL THEN 1 END) as codes_with_complexity
FROM regional_medical_codes 
WHERE code_system = 'mbs';
```

**RESULT:** 🔄 PENDING

---

### Test Case 2: MBS Complexity Level Distribution

**Objective:** Verify MBS complexity levels are correctly assigned based on group codes

**Expected Distribution:**
- Group A (Consultations): 'basic' complexity
- Group T (Operations): 'complex' complexity  
- Group P (Pathology): 'complex' complexity
- Group I (Imaging): 'intermediate' complexity
- Group D (Dental): 'intermediate' complexity

**Test Query:**
```sql
SELECT 
  mbs_complexity_level,
  COUNT(*) as code_count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM regional_medical_codes WHERE code_system = 'mbs'), 1) as percentage,
  array_agg(DISTINCT substring(grouping_code from 1 for 1)) as group_prefixes
FROM regional_medical_codes 
WHERE code_system = 'mbs'
GROUP BY mbs_complexity_level
ORDER BY code_count DESC;
```

**RESULT:** 🔄 PENDING

---

### Test Case 3: MBS Vector Search Functionality

**Test Entities:**
1. **Basic Consultation:** "General practitioner consultation"
2. **Diagnostic Imaging:** "Chest X-ray examination"  
3. **Surgical Procedure:** "Appendectomy laparoscopic"
4. **Pathology Test:** "Full blood count analysis"

**Expected Behavior:**
- Each entity should find relevant MBS procedure codes
- Similarity scores should be >0.60 for good matches
- Results should cluster by procedure type
- Complexity levels should match entity complexity

**Test Script:** `test-mbs-vector-search.ts`

**RESULT:** 🔄 PENDING

---

### Test Case 4: Smart Entity-Type Strategy for Procedures

**Objective:** Verify procedure entities use optimal embedding text

**Test Scenarios:**

| Original Text | AI Interpretation | Expected Embedding Text | Rationale |
|---------------|-------------------|-------------------------|-----------|
| "ECG" | "Electrocardiogram recording" | "Electrocardiogram recording" | Use expanded form |
| "Blood pressure check" | "Blood pressure measurement" | "Blood pressure measurement" | AI expansion preferred |
| "Appendectomy" | "Appendectomy" | "Appendectomy" | Original sufficient |
| "X-ray chest" | "Chest radiographic examination" | "Chest radiographic examination" | Medical terminology |

**Test Implementation:**
```typescript
// Test entity-type strategy for procedures
const procedureEntities = [
  {
    entity_subtype: 'procedure',
    original_text: 'ECG',
    ai_visual_interpretation: 'Electrocardiogram recording'
  },
  // ... other test cases
];

procedureEntities.forEach(entity => {
  const embeddingText = getEmbeddingText(entity);
  // Verify optimal text selection
});
```

**RESULT:** 🔄 PENDING

---

### Test Case 5: MBS vs PBS Code System Integration

**Objective:** Verify MBS codes don't interfere with PBS medication searches

**Test Scenario:**
1. Search for medication: "Lisinopril 10mg"
2. Expected: Only PBS codes returned, no MBS contamination
3. Search for procedure: "Blood pressure measurement"  
4. Expected: MBS codes returned, minimal PBS contamination

**Quality Metrics:**
- Medication searches: >90% PBS codes in top 10 results
- Procedure searches: >90% MBS codes in top 10 results
- Cross-contamination: <10% wrong code system in results

**RESULT:** 🔄 PENDING

---

### Test Case 6: Regional Code Performance with Combined Dataset

**Objective:** Ensure vector search performance remains acceptable with 20,383 codes

**Performance Targets:**
- Vector search latency: <200ms p95 (updated for larger dataset)
- Memory usage: Reasonable buffer hit patterns
- Index utilization: IVFFlat index actively used

**Test Queries:**
```sql
-- Performance test with EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS) 
SELECT code_value, display_name, mbs_complexity_level,
       (1 - (embedding <=> '[0.1,0.2,...]'::vector))::REAL as similarity_score
FROM regional_medical_codes 
WHERE code_system = 'mbs' AND active = true
ORDER BY embedding <=> '[0.1,0.2,...]'::vector
LIMIT 10;
```

**RESULT:** 🔄 PENDING

---

## Test Data and Mock Entities

### Mock Procedure Entities

```typescript
const mockProcedureEntities: Pass1Entity[] = [
  {
    id: 'test-proc-001',
    entity_subtype: 'procedure',
    original_text: 'General practitioner consultation',
    ai_visual_interpretation: 'Standard GP consultation in office',
    confidence_score: 0.95,
  },
  {
    id: 'test-proc-002', 
    entity_subtype: 'procedure',
    original_text: 'Chest X-ray',
    ai_visual_interpretation: 'Chest radiographic examination',
    confidence_score: 0.92,
  },
  {
    id: 'test-proc-003',
    entity_subtype: 'procedure', 
    original_text: 'Blood test',
    ai_visual_interpretation: 'Pathology blood examination',
    confidence_score: 0.88,
  },
  {
    id: 'test-proc-004',
    entity_subtype: 'procedure',
    original_text: 'Minor surgery',
    ai_visual_interpretation: 'Minor surgical procedure',
    confidence_score: 0.85,
  }
];
```

### Expected MBS Code Matches

| Test Entity | Expected MBS Group | Expected Complexity | Example Match |
|-------------|-------------------|-------------------|---------------|
| GP consultation | A (Professional attendance) | basic | Item 23, 36, 44 |
| Chest X-ray | I (Diagnostic imaging) | intermediate | Item 58112, 58506 |
| Blood test | P (Pathology) | complex | Item 65060, 65070 |
| Minor surgery | T (Operations) | complex | Item 30071, 30075 |

---

## Validation Checklist

### Database Integrity
- [ ] All 6,001 MBS codes populated
- [ ] All codes have non-null embeddings
- [ ] All codes have proper complexity levels
- [ ] Embedding batch tracking links correctly
- [ ] No duplicate code_values

### Functional Validation
- [ ] MBS vector search returns relevant results
- [ ] Smart Entity-Type Strategy works for procedures
- [ ] MBS codes don't contaminate medication searches
- [ ] PBS codes don't contaminate procedure searches
- [ ] Complexity levels match procedure types

### Performance Validation
- [ ] Vector search completes in <200ms
- [ ] Index utilization is optimal
- [ ] Memory usage is reasonable
- [ ] Concurrent searches don't degrade performance

### Integration Validation
- [ ] Pass 1.5 worker module handles MBS entities
- [ ] Candidate selection works with MBS codes
- [ ] Error handling graceful for MBS queries
- [ ] Audit logging captures MBS searches

---

## Success Criteria

### Primary Success Criteria
1. **Data Completeness:** 100% of MBS codes properly embedded
2. **Search Functionality:** Procedure entities find relevant MBS codes
3. **Performance:** Vector search <200ms with combined dataset
4. **Integration:** No regression in existing PBS functionality

### Secondary Success Criteria
1. **Complexity Mapping:** Proper complexity levels assigned
2. **Cross-System Isolation:** Minimal contamination between PBS/MBS
3. **Semantic Quality:** Similarity scores >0.70 for good matches
4. **Error Handling:** Graceful failures and comprehensive logging

---

## Test Script Implementation

### Test Execution Script

**File:** `test-mbs-procedure-validation.ts`

```typescript
/**
 * Test 02: MBS Procedure Code Validation
 * 
 * Comprehensive test of MBS component in Pass 1.5 system
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Load environment
dotenv.config({ path: path.join(__dirname, '../../../../../apps/web/.env.local') });

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runMBSValidationTest() {
  console.log('🏥 Test 02: MBS Procedure Code Validation');
  console.log('=' * 80);
  
  // Test Case 1: Data Population Verification
  console.log('\n📊 Test Case 1: MBS Data Population Verification');
  // Implementation here...
  
  // Test Case 2: Complexity Level Distribution  
  console.log('\n🎯 Test Case 2: MBS Complexity Level Distribution');
  // Implementation here...
  
  // Test Case 3: Vector Search Functionality
  console.log('\n🔍 Test Case 3: MBS Vector Search Functionality');
  // Implementation here...
  
  // Test Case 4: Smart Entity-Type Strategy
  console.log('\n🧠 Test Case 4: Smart Entity-Type Strategy for Procedures');
  // Implementation here...
  
  // Test Case 5: Code System Integration
  console.log('\n🔄 Test Case 5: MBS vs PBS Integration');
  // Implementation here...
  
  // Test Case 6: Performance Validation
  console.log('\n⚡ Test Case 6: Performance with Combined Dataset');
  // Implementation here...
  
  console.log('\n✅ MBS Procedure Code Validation Complete');
}

export { runMBSValidationTest };
```

---

## Post-Test Actions

### If Tests Pass
1. **Update Documentation:** Mark MBS component as production-ready
2. **Performance Baseline:** Record benchmark metrics for monitoring
3. **Integration Ready:** Proceed with Pass 2 integration planning
4. **Monitoring Setup:** Configure alerts for MBS search performance

### If Tests Fail
1. **Issue Analysis:** Identify root cause of failures
2. **Data Remediation:** Fix any data quality issues
3. **Code Fixes:** Address any implementation bugs  
4. **Retest:** Execute full test suite again
5. **Escalation:** Report any fundamental architecture issues

---

## Risk Assessment

### High Risk Areas
- **Performance Degradation:** 3x more data may impact search speed
- **Index Optimization:** May need index tuning for larger dataset
- **Memory Usage:** Increased buffer requirements

### Medium Risk Areas
- **Cross-System Contamination:** MBS results in medication searches
- **Complexity Mapping:** Incorrect complexity levels
- **Integration Issues:** Pass 1.5 worker module compatibility

### Low Risk Areas
- **Data Quality:** XML parsing proven reliable
- **Embedding Generation:** OpenAI API consistently working
- **Basic Functionality:** Core vector search already validated

---

**Test Ready for Execution** ✅  
**Estimated Duration:** 45-60 minutes  
**Prerequisites:** OpenAI API key, Supabase access, 6,001 MBS codes loaded