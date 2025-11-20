# Schema Validation Report - Pass 0.5 Database Inserts
**Date:** 2025-11-10
**Purpose:** Comprehensive validation of all insert statements against database constraints

---

## Summary

**Files Analyzed:**
- `apps/render-worker/src/pass05/index.ts` (ai_processing_sessions + pass05_encounter_metrics inserts)

**Tables Validated:**
1. `ai_processing_sessions` - Session tracking
2. `pass05_encounter_metrics` - Cost and performance metrics

---

## ai_processing_sessions Insert Validation

### Current Code (index.ts lines 114-130)
```typescript
await supabase.from('ai_processing_sessions').insert({
  shell_file_id: input.shellFileId,          // ✅ uuid, NOT NULL
  patient_id: input.patientId,               // ✅ uuid, NOT NULL
  session_type: 'shell_file_processing',     // ✅ Valid enum value
  session_status: 'completed',               // ✅ Valid enum value
  ai_model_name: encounterResult.aiModel,    // ✅ text, NOT NULL
  processing_mode: 'automated',              // ✅ Valid enum value (FIXED)
  workflow_step: 'encounter_discovery',      // ⚠️ INVALID - not in CHECK constraint
  total_steps: 1,                            // ✅ integer, nullable
  completed_steps: 1,                        // ✅ integer, nullable
  processing_started_at: new Date(startTime).toISOString(),  // ✅ timestamp, NOT NULL
  processing_completed_at: new Date().toISOString()          // ✅ timestamp, nullable
})
```

### Constraint Validation

#### ✅ PASSING Constraints:
1. **session_type** CHECK: `'shell_file_processing'` IN ('shell_file_processing', 'entity_extraction', 'clinical_validation', 'profile_classification', 'decision_support', 'semantic_processing')
   - Status: ✅ VALID

2. **session_status** CHECK: `'completed'` IN ('initiated', 'processing', 'completed', 'failed', 'cancelled')
   - Status: ✅ VALID

3. **processing_mode** CHECK: `'automated'` IN ('automated', 'human_guided', 'validation_only')
   - Status: ✅ VALID (after fix from 'standard')

#### ❌ FAILING Constraints:
4. **workflow_step** CHECK: `'encounter_discovery'` NOT IN ('entity_detection', 'profile_classification', 'clinical_extraction', 'semantic_processing', 'validation', 'decision_support', 'completed')
   - Status: ❌ **INVALID**
   - Error: Will violate CHECK constraint
   - Fix Required: Use valid value (e.g., 'entity_detection' or 'clinical_extraction')

### Required vs Provided Fields

| Field | Required (NOT NULL) | Provided | Status |
|-------|---------------------|----------|--------|
| id | NO (has default) | Auto-generated | ✅ |
| patient_id | YES | ✅ Provided | ✅ |
| shell_file_id | YES | ✅ Provided | ✅ |
| session_type | YES | ✅ Provided | ✅ |
| session_status | NO (default: 'initiated') | ✅ Provided | ✅ |
| ai_model_name | NO (default: 'v3') | ✅ Provided | ✅ |
| model_config | NO (default: '{}') | ❌ Not provided | ✅ (has default) |
| processing_mode | NO (nullable) | ✅ Provided | ✅ |
| workflow_step | NO (default: 'entity_detection') | ✅ Provided | ❌ **INVALID VALUE** |
| total_steps | NO (default: 5) | ✅ Provided | ✅ |
| completed_steps | NO (default: 0) | ✅ Provided | ✅ |
| processing_started_at | NO (default: now()) | ✅ Provided | ✅ |
| processing_completed_at | NO (nullable) | ✅ Provided | ✅ |

---

## pass05_encounter_metrics Insert Validation

### Current Code (index.ts lines 151-171)
```typescript
await supabase.from('pass05_encounter_metrics').insert({
  shell_file_id: input.shellFileId,                           // ✅
  patient_id: input.patientId,                                // ✅
  processing_session_id: session.id,                          // ✅
  encounters_detected: encounters.length,                     // ✅
  real_world_encounters: realWorldCount,                      // ✅
  pseudo_encounters: pseudoCount,                             // ✅
  planned_encounters: plannedCount,                           // ✅
  processing_time_ms: Date.now() - startTime,                 // ✅
  ai_model_used: encounterResult.aiModel,                     // ✅
  input_tokens: encounterResult.inputTokens,                  // ✅
  output_tokens: encounterResult.outputTokens,                // ✅
  total_tokens: encounterResult.inputTokens + encounterResult.outputTokens,  // ✅
  ai_cost_usd: encounterResult.aiCostUsd,                     // ✅
  encounter_confidence_average: avgConfidence,                // ✅
  encounter_types_found: encounterTypes,                      // ✅
  total_pages: input.pageCount,                               // ✅
  ocr_average_confidence: calculateAverageConfidence(input.ocrOutput)  // ✅
})
```

