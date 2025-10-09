# Pass 1 Table Audits - Consolidated Fixes & Implementation Plan

**Created:** 2025-10-10
**Purpose:** Systematic consolidation of all fixes, migrations, and action items from Pass 1 table audits

---

## Audit Files Inventory

**Table Audit Files (8):**
- [ ] `ai_confidence_scoring-COLUMN-AUDIT-ANSWERS.md`
- [ ] `ai_processing_sessions-COLUMN-AUDIT-ANSWERS.md`
- [ ] `entity_processing_audit-COLUMN-AUDIT-ANSWERS.md`
- [ ] `job_queue-COLUMN-AUDIT-ANSWERS.md`
- [ ] `manual_review_queue-COLUMN-AUDIT-ANSWERS.md`
- [ ] `pass1_entity_metrics-COLUMN-AUDIT-ANSWERS.md`
- [ ] `profile_classification_audit-COLUMN-AUDIT-ANSWERS.md`
- [ ] `shell_files-COLUMN-AUDIT-ANSWERS.md`

**Support Files:**
- `README.md` (overview)
- `TOKEN-BREAKDOWN-MIGRATION-CHECKLIST.md` (token breakdown migration tracking)

---

## Action Items by Table

### 1. ai_confidence_scoring

**Audit File:** `ai_confidence_scoring-COLUMN-AUDIT-ANSWERS.md`
**Status:** ✅ Reviewed - CRITICAL fixes required

#### Identified Issues:

**Issue 1: Schema-Worker Field Name Mismatch (CRITICAL - BLOCKING)**
- Worker builds records with field names that don't exist in database schema
- Worker provides: `shell_file_id`, `patient_id`, `entity_id`, `pass1_detection_confidence`, `pass1_classification_confidence`, `pass1_cross_validation_score`, `pass1_overall_confidence`, `confidence_factors` (JSONB), `uncertainty_sources`
- Schema expects: `entity_processing_audit_id`, `entity_detection_confidence`, `text_extraction_confidence`, `spatial_alignment_confidence`, `vision_model_confidence`, `language_model_confidence`, `classification_model_confidence`, `overall_confidence`, `reliability_score`, `clinical_relevance_score`, `confidence_flags`, `processing_time_ms`, `model_version`, `calibration_score`
- **Impact:** Worker INSERT fails with PostgreSQL error, table remains empty (0 records despite 107 low-confidence entities identified)

**Issue 2: Bridge Schema Not Followed (PROCESS ISSUE)**
- Worker implemented 11 columns vs bridge schema's 24 columns (13 missing)
- Different naming convention (pass1_* prefix instead of schema names)
- Consolidated fields (confidence_factors JSONB instead of discrete columns)
- Missing critical fields: `entity_processing_audit_id`, `model_version`, `processing_time_ms`