### Required Fields Checklist

| Field | Required (NOT NULL) | Provided | Status |
|-------|---------------------|----------|--------|
| id | NO (has default) | Auto-generated | ✅ |
| patient_id | YES | ✅ Provided | ✅ |
| shell_file_id | YES | ✅ Provided | ✅ |
| processing_session_id | YES | ✅ Provided | ✅ |
| encounters_detected | YES | ✅ Provided | ✅ |
| real_world_encounters | YES | ✅ Provided | ✅ |
| pseudo_encounters | YES | ✅ Provided | ✅ |
| processing_time_ms | YES | ✅ Provided | ✅ |
| processing_time_seconds | NO (nullable) | ❌ Not provided | ✅ (nullable) |
| ai_model_used | YES | ✅ Provided | ✅ |
| input_tokens | YES | ✅ Provided | ✅ |
| output_tokens | YES | ✅ Provided | ✅ |
| total_tokens | YES | ✅ Provided | ✅ |
| ocr_average_confidence | NO (nullable) | ✅ Provided | ✅ |
| encounter_confidence_average | NO (nullable) | ✅ Provided | ✅ |
| encounter_types_found | NO (nullable) | ✅ Provided | ✅ |
| total_pages | YES | ✅ Provided | ✅ |
| batching_required | NO (default: false) | ❌ Not provided | ✅ (has default) |
| user_agent | NO (nullable) | ❌ Not provided | ✅ (nullable) |
| ip_address | NO (nullable) | ❌ Not provided | ✅ (nullable) |
| created_at | NO (default: now()) | ❌ Not provided | ✅ (has default) |
| planned_encounters | YES | ✅ Provided | ✅ |
| ai_cost_usd | NO (nullable) | ✅ Provided | ✅ |

### Constraint Validation

✅ **ALL constraints passing** - No CHECK constraints on this table, only FK constraints which are satisfied.

---

## Critical Issues Found

### Issue 1: workflow_step Invalid Value ❌ CRITICAL
**Location:** `apps/render-worker/src/pass05/index.ts` line 123
**Current Value:** `'encounter_discovery'`
**Valid Values:** `'entity_detection'`, `'profile_classification'`, `'clinical_extraction'`, `'semantic_processing'`, `'validation'`, `'decision_support'`, `'completed'`
**Impact:** Insert will fail with CHECK constraint violation
**Fix:** Change to `'clinical_extraction'` (most semantically accurate for Pass 0.5)

---

## Recommended Fixes

### Fix 1: Update workflow_step
```typescript
// BEFORE:
workflow_step: 'encounter_discovery',

// AFTER:
workflow_step: 'clinical_extraction', // Pass 0.5 extracts encounter metadata
```

**Rationale:** Pass 0.5 extracts clinical encounter metadata from documents, which aligns with 'clinical_extraction' workflow step.

---

## Testing Checklist

After applying fixes:
- [ ] Build TypeScript: `pnpm run build`
- [ ] Deploy to Render
- [ ] Upload 3-page test document
- [ ] Verify `ai_processing_sessions` row created successfully
- [ ] Verify `pass05_encounter_metrics` row created successfully
- [ ] Check shell_files.status = 'completed'
- [ ] Check all foreign keys satisfied

---

## Schema Reference

### ai_processing_sessions Valid Enum Values
```sql
session_type: 'shell_file_processing', 'entity_extraction', 'clinical_validation',
              'profile_classification', 'decision_support', 'semantic_processing'

session_status: 'initiated', 'processing', 'completed', 'failed', 'cancelled'

processing_mode: 'automated', 'human_guided', 'validation_only'

workflow_step: 'entity_detection', 'profile_classification', 'clinical_extraction',
               'semantic_processing', 'validation', 'decision_support', 'completed'
```

---

## Validation Summary

| Insert Statement | Total Fields | Valid Fields | Invalid Fields | Status |
|------------------|--------------|--------------|----------------|--------|
| ai_processing_sessions | 11 | 10 | 1 | ❌ **FAILING** |
| pass05_encounter_metrics | 17 | 17 | 0 | ✅ **PASSING** |

**Overall:** 1 critical issue must be fixed before deployment