**Issue 3: Legacy Test Data with Placeholder Values (INFORMATIONAL)**
- October 7 data contains hardcoded 0.500 confidence scores (statistically impossible)
- All entities have identical values, OCR confidence is NULL
- Misleading historical data (doesn't affect current operations)

#### Recommended Fixes:

**Fix 1: Rewrite Worker to Match Bridge Schema (RECOMMENDED - 4-6 hours)**
- Complete worker rewrite following bridge schema specification exactly
- Implement `buildAIConfidenceScoringRecords()` function with:
  - Proper field mapping: `entity_processing_audit_id`, `entity_detection_confidence`, `overall_confidence`, `confidence_flags`
  - Composite score calculations: `calculateOverallConfidence()`, `calculateReliabilityScore()`, `calculateClinicalRelevance()`
  - Helper functions: `calculateSpatialConfidence()`, `deriveLanguageConfidence()`, `detectOutlier()`, `buildConfidenceFlags()`
  - Model performance tracking: `processing_time_ms`, `model_version`
- Benefits: Full compliance, rich quality analysis, proper entity-level tracking, future-ready for Pass 2

**Fix 2: Clean Legacy Test Data (5 minutes)**
- Delete or flag October 7 test data with placeholder 0.500 values
- Options: DELETE query or ADD `is_test_data` flag column

**Fix 3: Add Integration Tests for Schema Compliance (2-3 hours)**
- Prevent future schema-worker mismatches with automated testing
- Verify record fields match schema columns
- Enforce NUMERIC(4,3) precision constraints
- Living documentation of schema requirements

#### Migration Requirements:

- **Schema Changes:** None (schema is correct, worker is wrong)
- **Data Migration:** Delete October 7 test data (optional cleanup)
- **Worker Function Changes:** CRITICAL - Complete rewrite of `buildAIConfidenceScoringRecords()` required
  - File: `apps/render-worker/src/pass1/pass1-database-builder.ts` (estimated)
  - Functions to implement:
    - `buildAIConfidenceScoringRecords()` - Main builder
    - `calculateOverallConfidence()` - Composite score
    - `calculateReliabilityScore()` - Variance-based consistency
    - `calculateClinicalRelevance()` - Priority mapping
    - `calculateSpatialConfidence()` - Bbox agreement
    - `deriveLanguageConfidence()` - AI response metadata
    - `detectOutlier()` - Z-score detection
    - `buildConfidenceFlags()` - Quality warnings array

#### Dependencies:

- **Depends on:** `entity_processing_audit` table (foreign key: `entity_processing_audit_id`)
- **Depends on:** `ai_processing_sessions` table (foreign key: `processing_session_id`)
- **Used by:** Manual review workflows (confidence thresholds)
- **Used by:** Quality dashboards (confidence trend analysis)
- **Future Pass 2:** Will UPDATE `clinical_coding_confidence` field (not yet implemented)

---

### 2. ai_processing_sessions

**Audit File:** `ai_processing_sessions-COLUMN-AUDIT-ANSWERS.md`
**Status:** ✅ Reviewed - MEDIUM priority fixes (naming clarity)

#### Identified Issues:

**Issue 1: ai_model_version Column Name Confusing (MEDIUM)**
- Column named `ai_model_version` but contains model name "gpt-5-mini" (not version number)
- Expected: Should be named `ai_model_name` OR should store pipeline version "v3"
- **Impact:** Confusing for developers and analytics queries

**Issue 2: Session Creation Timing Pattern Unexpected (MEDIUM)**
- `processing_started_at` (05:31:54) is BEFORE `created_at` (05:36:49) by 4m55s
- Pattern: Worker creates session record upon completion, not at start
- Expected: Session created when processing starts, updated when completes
- **Impact:** Can't query "sessions currently processing" by filtering `created_at`
- **Analysis:** May be intentional (atomic insert of complete session) or a bug - needs verification

**Enhancement Opportunities (LOW PRIORITY):**
- workflow_step could be more granular (sub-steps for better progress tracking)
- session_type values could map to passes (e.g., 'pass1_entity_extraction')
- total_steps default (5) vs actual (2) mismatch documented

#### Recommended Fixes:

**Fix 1: Rename ai_model_version to ai_model_name (MEDIUM - 10 minutes)**
- **Option A (Recommended):** Simple rename
  ```sql
  ALTER TABLE ai_processing_sessions RENAME COLUMN ai_model_version TO ai_model_name;
  ALTER TABLE ai_processing_sessions ALTER COLUMN ai_model_name SET DEFAULT 'gpt-4o-mini';
  ```
- **Option B:** Add separate `pipeline_version` column and keep both

**Fix 2: Verify Session Creation Timing Pattern (MEDIUM - 1 hour investigation)**
- Check worker code to confirm if retroactive session creation is intentional
- **If intentional:** Document pattern clearly (retroactive for atomicity)
- **If bug:** Modify worker to create session at start, update at completion
- Decision factors:
  - Pro (retroactive): Atomic insert, no incomplete records
  - Con (retroactive): Can't query currently processing sessions by created_at

#### Migration Requirements:

- **Schema Changes:** Rename `ai_model_version` to `ai_model_name` (optional but recommended for clarity)
- **Data Migration:** None (simple column rename)
- **Worker Function Changes:**
  - Verify session creation timing (investigate worker code)
  - If bug fix needed: Modify worker to create session at job start instead of completion
  - File: `apps/render-worker/src/pass1/session-manager.ts` (estimated)

#### Dependencies:

- **FK Target for:** `entity_processing_audit`, `profile_classification_audit`, `pass1_entity_metrics`, `manual_review_queue`, `ai_confidence_scoring`
- **Depends on:** `user_profiles` (patient_id FK), `shell_files` (shell_file_id FK)
- **Used by:** All Pass 1-3 audit tables (central coordination table)
- **Analytics:** Performance tracking, quality monitoring, error analysis

---

### 3. entity_processing_audit

**Audit File:** `entity_processing_audit-COLUMN-AUDIT-ANSWERS.md`
**Status:** ✅ Reviewed - Migrations 16 & 17 COMPLETED, 1 worker fix needed

#### Identified Issues:

**Issue 1: Redundant Session-Level Columns (RESOLVED - Migrations 16 & 17)**
- ✅ **COMPLETED:** Migration 16 removed `pass1_model_used`, `pass1_vision_processing`
- ✅ **COMPLETED:** Migration 17 removed `pass1_token_usage`, `pass1_image_tokens`, `pass1_cost_estimate`
- All 5 columns were duplicating session-level data across every entity (40 entities × 5 columns = 200 redundant fields per document)
- Data now properly stored in `pass1_entity_metrics` table (single source of truth)

**Issue 2: Unmapped AI Flag Arrays (MEDIUM - Worker Mapping Gap)**
- `validation_flags` and `compliance_flags` arrays are empty despite AI generating the data
- AI prompt includes quality_flags and safety_flags but translation code doesn't extract them
- **Impact:** Missing quality/compliance tracking for healthcare workflows (HIPAA, identity verification)

#### Recommended Fixes:

**Fix 1: Add Flag Mapping to Translation Code (MEDIUM - 15 minutes)**
```typescript
// apps/render-worker/src/pass1/pass1-translation.ts
// Add around line 125:
validation_flags: aiResponse.quality_assessment?.quality_flags || [],
compliance_flags: aiResponse.profile_safety?.safety_flags || [],
```
- Captures AI-generated quality and safety flags
- Essential for healthcare compliance tracking
- No schema changes needed (columns already exist)

#### Migration Requirements:

- **Schema Changes:** None (Migrations 16 & 17 already completed all removals)
- **Data Migration:** None required
- **Worker Function Changes:** Add flag extraction to `pass1-translation.ts`
  - File: `apps/render-worker/src/pass1/pass1-translation.ts` (around line 125)
  - Add: `validation_flags` and `compliance_flags` extraction from AI response

#### Dependencies:

- **Depends on:** `shell_files` (shell_file_id FK), `user_profiles` (patient_id FK), `ai_processing_sessions` (processing_session_id FK)
- **Used by:** Pass 2 enrichment (reads `requires_schemas`, `location_context`, `original_text`)
- **FK Target for:** `ai_confidence_scoring` (entity_processing_audit_id)
- **Audit Trail:** Links to final clinical tables (`final_event_id`, `final_encounter_id`, etc.)

---

### 4. job_queue

**Audit File:** `job_queue-COLUMN-AUDIT-ANSWERS.md`
**Status:** ✅ Reviewed - 3 CRITICAL fixes + 2 MEDIUM optimizations

#### Identified Issues:

**Issue 1: worker_id Environment Variable Not Expanded (CRITICAL)**
- Literal string `"render-${RENDER_SERVICE_ID}"` instead of actual Render service ID
- **Impact:** Cannot identify which Render worker instance processed jobs; hinders observability and debugging
- Verified on jobs 042c94ab and b283b966

**Issue 2: heartbeat_at After Completion (CRITICAL)**
- heartbeat_at timestamp occurs 15 seconds AFTER completed_at
- **Impact:** Can cause false timeout reclaims; confuses job lifecycle tracking
- Root cause: `complete_job()` function doesn't clear heartbeat_at when marking job complete
- Verified on job b283b966 (completed_at: 05:36:50, heartbeat_at: 05:37:05)

**Issue 3: actual_duration Always NULL (CRITICAL)**
- actual_duration not populated on job completion despite valid timestamps
- **Impact:** Missing duration metrics prevents performance analysis, capacity planning, cost estimation
- Root cause: Worker's `completeJob()` doesn't pass duration; `complete_job()` doesn't calculate from timestamps
- Verified on job b283b966 (should be ~15 seconds based on timestamps)

**Issue 4: patient_id Not Populated (MEDIUM - Performance)**
- patient_id column is NULL; data exists in job_payload JSONB
- **Impact:** Inefficient queries must parse JSONB; prevents indexed patient-specific job lookups
- **Safety Note:** Patient assignment concern is ALREADY HANDLED by profile_classification_audit contamination detection system

**Issue 5: shell_file_id Not Populated (MEDIUM - Performance)**
- shell_file_id column is NULL; data exists in job_payload JSONB
- **Impact:** Cannot JOIN with shell_files table; prevents efficient document processing tracking

**Correct Behaviors (No Action):**
- Dead letter queue fully implemented (max_retries=3, DLQ with dead_letter_at)
- NULL handling generally correct for optional/lifecycle fields
- Legacy lock fields appropriately NULL (V3 uses PostgreSQL FOR UPDATE SKIP LOCKED)
- Priority hardcoded to 5 (standard) - available for future dynamic prioritization
- Error details properly structured in JSONB

#### Recommended Fixes:

**Fix 1: Expand worker_id Environment Variable (CRITICAL - 5 minutes)**
```typescript
// apps/render-worker/src/worker.ts
// Current: this.workerId = `render-${process.env.RENDER_SERVICE_ID}`;
// Fixed:
this.workerId = `render-${process.env.RENDER_SERVICE_ID || 'local-dev'}`;
```

**Fix 2: Clear heartbeat_at on Completion (CRITICAL - 10 minutes)**
```sql
-- shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql:636-668
UPDATE job_queue SET
    status = 'completed',
    completed_at = NOW(),
    heartbeat_at = NULL,  -- ADD THIS LINE
    job_result = p_job_result,
    updated_at = NOW()
WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'processing';
```
- Also verify worker clears heartbeat interval: `clearInterval(this.heartbeatInterval)`

**Fix 3: Auto-Calculate actual_duration (CRITICAL - 10 minutes)**
```sql
-- Option A (Recommended - database-side):
UPDATE job_queue SET
    status = 'completed',
    completed_at = NOW(),
    heartbeat_at = NULL,
    actual_duration = NOW() - started_at,  -- ADD THIS LINE
    job_result = p_job_result,
    updated_at = NOW()
WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'processing';
```

**Fix 4 & 5: Populate patient_id and shell_file_id (MEDIUM - 30 minutes)**
- **Option A (Recommended):** Update `enqueue_job_v3()` to extract from JSONB
  ```sql
  INSERT INTO job_queue (..., patient_id, shell_file_id)
  VALUES (..., (job_payload->>'patient_id')::uuid, (job_payload->>'shell_file_id')::uuid)
  ```
- **Option B:** Update Edge Function to pass explicit parameters

#### Migration Requirements:

- **Schema Changes:** None (columns already exist)
- **Database Function Changes:**
  - File: `shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql`
  - Function: `complete_job()` (lines 636-668)
    - Add: `heartbeat_at = NULL`
    - Add: `actual_duration = NOW() - started_at`
  - Function: `enqueue_job_v3()` (if using Option A for Fix 4&5)
    - Add: Extract patient_id and shell_file_id from job_payload to columns
- **Worker Function Changes:**
  - File: `apps/render-worker/src/worker.ts`
  - Fix: Expand RENDER_SERVICE_ID environment variable
  - Verify: Clear heartbeat interval on job completion

#### Dependencies:

- **Depends on:** `user_profiles` (patient_id FK), `shell_files` (shell_file_id FK), `clinical_narratives` (narrative_id FK)
- **Used by:** Worker coordination, job claiming (`claim_next_job_v3`), job completion (`complete_job`)
- **RLS:** Service role only access (users cannot read job_queue)
- **Monitoring:** Dead letter queue needs admin dashboard (future enhancement)

---

### 5. manual_review_queue

**Audit File:** `manual_review_queue-COLUMN-AUDIT-ANSWERS.md`
**Status:** ✅ Reviewed - 1 MEDIUM fix (title generation logic)

#### Identified Issues:

**Issue 1: review_title Logic Misleading (MEDIUM)**
- Title says "Low Confidence Entity: provider_identifier" but `ai_confidence_score` is 0.950 (95% - HIGH confidence)
- Review was triggered by `ai_concerns: ["AI-OCR discrepancy: concatenation"]`, not low confidence
- **Impact:** Misleading review queue titles confuse reviewers about actual issue
- Root cause: Title generation logic uses simple confidence threshold without considering trigger reason

**Issue 2: ai_suggestions NULL Handling (LOW - Data Quality)**
- `ai_suggestions` can be NULL but shouldn't be for entity_validation review_type
- Current sample has suggestions, but schema allows NULL
- **Impact:** Reviewers may lack guidance on what to check

**Correct Behaviors:**
- Comprehensive workflow tracking (pending → assigned → in_progress → completed)
- Rich context data in `clinical_context` JSONB
- Quality metrics for review process improvement (`review_quality_score`, `reviewer_confidence`)
- Proper CASCADE behavior for data integrity
- Review triggers working correctly (OCR discrepancy at 95% confidence shows safety net)

#### Recommended Fixes:

**Fix 1: Update Title Generation Logic (MEDIUM - 20 minutes)**
```typescript
// Current (likely in worker):
if (confidence < 0.96) {
  title = `Low Confidence Entity: ${subtype}`;
}

// Should be:
if (ai_concerns.includes('AI-OCR discrepancy')) {
  title = `OCR Discrepancy: ${subtype}`;
} else if (ai_concerns.includes('hallucination')) {
  title = `Suspected AI Hallucination: ${subtype}`;
} else if (confidence < 0.96) {
  title = `Low Confidence Entity: ${subtype}`;
} else {
  title = `Manual Review Required: ${subtype}`;
}
```
- Prioritize actual trigger reason over generic confidence threshold
- Provides clearer context for review queue triage

**Fix 2: Enforce ai_suggestions NOT NULL for entity_validation (LOW - Optional)**
- Consider adding CHECK constraint or worker validation
- Ensures reviewers always have guidance

#### Migration Requirements:

- **Schema Changes:** None (consider adding CHECK constraint for ai_suggestions)
- **Data Migration:** None
- **Worker Function Changes:**
  - File: `apps/render-worker/src/pass1/manual-review-builder.ts` (estimated)
  - Update: Title generation logic to check `ai_concerns` array before defaulting to confidence-based title
  - Ensure: `ai_suggestions` always populated for entity_validation review_type

#### Dependencies:

- **Depends on:** `user_profiles` (patient_id FK), `ai_processing_sessions` (processing_session_id FK), `shell_files` (shell_file_id FK), `auth.users` (assigned_reviewer FK)
- **Used by:** Manual review workflow UI (pending → assigned → completed)
- **Blocks:** Pass 2 processing when `requires_human_review = true` in profile_classification_audit
- **Integration:** Gate 2 blocking mechanism ensures profile matching accuracy

---

### 6. pass1_entity_metrics

**Audit File:** `pass1_entity_metrics-COLUMN-AUDIT-ANSWERS.md`
**Status:** ✅ Reviewed - Migration 15 COMPLETED (token breakdown)

#### Identified Issues:

**Issue 1: Token Breakdown Data Loss (RESOLVED - Migration 15)**
- ✅ **COMPLETED:** Migration 15 added `input_tokens`, `output_tokens`, `total_tokens`
- ✅ **COMPLETED:** Removed `vision_tokens_used` and `cost_usd` columns
- Previous issue: Only stored total tokens, lost input/output breakdown needed for accurate cost calculation
- Different pricing for input vs output (GPT-4o: input $2.50/1M, output $10.00/1M = 4x difference)
- **Resolution:** Now captures full token breakdown from OpenAI API for precise cost analysis
- **Implementation Checklist:** [TOKEN-BREAKDOWN-MIGRATION-CHECKLIST.md](./TOKEN-BREAKDOWN-MIGRATION-CHECKLIST.md)

**Issue 2: processing_time_ms Audit Error (CORRECTED)**
- ✅ **VERIFIED CORRECT:** Timing includes full AI processing duration
- Previous audit incorrectly claimed timing was after AI call
- Actual code flow: Starts timer before AI call, ends after all processing
- Measures: AI vision processing (3-5 min) + translation + validation + stats

**Non-Issues (Working as Designed):**
- `user_agent` and `ip_address` NULL for background jobs (compliance design, documents audit completeness)
- `confidence_distribution` JSONB working correctly (quality metric for low/medium/high confidence tracking)
- Cost now calculated on-demand from token breakdown with current pricing

#### Recommended Fixes:

**No fixes required** - Migration 15 resolved the critical token breakdown issue.

**Optional Enhancement: Add Column Comments for Compliance Fields**
```sql
COMMENT ON COLUMN pass1_entity_metrics.user_agent IS
  'User agent of client that initiated processing (NULL for background jobs - future direct API use)';
COMMENT ON COLUMN pass1_entity_metrics.ip_address IS
  'IP address of client that initiated processing (NULL for background jobs - healthcare compliance audit design)';
```

#### Migration Requirements:

- **Schema Changes:** ✅ COMPLETED (Migration 15)
  - Added: `input_tokens`, `output_tokens`, `total_tokens`
  - Removed: `vision_tokens_used`, `cost_usd`
- **Data Migration:** Historical records lost input/output breakdown (unavoidable)
- **Worker Function Changes:** ✅ COMPLETED
  - File: `apps/render-worker/src/pass1/pass1-database-builder.ts`
  - Now stores: `prompt_tokens` → `input_tokens`, `completion_tokens` → `output_tokens`
  - Removed: `cost_usd` calculation (now on-demand from token breakdown)

**Cost Calculation Pattern (On-Demand):**
```sql
SELECT
  shell_file_id,
  input_tokens,
  output_tokens,
  total_tokens,
  -- GPT-5-mini pricing example
  (input_tokens / 1000000.0 * 0.15) +
  (output_tokens / 1000000.0 * 0.60) as cost_usd
FROM pass1_entity_metrics;
```

#### Dependencies:

- **Depends on:** `user_profiles` (profile_id FK), `shell_files` (shell_file_id FK), `ai_processing_sessions` (processing_session_id FK)
- **Used by:** Cost analysis, performance monitoring, quality metrics dashboards
- **Analytics:** Token usage trends, cost optimization, model comparison

---

### 7. profile_classification_audit

**Audit File:** `profile_classification_audit-COLUMN-AUDIT-ANSWERS.md`
**Status:** 🚨 **CRITICAL - Core system not implemented (hardcoded placeholders)**

#### Executive Summary:

**CRITICAL DISCOVERY:** Profile classification system is currently hardcoded placeholders, not actual AI-powered classification.

**The Hard Truth:**
```typescript
// apps/render-worker/src/pass1/pass1-database-builder.ts:198
recommended_profile_type: 'self',  // ← HARDCODED DEFAULT
identity_markers_found: [],        // ← HARDCODED EMPTY
age_indicators: [],                // ← HARDCODED EMPTY
relationship_indicators: [],       // ← HARDCODED EMPTY
```

**Impact:**
- ALL documents get classified as 'self' regardless of content
- AI doesn't receive user profile data for comparison
- Cannot properly classify child/dependent documents
- No multi-child profile support (which child if user has 3 children?)
- Manual review workflow incomplete (missing atomic approval function)

**Key Insight:** The `profile_confidence` score (0.980) isn't "confidence this is self profile" - it's "confidence this is a legitimate patient document." The AI has NO IDEA about user's existing profiles, demographic data, or which child profile if multiple exist.

#### Critical Issues (2):

**Issue 1: Profile Classification Hardcoded to 'self' (CRITICAL)**
- System always returns 'self' regardless of document content
- AI doesn't receive user profile data (name, DOB, existing children, pets)
- AI doesn't compare identity markers to profiles
- No actual profile type classification happening
- **Token cost:** ZERO - no AI analysis for profile type

**Issue 2: No Multi-Child Profile Support (CRITICAL)**
- Missing `recommended_profile_id UUID` column
- When user has multiple children, no way to match to specific child
- Schema only supports profile_type ('self', 'child', 'pet') not profile matching

#### Medium Issues (5):

3. **identity_markers_found arrays empty** - AI doesn't populate despite extracting identity data
4. **age_indicators empty** - AI doesn't populate age-related markers
5. **healthcare_provider_context NULL** - AI not extracting provider context from letterhead
6. **Non-Medicare identifiers not stored** - No schema for SSN, NHS, passport numbers
7. **classification_reasoning too generic** - Generic placeholder instead of detailed evidence-based reasoning

#### Low Priority Issues (2):

8. **Hardcoded database default for ai_model** - 'gpt-4o-mini' hardcoded, prevents model flexibility
9. **Profile bootstrap UX opportunity** - Could auto-populate user profile from first document upload

**📋 Full Analysis:** See [profile_classification_audit-COLUMN-AUDIT-ANSWERS.md](./profile_classification_audit-COLUMN-AUDIT-ANSWERS.md) for:
- Complete 917-line column-by-column analysis
- 3 major architectural decisions required
- Token cost breakdown analysis
- Implementation recommendations
- Profile bootstrap UX opportunity
- International identifier support strategy

#### Recommended Fixes:

**Fix 1: Implement Actual Profile Classification (CRITICAL - 2-3 days)**

**Phase 1: Schema Changes**
```sql
ALTER TABLE profile_classification_audit
ADD COLUMN recommended_profile_id UUID REFERENCES user_profiles(id);
```

**Phase 2: Worker Changes**
```typescript
// Fetch user's existing profiles
const userProfiles = await fetchUserProfiles(userId);

// Pass to AI for comparison
const profileClassification = await aiClassifyProfile({
  document_data: extractedData,
  user_profiles: {
    self_profile: { id, full_name, dob },
    child_profiles: [...],
    dependent_profiles: [...],
    pet_profiles: [...]
  }
});

// Store AI's specific match
recommended_profile_id: profileClassification.matched_profile_id,
recommended_profile_type: profileClassification.profile_type,
identity_markers_found: profileClassification.identity_markers,
age_indicators: profileClassification.age_indicators
```

**Fix 2: Create Manual Review Approval Function (HIGH - 2 hours)**
```sql
CREATE OR REPLACE FUNCTION approve_profile_classification(
  p_audit_id UUID,
  p_reviewer_decision TEXT,
  p_override_profile_type TEXT DEFAULT NULL,
  p_override_profile_id UUID DEFAULT NULL,
  p_reviewer_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  -- Update classification audit
  UPDATE profile_classification_audit
  SET reviewed_by_user = true,
      final_profile_assignment = COALESCE(p_override_profile_type, recommended_profile_type),
      cross_profile_risk_detected = false,
      manual_review_required = false
  WHERE id = p_audit_id;

  -- Update manual review queue
  UPDATE manual_review_queue
  SET review_status = 'completed',
      reviewer_decision = p_reviewer_decision
  WHERE processing_session_id = (
    SELECT processing_session_id FROM profile_classification_audit WHERE id = p_audit_id
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Fix 3-7: AI Prompt & Response Parsing Updates (MEDIUM - 1 day)**
- Update AI prompt to extract identity marker types
- Update AI prompt to extract age indicators
- Update AI prompt to extract provider context from letterhead
- Update AI prompt for detailed evidence-based reasoning
- Update pass1-database-builder.ts to populate all arrays from AI response

#### Migration Requirements:

- **Schema Changes:**
  - Add `recommended_profile_id UUID REFERENCES user_profiles(id)` column
  - Remove hardcoded default for `ai_model_used`
  - (Optional) Create `healthcare_identifiers` table for international identifier support

- **Database Function Changes:**
  - Create `approve_profile_classification()` RPC function
  - Create `fetch_user_profiles_for_classification()` helper function

- **Worker Function Changes:**
  - File: `apps/render-worker/src/pass1/pass1-database-builder.ts` (lines 198-225)
  - Fetch user profiles before AI call
  - Pass profile data to AI prompt
  - Parse and store identity_markers_found, age_indicators, relationship_indicators
  - Store recommended_profile_id from AI response
  - Update AI prompt with profile comparison logic

#### Architectural Decisions Required:

**Decision 1: Profile Classification Approach**
- **Option A:** Type-only (AI returns 'self'/'child'/'pet', user manually assigns to specific child)
- **Option B:** Specific matching (AI receives profile list, returns recommended_profile_id)
- **Option C (Recommended):** Hybrid (type first, manual selection if multiple children exist)

**Decision 2: International Identifier Support**
- **Short-term:** Store in identity_extraction_results JSONB (flexible)
- **Long-term:** Migrate to healthcare_identifiers table (proper international design)

**Decision 3: Profile Bootstrap UX**
- Should first-time users upload document first, then confirm extracted demographics? (AI-powered onboarding)

#### Dependencies:

- **Depends on:** `user_profiles` table (for profile matching), `ai_processing_sessions`, `shell_files`
- **Blocks:** Pass 2 processing when `manual_review_required = true` or `cross_profile_risk_detected = true`
- **Used by:** Manual review workflow, Pass 2 gating logic, contamination prevention system
- **Critical Safety:** This system prevents data contamination across patient profiles

---

### 8. shell_files

**Audit File:** `shell_files-COLUMN-AUDIT-ANSWERS.md`
**Status:** ✅ Reviewed - 2 MEDIUM feature gaps (job coordination)

#### Identified Issues:

**Issue 1: processing_job_id Not Linked (MEDIUM)**
- `processing_job_id` column is NULL despite job_queue coordination
- **Impact:** Cannot trace processing back to specific job for debugging
- Cannot correlate shell_files with job_queue for complete audit trail
- Prevents efficient "show all files processed by this job" queries

**Issue 2: processing_worker_id Not Populated (MEDIUM)**
- `processing_worker_id` column is NULL
- **Impact:** Cannot identify which worker instance processed file
- Hinders debugging and load distribution analysis
- No worker accountability for processing

**Low Priority Issues (5):**

3. **provider_name not extracted** - "South Coast Medical" in text but not captured in metadata
4. **facility_name not extracted** - Facility information available but not extracted from entities
5. **file_subtype not implemented** - Worker doesn't classify document subtypes (general medical record vs specific type)
6. **language_detected hardcoded** - Always 'en', no actual language detection
7. **updated_at not updating** - Timestamp not changed after Pass 1 updates (possible missing trigger)

**Correct Behaviors:**
- Pass 1 worker properly updates status: `uploaded` → `pass1_complete`
- Timestamps correctly captured (processing_started_at, processing_completed_at)
- OCR text extracted and stored with confidence
- Cost analytics tracked accurately
- Processing duration calculated correctly (296s)
- Idempotency key prevents duplicate processing

#### Recommended Fixes:

**Fix 1 & 2: Link Job Coordination Fields (MEDIUM - 30 minutes)**
```typescript
// apps/render-worker/src/pass1/pass1-database-builder.ts
// Add to shell_files UPDATE
{
  processing_job_id: jobMetadata.job_id,           // From job context
  processing_worker_id: process.env.WORKER_ID,     // Worker instance ID
  // ... existing fields
}
```

**Fix 3 & 4: Extract Provider/Facility from Entities (LOW - 1 hour)**
```typescript
// After entity detection, find provider entities
const providerEntity = entities.find(e => e.entity_subtype === 'provider_identifier');
const facilityEntity = entities.find(e => e.entity_subtype === 'facility_name');

{
  provider_name: providerEntity?.original_text || null,
  facility_name: facilityEntity?.original_text || null,
  // ... existing fields
}
```

**Fix 5: Implement file_subtype Detection (LOW - 2 hours)**
```typescript
// Add subtype classification logic
const subtype = classifySubtype(file_type, entities);
// e.g., medical_record → "patient_summary", "consultation_note", "discharge_summary"
```

**Fix 6: Add Language Detection (LOW - 1 hour)**
```typescript
// Replace hardcoded 'en' with detection
const languageDetected = await detectLanguage(extracted_text);
// or use OCR service language detection if available
```

**Fix 7: Verify UPDATE Trigger (LOW - 15 minutes)**
```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname LIKE '%shell_files%updated%';

-- If missing, create:
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shell_files_updated_at
BEFORE UPDATE ON shell_files
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

#### Migration Requirements:

- **Schema Changes:** None (columns exist, just not populated)
- **Data Migration:** None required
- **Worker Function Changes:**
  - File: `apps/render-worker/src/pass1/pass1-database-builder.ts` (lines 166-184)
  - Add: `processing_job_id` and `processing_worker_id` population
  - Add: Extract provider_name and facility_name from detected entities
  - Add: Implement file_subtype classification
  - Add: Replace hardcoded 'en' with actual language detection
- **Database Function Changes:**
  - Verify UPDATE trigger exists for `updated_at` column

#### Dependencies:

- **Depends on:** `user_profiles` (patient_id FK)
- **FK Target for:** `entity_processing_audit`, `profile_classification_audit`, `pass1_entity_metrics`, `manual_review_queue`, `job_queue`
- **Referenced by:** All Pass 1-3 audit tables (central document reference)
- **Status Gates:** Pass 2 only starts when `status = 'pass1_complete'`

---

## Summary Analysis

### Critical Findings Overview

**Total Tables Audited:** 8
**Migrations Already Completed:** 4 (Migrations 15, 16, 17 + token breakdown)
**Critical Issues Requiring Immediate Action:** 6
**Medium Priority Issues:** 10
**Low Priority Issues:** 12

### Priority Breakdown by Table

| Table | Critical | Medium | Low | Status |
|-------|----------|--------|-----|--------|
| ai_confidence_scoring | 1 | 0 | 2 | Worker rewrite required |
| ai_processing_sessions | 0 | 2 | 0 | Naming clarity fixes |
| entity_processing_audit | 0 | 1 | 0 | ✅ Migrations complete, minor fix |
| job_queue | 3 | 2 | 3 | Database + worker fixes |
| manual_review_queue | 0 | 1 | 1 | Worker title logic fix |
| pass1_entity_metrics | 0 | 0 | 0 | ✅ Migration 15 complete |
| profile_classification_audit | 2 | 5 | 2 | 🚨 System not implemented |
| shell_files | 0 | 2 | 5 | Job coordination gaps |

### Overlapping Issues & Common Patterns

**Pattern 1: worker_id Environment Variable Not Expanded**
- **Affected:** `job_queue.worker_id`, `shell_files.processing_worker_id`
- **Root Cause:** Same issue in `apps/render-worker/src/worker.ts`
- **Single Fix:** Expand `${RENDER_SERVICE_ID}` environment variable once
- **Files:** 1 worker file affects 2 tables

**Pattern 2: Job Coordination Not Linked**
- **Affected:** `shell_files.processing_job_id`, `shell_files.processing_worker_id`, `job_queue.patient_id`, `job_queue.shell_file_id`
- **Root Cause:** Worker doesn't populate FK columns despite data being available
- **Single Fix:** Extract from job_payload and populate columns in single update
- **Impact:** Prevents efficient JOINs and audit trails

**Pattern 3: AI Output Arrays Hardcoded Empty**
- **Affected:** `profile_classification_audit.identity_markers_found`, `profile_classification_audit.age_indicators`, `profile_classification_audit.relationship_indicators`, `entity_processing_audit.validation_flags`, `entity_processing_audit.compliance_flags`
- **Root Cause:** AI generates data but worker doesn't parse/populate arrays
- **Fix Approach:** Update AI prompt + response parsing in single worker update

**Pattern 4: Metadata Extraction Gaps**
- **Affected:** `shell_files.provider_name`, `shell_files.facility_name`, `shell_files.file_subtype`, `profile_classification_audit.healthcare_provider_context`
- **Root Cause:** Data available in entities but not extracted to dedicated columns
- **Fix Approach:** Extract from entity detection results post-processing

**Pattern 5: Hardcoded Values (Not Actually Detected)**
- **Affected:** `shell_files.language_detected` (always 'en'), `profile_classification_audit.recommended_profile_type` (always 'self')
- **Root Cause:** Placeholder implementations, no actual detection logic
- **Impact:** Features appear implemented but don't actually work

### Critical Dependencies Map

**Dependency Chain:**
```
shell_files (upload)
    ↓
job_queue (processing coordination)
    ↓
ai_processing_sessions (session tracking)
    ↓ ↓ ↓
    ├─→ entity_processing_audit (entities)
    ├─→ profile_classification_audit (safety) 🚨 BLOCKING for Pass 2
    ├─→ pass1_entity_metrics (metrics)
    └─→ manual_review_queue (human review)
         ↓
    ai_confidence_scoring (quality)
```

**Blocking Relationships:**
- `profile_classification_audit.manual_review_required = true` → BLOCKS Pass 2
- `profile_classification_audit.cross_profile_risk_detected = true` → BLOCKS Pass 2
- `ai_confidence_scoring` depends on `entity_processing_audit.id` (FK)

### Worker Function Changes Consolidated

**File:** `apps/render-worker/src/worker.ts`
- Fix worker_id environment variable expansion (affects job_queue, shell_files)

**File:** `apps/render-worker/src/pass1/pass1-database-builder.ts`
- Complete rewrite of `buildAIConfidenceScoringRecords()` (ai_confidence_scoring)
- Add flag extraction for validation_flags, compliance_flags (entity_processing_audit)
- Implement actual profile classification with user profile comparison (profile_classification_audit)
- Add job_id and worker_id population (shell_files)
- Extract provider/facility metadata (shell_files, profile_classification_audit)

**File:** `apps/render-worker/src/pass1/manual-review-builder.ts`
- Update title generation logic to check ai_concerns first (manual_review_queue)

**File:** `shared/docs/architecture/database-foundation-v3/current_schema/08_job_coordination.sql`
- Function: `complete_job()` - Add heartbeat_at = NULL, actual_duration calculation
- Function: `enqueue_job_v3()` - Extract patient_id and shell_file_id from job_payload

---

## Migration Strategy Recommendation

### Recommended Approach: **Phased Hybrid Strategy**

**Phase 1: Quick Wins (Database Functions Only)**
- ✅ Low risk, no code deployment required
- Migration 18: Fix job_queue.complete_job() function
- Migration 19: Rename ai_processing_sessions.ai_model_version → ai_model_name
- Estimated time: 1 hour

**Phase 2: Worker Code Updates (Non-Breaking)**
- Deploy worker updates that populate new/existing columns
- No schema changes, just better data population
- Tables: entity_processing_audit, manual_review_queue, shell_files
- Estimated time: 1 day

**Phase 3: Critical Profile Classification Fix**
- Schema: Add recommended_profile_id column
- Worker: Implement actual profile classification
- Database: Create approve_profile_classification() RPC
- Tables: profile_classification_audit
- Estimated time: 2-3 days

**Phase 4: ai_confidence_scoring Rewrite**
- Worker: Complete rewrite of buildAIConfidenceScoringRecords()
- No schema changes needed
- Table: ai_confidence_scoring
- Estimated time: 1-2 days

---

## Implementation Roadmap

### Phase 1: Quick Database Fixes (1 hour)

**Migration 18: job_queue.complete_job() Fix**
```sql
-- Add heartbeat_at = NULL and actual_duration calculation
-- See job_queue section above for full SQL
```

**Migration 19: Rename ai_model_version**
```sql
ALTER TABLE ai_processing_sessions
RENAME COLUMN ai_model_version TO ai_model_name;
```

### Phase 2: Worker Code Updates (1 day)

**Priority 1: Fix worker_id Environment Variable**
- File: `apps/render-worker/src/worker.ts`
- Change: `this.workerId = \`render-${process.env.RENDER_SERVICE_ID || 'local-dev'}\``
- Impact: Fixes job_queue.worker_id and enables shell_files.processing_worker_id

**Priority 2: Add Flag Extraction**
- File: `apps/render-worker/src/pass1/pass1-translation.ts`
- Add: validation_flags and compliance_flags extraction
- Impact: Populates entity_processing_audit arrays

**Priority 3: Update Manual Review Title Logic**
- File: `apps/render-worker/src/pass1/manual-review-builder.ts`
- Change: Check ai_concerns array before confidence threshold
- Impact: More accurate review queue titles

**Priority 4: Link Job Coordination**
- File: `apps/render-worker/src/pass1/pass1-database-builder.ts`
- Add: processing_job_id and processing_worker_id to shell_files updates
- Add: patient_id and shell_file_id extraction in job enqueue
- Impact: Complete audit trail linking

### Phase 3: Profile Classification Implementation (2-3 days)

**Migration 20: Add recommended_profile_id Column**
```sql
ALTER TABLE profile_classification_audit
ADD COLUMN recommended_profile_id UUID REFERENCES user_profiles(id);
```

**Worker Changes:**
1. Fetch user profiles before AI call
2. Pass profile data to AI prompt
3. Parse recommended_profile_id from AI response
4. Populate identity_markers_found, age_indicators arrays

**Database Function:**
```sql
CREATE FUNCTION approve_profile_classification(...);
-- See profile_classification_audit section for full SQL
```

### Phase 4: ai_confidence_scoring Rewrite (1-2 days)

**Worker Complete Rewrite:**
- Implement buildAIConfidenceScoringRecords() following bridge schema
- Add helper functions: calculateOverallConfidence(), calculateReliabilityScore(), etc.
- Map to all 24 schema columns (currently only 11)

**Testing:**
- Verify INSERT succeeds (currently fails)
- Validate entity_processing_audit FK linkage
- Confirm confidence calculations match expectations

---

## Total Estimated Effort

**Critical Path:** 5-7 days
- Phase 1: 1 hour (database only)
- Phase 2: 1 day (worker updates)
- Phase 3: 2-3 days (profile classification)
- Phase 4: 1-2 days (ai_confidence_scoring)

**Additional Low Priority Work:** 2-3 days
- Metadata extraction (provider, facility, subtypes)
- Language detection implementation
- Trigger verification
- Integration testing

**Total:** 7-10 days to complete all fixes
