# Profile Classification Audit - Complete Analysis

**Audit Date:** 2025-10-09
**Sample Record ID:** 268c6328-7b72-44e7-8011-a2faa953b9a7
**Processing Session:** 05fc9450-d8c6-4ec7-aebb-a3d24bdd6610
**Shell File:** BP2025060246784 - first 2 page version V4.jpeg (69,190 bytes)
**Session Type:** entity_extraction
**Session Status:** completed
**Purpose:** Comprehensive column-by-column audit of profile_classification_audit table - the critical contamination prevention and patient safety system

---

## Executive Summary: Critical System Discovery

**STATUS:** CRITICAL - Profile Classification System Not Actually Implemented

**The Hard Truth:**
```typescript
// apps/render-worker/src/pass1/pass1-database-builder.ts:198
recommended_profile_type: 'self', // ← HARDCODED DEFAULT
identity_markers_found: [],       // ← HARDCODED EMPTY
age_indicators: [],               // ← HARDCODED EMPTY
```

**ALL documents get classified as 'self' regardless of content.** The AI isn't comparing anything to user profiles. It's a hardcoded placeholder system.

**Key Discovery:** The `profile_confidence` score (0.980) isn't "confidence this is self profile" - it's "confidence this is a legitimate patient document." The AI has NO IDEA about user's existing profiles, demographic data, or which child profile if multiple exist.

---

## Sample Record Data Summary

```
Recommended Profile: self (HARDCODED - not actually determined by AI)
Profile Confidence: 0.980 (98.0% - confidence this is a patient document, NOT profile match)
Contamination Risk: 0.020 (2.0%)
Cross-Profile Risk: false
Manual Review Required: false
Classification: "Pass 1 automated profile classification based on document content analysis" (GENERIC)
AI Model: gpt-5-mini
Validation Method: automated
```

---

## Column-by-Column Analysis

### PRIMARY KEY & FOREIGN KEYS

**id** (UUID, PRIMARY KEY, NOT NULL)
- **Role**: Unique identifier for each profile classification audit record
- **NULL Status**: NOT NULL (system-generated via gen_random_uuid())
- **Sample Value**: `268c6328-7b72-44e7-8011-a2faa953b9a7`
- **AI Processing**: Not AI-generated (database auto-generated)
- **Correctness**: ✅ Correct - Every audit record must have unique ID for tracking and joins

**processing_session_id** (UUID, NOT NULL, FK → ai_processing_sessions)
- **Role**: Links this classification to the AI processing session that analyzed the document; enables cross-pass analytics by joining with pass1_entity_metrics and pass2_clinical_metrics via shared session ID
- **NULL Status**: NOT NULL (required for session tracking and analytics joins)
- **Sample Value**: `05fc9450-d8c6-4ec7-aebb-a3d24bdd6610`
- **Foreign Key**: References ai_processing_sessions(id) ON DELETE CASCADE
- **AI Processing**: Not AI-generated (system context)
- **Purpose**: Critical join key for multi-pass pipeline coordination and analytics
- **Correctness**: ✅ Correct - Links to completed entity_extraction session
- **Analytics Use**: Enables queries like "Show all Pass 1 entities, profile classifications, and Pass 2 clinical data for this session"

**shell_file_id** (UUID, NOT NULL, FK → shell_files)
- **Role**: Links classification to specific document being analyzed; enables document-centric queries and RLS policies
- **NULL Status**: NOT NULL (every classification must be for a specific document)
- **Sample Value**: `c3f7ba3e-1816-455a-bd28-f6eea235bd28`
- **Foreign Key**: References shell_files(id) ON DELETE CASCADE
- **AI Processing**: Not AI-generated (system context)
- **Purpose**: Document traceability and efficient queries for "all classifications for this document"
- **Correctness**: ✅ Correct - Links to BP2025060246784 document uploaded 2025-10-08 05:28:13
- **Query Optimization**: Indexed (idx_profile_class_shell_file) for fast document lookups

---

### PROFILE CLASSIFICATION RESULTS (AI-GENERATED - CRITICAL DISCOVERY)

**recommended_profile_type** (TEXT, NOT NULL, CHECK constraint)
- **Role**: AI's classification of which profile type this document belongs to (self, child, adult_dependent, pet)
- **NULL Status**: NOT NULL (AI must make a classification decision)
- **Sample Value**: `"self"`
- **Allowed Values**: 'self', 'child', 'adult_dependent', 'pet'
- **AI Processing**: ❌ **NOT ACTUALLY AI-GENERATED** - Hardcoded to 'self' in pass1-database-builder.ts:198
- **Token Cost**: ZERO - No AI analysis happening for profile type classification
- **Purpose**: Core safety decision that determines if document data should be assigned to user's own profile vs dependent profile
- **Correctness**: ⚠️ **PLACEHOLDER** - System always returns 'self' regardless of document content
- **Safety Critical**: This field gates Pass 2 clinical extraction - but it's not actually functioning as designed
- **The Reality**: AI doesn't receive user profile data, doesn't compare identity markers to profiles, doesn't classify profile types

**profile_confidence** (NUMERIC(4,3), NULLABLE, CHECK 0-1)
- **Role**: AI's confidence score in the profile type classification (0.000-1.000)
- **NULL Status**: NULLABLE (optional quality metric)
- **Sample Value**: `0.980` (98.0% confidence)
- **AI Processing**: ✅ AI-GENERATED - But not confidence in profile type classification
- **Token Cost**: Included in Pass 1 processing
- **Purpose**: Quality metric for triggering manual review if confidence too low
- **Correctness**: ⚠️ **MISLEADING** - Score is "confidence this is a legitimate patient document" NOT "confidence this matches self profile"
- **The Reality**: This is actually `patient_identity_confidence` from AI's generic safety check - has nothing to do with profile matching
- **Threshold Logic**: Typically manual_review_required if < 0.700 confidence
- **Use Case**: "Show all low-confidence classifications requiring human review"

**identity_extraction_results** (JSONB, DEFAULT '{}')
- **Role**: Structured identity markers extracted by AI (names, DOB, Medicare numbers, addresses)
- **NULL Status**: Defaults to '{}' if not populated
- **Sample Value**: `{"age_appropriateness": 0.98, "identity_confidence": 0.98}`
- **AI Processing**: ✅ AI-GENERATED - AI vision model extracts identity information from document
- **Token Cost**: Included in Pass 1 processing (AI must read document to extract identity)
- **Purpose**: Provides structured data for identity verification and contamination checks
- **Correctness**: ✅ Correct - Contains confidence scores showing AI validated identity consistency
- **JSONB Flexibility**: Allows AI to include variable identity markers (name, DOB, Medicare, etc.) without schema changes
- **Example Full Payload**: `{"name_found": "John Smith", "dob_found": "1985-03-15", "medicare_number": "2123 45678 9"}`

---

### CONTAMINATION PREVENTION (AI-GENERATED - CORE SAFETY)

**contamination_risk_score** (NUMERIC(4,3), NULLABLE, CHECK 0-1)
- **Role**: AI's assessment of risk that this document contains data from multiple patients (0.000-1.000)
- **NULL Status**: NULLABLE (optional safety metric)
- **Sample Value**: `0.020` (2.0% contamination risk)
- **AI Processing**: ✅ AI-GENERATED - Derived from inverse of patient_identity_confidence (1.0 - 0.98 = 0.02)
- **Token Cost**: Included in Pass 1 processing (AI must analyze entire document for contamination signals)
- **Purpose**: CRITICAL SAFETY METRIC - prevents data contamination across patient profiles
- **Correctness**: ✅ Correct - Low risk (0.020) matches high confidence (0.980) in patient identity
- **Safety Threshold**: Typically manual_review_required if > 0.300 risk score
- **Indexed**: idx_profile_class_risk for fast "high-risk classifications" queries
- **Use Case**: "Show all documents with contamination risk > 30% for manual review"

**contamination_checks_performed** (JSONB, DEFAULT '{}')
- **Role**: Structured record of which contamination safety checks AI performed
- **NULL Status**: Defaults to '{}' if not populated
- **Sample Value**: `{"cross_profile_check": true, "identity_verification": true, "age_appropriateness_check": true}`
- **AI Processing**: ✅ AI-GENERATED - AI logs which safety validations it executed
- **Token Cost**: Minimal (AI just outputs which checks it ran, not running new analysis)
- **Purpose**: Audit trail showing contamination prevention system actually ran
- **Correctness**: ✅ Correct - All three critical safety checks performed
- **Safety Compliance**: Proves healthcare compliance requirements were met (audit trail for regulators)
- **Example Checks**: name_consistency, date_consistency, age_consistency, multiple_names_detected

**contamination_warnings** (TEXT[], DEFAULT '{}')
- **Role**: Array of specific contamination concerns AI detected (e.g., "Multiple names detected in document")
- **NULL Status**: Defaults to '{}' if no warnings
- **Sample Value**: `[]` (empty array - no warnings detected)
- **AI Processing**: ✅ AI-GENERATED - AI outputs specific warning messages
- **Token Cost**: Included in Pass 1 processing (AI must analyze to detect issues)
- **Purpose**: Human-readable explanations of contamination risks for manual reviewers
- **Correctness**: ✅ Correct - Empty array matches low contamination risk (0.020)
- **Example Warnings**: ["Multiple names detected (child + parent)", "Parent medical information in same document"]
- **Use Case**: Display warnings in manual review UI to guide human validation

**cross_profile_risk_detected** (BOOLEAN, DEFAULT FALSE)
- **Role**: Binary flag indicating AI detected potential data mixing across profiles
- **NULL Status**: NOT NULL (defaults to FALSE)
- **Sample Value**: `false`
- **AI Processing**: ✅ AI-GENERATED - AI sets flag based on contamination analysis
- **Token Cost**: Minimal (derived from contamination_risk_score analysis)
- **Purpose**: Quick boolean filter for Pass 2 gating logic (if TRUE, PAUSE Pass 2 for manual review)
- **Correctness**: ✅ Correct - FALSE matches low contamination_risk_score (0.020)
- **Pass 2 Gating**: IF cross_profile_risk_detected = TRUE OR manual_review_required = TRUE, enqueue in manual_review_queue
- **Critical Safety**: This single boolean can STOP entire Pass 2 clinical extraction to prevent contamination

---

### IDENTITY VERIFICATION (AI-GENERATED - GAPS IDENTIFIED)

**identity_consistency_score** (NUMERIC(4,3), NULLABLE, CHECK 0-1)
- **Role**: AI's assessment of how consistent identity markers are throughout document (0.000-1.000)
- **NULL Status**: NULLABLE (optional quality metric)
- **Sample Value**: `0.980` (98.0% consistency)
- **AI Processing**: ✅ AI-GENERATED - AI compares identity markers across document (name on page 1 vs page 2, etc.)
- **Token Cost**: Included in Pass 1 processing (AI must analyze full document for consistency)
- **Purpose**: Quality metric indicating single consistent identity vs multiple conflicting identities
- **Correctness**: ✅ Correct - High consistency (0.980) supports "self" classification and low contamination risk
- **Example Logic**: If name changes mid-document or age doesn't match DOB, score drops
- **Use Case**: "Show documents with identity inconsistencies for fraud detection"

**identity_markers_found** (TEXT[], DEFAULT '{}')
- **Role**: Array of specific identity markers AI detected (e.g., "full_name", "dob", "medicare_number", "address")
- **NULL Status**: Defaults to '{}' if not populated
- **Sample Value**: `[]` (empty array in this case)
- **AI Processing**: ❌ **NOT POPULATED** - Hardcoded empty array in pass1-database-builder.ts:213
- **Token Cost**: Should be included in Pass 1 processing but currently not extracted
- **Purpose**: Shows which identity markers available for verification (more markers = higher confidence)
- **Correctness**: ❌ **BUG** - Empty array despite high identity_confidence (0.98) in identity_extraction_results
- **Expected Values**: ["full_name", "dob", "medicare_number", "address"]
- **Root Cause**: AI may populate identity_extraction_results JSONB but not this separate array field
- **Recommendation**: Update AI worker to populate both identity_extraction_results AND identity_markers_found array

**age_indicators** (TEXT[], DEFAULT '{}')
- **Role**: Array of age-related markers AI detected (e.g., "adult_age_range", "pediatric_consultation", "medicare_card_holder")
- **NULL Status**: Defaults to '{}' if not populated
- **Sample Value**: `[]` (empty array)
- **AI Processing**: ❌ **NOT POPULATED** - Hardcoded empty array in pass1-database-builder.ts:214
- **Token Cost**: Should be included in Pass 1 processing
- **Purpose**: Helps validate profile_type classification (child vs adult vs pet)
- **Correctness**: ❌ **BUG** - Empty array but age_appropriateness in identity_extraction_results is 0.98
- **Expected Values**: ["adult_age_range", "medicare_card_holder"] for self-classified document
- **Recommendation**: Update AI worker to populate age_indicators array when assessing age appropriateness

**relationship_indicators** (TEXT[], DEFAULT '{}')
- **Role**: Array of relationship markers AI detected (e.g., "parent", "guardian", "child", "spouse")
- **NULL Status**: Defaults to '{}' if not populated
- **Sample Value**: `[]` (empty array)
- **AI Processing**: ❌ **NOT POPULATED** - Hardcoded empty array in pass1-database-builder.ts:215
- **Token Cost**: Should be minimal (AI scans for relationship terms)
- **Purpose**: Detects when document mentions multiple related people (parent-child, spousal records)
- **Correctness**: ✅ Correct - Empty array expected for "self" classification (no dependent relationships)
- **Contamination Signal**: Non-empty array could indicate cross-profile risk (e.g., ["parent", "guardian"] suggests child's document)
- **Example Values**: For child profile: ["parent", "guardian"], For spouse: ["husband", "wife"]

---

### AUSTRALIAN HEALTHCARE CONTEXT (AI-GENERATED)

**medicare_number_detected** (BOOLEAN, DEFAULT FALSE)
- **Role**: Flag indicating AI found Australian Medicare number in document
- **NULL Status**: NOT NULL (defaults to FALSE)
- **Sample Value**: `false`
- **AI Processing**: ✅ AI-GENERATED - AI scans document for Medicare number patterns (e.g., "2123 45678 9")
- **Token Cost**: Included in Pass 1 processing (AI must read document to detect Medicare numbers)
- **Purpose**: Australian-specific identity verification (Medicare numbers unique to individuals)
- **Correctness**: ✅ Correct - FALSE indicates no Medicare number detected (document may be from private provider or international)
- **Identity Strength**: Medicare number detection increases profile_confidence and identity_consistency_score
- **Privacy Compliance**: Detecting Medicare numbers important for Australian Privacy Act compliance (sensitive identifier)

**healthcare_identifier_type** (TEXT, NULLABLE)
- **Role**: Type of healthcare identifier AI found (e.g., "medicare", "dva", "ihi", "veterinary_microchip")
- **NULL Status**: NULLABLE (NULL if no identifiers detected)
- **Sample Value**: `null`
- **AI Processing**: ✅ AI-GENERATED - AI classifies detected healthcare identifiers
- **Token Cost**: Minimal (derived from medicare_number_detected and other identifier scans)
- **Purpose**: Categorizes identity verification method (Medicare vs other Australian health IDs)
- **Correctness**: ✅ Correct - NULL matches medicare_number_detected = FALSE
- **Australian Health IDs**: "medicare", "dva" (Department of Veterans Affairs), "ihi" (Individual Healthcare Identifier)
- **Pet Records**: "veterinary_microchip" for pet profile types
- **International Gap**: No storage for non-Australian identifiers (SSN, NHS, passport) - see System Architecture Analysis below

**healthcare_provider_context** (TEXT, NULLABLE)
- **Role**: Type of healthcare provider AI identified from document (e.g., "General Practitioner", "Pediatric Clinic", "Veterinary Clinic")
- **NULL Status**: NULLABLE (NULL if no provider context detected)
- **Sample Value**: `null`
- **AI Processing**: ✅ AI-GENERATED - AI reads letterhead, provider names, clinic types from document
- **Token Cost**: Included in Pass 1 processing (AI must analyze document header/footer for provider info)
- **Purpose**: Provides context for profile type validation (pediatric clinic → likely child profile)
- **Correctness**: ⚠️ **UNEXPECTED** - NULL despite document being medical record
- **Expected Value**: Should likely be "General Practitioner", "Hospital", "Specialist", etc.
- **Recommendation**: Verify AI is extracting provider context from document headers/letterhead

---

### AUDIT TRAIL (AI-GENERATED & SYSTEM)

**classification_reasoning** (TEXT, NULLABLE)
- **Role**: Human-readable explanation of WHY AI classified document as specific profile type
- **NULL Status**: NULLABLE (optional explainability field)
- **Sample Value**: `"Pass 1 automated profile classification based on document content analysis"`
- **AI Processing**: ⚠️ **PARTIALLY AI-GENERATED** - Generic placeholder, not detailed reasoning
- **Token Cost**: MODERATE - Should require AI to generate explanatory text (~50-100 output tokens)
- **Purpose**: AI explainability for healthcare compliance and manual review guidance
- **Correctness**: ✅ Technically correct but **GENERIC** - AI could be much more specific
- **Improvement Opportunity**: AI should provide detailed reasoning: "Adult patient record identified based on: Patient name 'Xavier Flanagan' found with high confidence (0.98). Age-appropriate medical content detected. No contamination indicators. Recommend 'self' profile assignment."
- **Compliance Value**: Provides audit trail showing AI decision logic for regulatory review
- **Current Gap**: Generic reasoning doesn't help manual reviewers validate AI decisions

**manual_review_required** (BOOLEAN, DEFAULT FALSE)
- **Role**: Flag indicating AI determined this classification needs human validation
- **NULL Status**: NOT NULL (defaults to FALSE)
- **Sample Value**: `false`
- **AI Processing**: ✅ AI-GENERATED - AI sets flag based on confidence thresholds and risk scores
- **Token Cost**: Minimal (derived from profile_confidence and contamination_risk_score)
- **Purpose**: Triggers Pass 2 gating - if TRUE, enqueue in manual_review_queue before proceeding
- **Correctness**: ✅ Correct - FALSE matches high confidence (0.980) and low contamination risk (0.020)
- **Indexed**: idx_profile_class_review for fast "pending review" queries
- **Threshold Logic**: Typically TRUE if profile_confidence < 0.700 OR contamination_risk_score > 0.300
- **Critical Workflow**: IF manual_review_required = TRUE, Pass 2 clinical extraction PAUSES until human approves

**reviewed_by_user** (BOOLEAN, DEFAULT FALSE)
- **Role**: Flag indicating human has manually reviewed and validated this classification
- **NULL Status**: NOT NULL (defaults to FALSE)
- **Sample Value**: `false`
- **AI Processing**: Not AI-generated (user action tracking)
- **Purpose**: Tracks whether manual review has been completed for audit trail
- **Correctness**: ✅ Correct - FALSE expected for automated classification that didn't require review
- **Workflow**: When manual_review_required = TRUE, this gets set to TRUE after human validation
- **Use Case**: "Show all classifications requiring review that haven't been reviewed yet"

**final_profile_assignment** (TEXT, NULLABLE, CHECK constraint)
- **Role**: Final confirmed profile type after manual review (may differ from AI's recommended_profile_type)
- **NULL Status**: NULLABLE (NULL until manual review confirms or overrides)
- **Sample Value**: `null`
- **Allowed Values**: 'self', 'child', 'adult_dependent', 'pet' (same as recommended_profile_type)
- **AI Processing**: Not AI-generated (human decision or auto-confirmation)
- **Purpose**: Records human override if reviewer disagrees with AI classification
- **Correctness**: ✅ Correct - NULL expected when manual_review_required = FALSE (auto-accepted AI classification)
- **Workflow**: If manual_review_required = TRUE, human sets final_profile_assignment (can match or override recommended_profile_type)
- **Data Integrity**: Pass 2 uses final_profile_assignment if present, otherwise uses recommended_profile_type

---

### SAFETY VALIDATION DETAILS (AI-GENERATED)

**medical_appropriateness_score** (NUMERIC(4,3), NULLABLE, CHECK 0-1)
- **Role**: AI's assessment that medical content is appropriate for the classified profile type (0.000-1.000)
- **NULL Status**: NULLABLE (optional safety metric)
- **Sample Value**: `0.980` (98.0% appropriate)
- **AI Processing**: ✅ AI-GENERATED - AI validates medical content matches profile age/type
- **Token Cost**: Included in Pass 1 processing (AI must analyze medical content appropriateness)
- **Purpose**: Safety check that adult content isn't being assigned to child profile (or vice versa)
- **Correctness**: ✅ Correct - High score (0.980) validates "self" classification with adult-appropriate medical content
- **Example Logic**: If profile_type = "child" but document contains "prostate exam", score drops significantly
- **Safety Critical**: Low score could indicate misclassification or contamination

**age_appropriateness_validated** (BOOLEAN, DEFAULT FALSE)
- **Role**: Flag indicating AI validated medical content is age-appropriate for classified profile
- **NULL Status**: NOT NULL (defaults to FALSE)
- **Sample Value**: `true`
- **AI Processing**: ✅ AI-GENERATED - AI confirms age-appropriateness check passed
- **Token Cost**: Minimal (derived from medical_appropriateness_score analysis)
- **Purpose**: Binary safety flag for quick validation queries
- **Correctness**: ✅ Correct - TRUE matches high medical_appropriateness_score (0.980)
- **Safety Threshold**: Typically TRUE if medical_appropriateness_score > 0.800
- **Use Case**: "Show all classifications with age-inappropriateness concerns"

**safety_flags** (TEXT[], DEFAULT '{}')
- **Role**: Array of specific safety concerns AI detected (e.g., "cross_profile_data_detected", "age_mismatch")
- **NULL Status**: Defaults to '{}' if no safety issues
- **Sample Value**: `[]` (empty array - no safety concerns)
- **AI Processing**: ✅ AI-GENERATED - AI outputs specific safety warnings
- **Token Cost**: Included in Pass 1 processing (AI must analyze for safety issues)
- **Purpose**: Human-readable safety warnings for manual reviewers
- **Correctness**: ✅ Correct - Empty array matches no contamination warnings and high safety scores
- **Example Flags**: ["cross_profile_data_detected", "parent_child_mixing", "age_mismatch", "identity_inconsistency"]
- **Manual Review UI**: Display safety_flags prominently to guide human validation

---

### PROCESSING CONTEXT (SYSTEM METADATA)

**ai_model_used** (TEXT, DEFAULT 'gpt-4o-mini')
- **Role**: Which AI model performed the profile classification
- **NULL Status**: NOT NULL (defaults to 'gpt-4o-mini')
- **Sample Value**: `"gpt-5-mini"`
- **AI Processing**: Not AI-generated (system configuration tracking)
- **Purpose**: Model versioning for performance analysis and debugging
- **Correctness**: ⚠️ **INTERESTING** - Value is "gpt-5-mini" but default is "gpt-4o-mini"
- **Model Evolution**: Shows system upgraded to GPT-5 model (or this is test model name)
- **Analytics Use**: "Compare classification accuracy between gpt-4o-mini vs gpt-5-mini"
- **Cost Tracking**: Different models have different token costs
- **Hardcoded Default Issue**: Database default should not be hardcoded - see System Architecture Analysis

**validation_method** (TEXT, DEFAULT 'automated', CHECK constraint)
- **Role**: How classification was validated (automated, human_guided, manual_review)
- **NULL Status**: NOT NULL (defaults to 'automated')
- **Sample Value**: `"automated"`
- **Allowed Values**: 'automated', 'human_guided', 'manual_review'
- **AI Processing**: Not AI-generated (workflow tracking)
- **Purpose**: Audit trail showing validation workflow type
- **Correctness**: ✅ Correct - "automated" matches manual_review_required = FALSE
- **Workflow Types**:
  - **automated**: AI classified without human intervention (high confidence)
  - **human_guided**: Human provided hints/corrections during AI processing
  - **manual_review**: Human reviewed and confirmed/overrode AI classification

---

### TIMESTAMPS (SYSTEM METADATA)

**created_at** (TIMESTAMPTZ, DEFAULT NOW())
- **Role**: When profile classification record was created
- **NULL Status**: NOT NULL (audit trail requirement)
- **Sample Value**: `2025-10-08 05:36:50.160136+00`
- **AI Processing**: Not AI-generated (system timestamp)
- **Purpose**: Audit trail and performance analysis
- **Correctness**: ✅ Correct - Timestamp shows classification occurred during Pass 1 processing (8.5 minutes after file upload at 05:28:13)
- **Performance Metric**: created_at - shell_file.created_at = total time from upload to classification

**updated_at** (TIMESTAMPTZ, DEFAULT NOW())
- **Role**: Last modification timestamp (updated when manual review occurs)
- **NULL Status**: NOT NULL (audit trail requirement)
- **Sample Value**: `2025-10-08 05:36:50.160136+00`
- **AI Processing**: Not AI-generated (system timestamp)
- **Purpose**: Track when record was last modified (manual review updates, etc.)
- **Correctness**: ✅ Correct - Matches created_at (no updates yet)
- **Update Scenarios**: updated_at changes when reviewed_by_user or final_profile_assignment set

---

## Pass 1 Token Analysis & Profile Classification Architecture Decision

### Current Pass 1 Token Reality

**Recent Pass 1 Jobs (Token Breakdown):**
```
Document 1: Input: 5,942 | Output: 19,435 | Total: 25,377 (48 entities)
Document 2: Input: 5,942 | Output: 18,235 | Total: 24,177 (45 entities)
Document 3: Input: 5,942 | Output: 17,967 | Total: 23,909 (48 entities)
Document 4: Input: N/A   | Output: N/A    | Total: 21,333 (40 entities)
Document 5: Input: N/A   | Output: N/A    | Total: 20,001 (35 entities)

Average: ~5,942 input tokens | ~18,000 output tokens | ~24,000 total tokens
```

### Profile Classification Data Addition Estimate

**What we'd need to add to prompt for proper profile classification:**
```typescript
{
  self_profile: {
    full_name: "Xavier Flanagan",           // ~5 tokens
    date_of_birth: "1990-03-15",           // ~5 tokens
    medicare_number: "2123 45678 9",       // ~5 tokens
    address: "123 Main St, Sydney NSW",    // ~10 tokens
    phone: "+61 400 000 000"               // ~5 tokens
    // Subtotal: ~30 tokens
  },
  child_profiles: [ // Assume 2 children worst case
    {
      full_name: "Child Name",
      date_of_birth: "2015-06-20",
      relationship: "child"
      // ~25 tokens per child × 2 = 50 tokens
    }
  ],
  pet_profiles: [ // Assume 1 pet
    {
      name: "Pet Name",
      species: "Dog"
      // ~10 tokens
    }
  ]
  // TOTAL PROFILE DATA: ~90-150 tokens max
}
```

**Verdict:** Profile data addition is **NEGLIGIBLE** (~100-150 tokens vs 5,942 input tokens = **2.5% increase**)

### Decision: Keep Profile Classification in Pass 1 (Single Call)

**RECOMMENDATION:** Keep profile classification in Pass 1 as a single AI call.

**Supporting Evidence:**
- **Token overhead is tiny**: Only ~100-150 tokens added (~2.5% increase to input)
- **Context window headroom**: Using 24k of 128k capacity (18% - massive headroom)
- **Output tokens**: 17-19k output is expected for 45-48 entities with structured JSON
- **Profile classification output is small**: ~200-500 tokens of the 19k total

**Why NOT to split:**
- ❌ **Extra AI call cost**: Would need to send image/text AGAIN (vision tokens are expensive!)
- ❌ **Architectural complexity**: Pass 1a → Pass 1b coordination logic overhead
- ❌ **Latency penalty**: Sequential processing = longer total time
- ❌ **Context loss**: Pass 1b doesn't "see" what Pass 1a saw without full re-processing
- ❌ **Redundant image processing**: Vision model would analyze same image twice
- ❌ **Cost increase**: Splitting could INCREASE costs by 50%+ due to vision token re-processing

**Conclusion:** Prompt dilution risk is manageable with clear section headers. Keep as single focused Pass 1 call with enhanced profile classification instructions.

---

## System Architecture Analysis: Critical Gaps & Design Questions

### Gap 1: Profile Classification Hardcoded to 'self'

**Current Reality:**
```typescript
// apps/render-worker/src/pass1/pass1-database-builder.ts:198-225
const profileClassificationAudit = {
  recommended_profile_type: 'self', // ← HARDCODED
  profile_confidence: aiResponse.profile_safety.patient_identity_confidence,
  contamination_risk_score: 1.0 - aiResponse.profile_safety.patient_identity_confidence,
  identity_markers_found: [],  // ← HARDCODED EMPTY
  age_indicators: [],          // ← HARDCODED EMPTY
  relationship_indicators: [], // ← HARDCODED EMPTY
};
```

**What AI Actually Returns:**
```json
{
  "patient_identity_confidence": 0.98,  // Generic "is this a patient document" score
  "age_appropriateness_score": 0.98,    // Generic "is content medically appropriate" score
  "safety_flags": [],                    // Generic safety warnings
  "requires_identity_verification": false
}
```

**What AI Doesn't Know:**
- User's existing profiles (self, child, adult_dependent, pet)
- User's demographic data (name, DOB, relationships)
- Which specific child profile if user has multiple children
- Any profile-specific information at all

**Fix Required:** Implement actual profile type classification:
1. Pass user profile data to AI (self + child + dependent + pet profiles)
2. AI compares document identity markers to each profile
3. AI returns `recommended_profile_id` (specific match) AND `recommended_profile_type`
4. Add `recommended_profile_id UUID REFERENCES user_profiles(id)` column to schema

---

### Gap 2: No Multi-Child Profile Support

**Schema Gap:**
```sql
-- CURRENT (doesn't link to specific profile):
CREATE TABLE profile_classification_audit (
  recommended_profile_type TEXT, -- 'self', 'child', 'adult_dependent', 'pet'
  -- ❌ NO recommended_profile_id column!
);

-- NEEDED:
ALTER TABLE profile_classification_audit
ADD COLUMN recommended_profile_id UUID REFERENCES user_profiles(id);
-- When profile_type = 'child' and user has 3 children, which one?
```

**Missing AI Logic:**
- AI doesn't receive list of user's existing profiles
- AI doesn't get profile demographic data to compare against
- No logic to match document identity markers to specific child profiles

**What Would Be Needed:**
```typescript
interface ProfileClassificationInput {
  document_data: DocumentData;
  user_profiles: {
    self_profile: { id: UUID; full_name?: string; date_of_birth?: string; },
    child_profiles: Array<{ id: UUID; full_name?: string; date_of_birth?: string; }>,
    dependent_profiles: Array<{ id: UUID; full_name?: string; }>,
    pet_profiles: Array<{ id: UUID; name?: string; species?: string; }>
  };
}
```

---

### Gap 3: Manual Review Workflow Incomplete

**Current Manual Review Process:**

**Step 1: Detection (Automated)**
```sql
UPDATE profile_classification_audit
SET cross_profile_risk_detected = true,
    manual_review_required = true,
    contamination_warnings = ARRAY['Multiple names detected']
WHERE id = ...;
```

**Step 2: Pass 2 Gating (Automated)**
```typescript
if (classification.manual_review_required || classification.cross_profile_risk_detected) {
  // PAUSE Pass 2 processing
  await enqueueManualReview({ review_type: 'contamination_risk', priority: 'high' });
  return { status: 'waiting_for_manual_review' };
}
```

**Step 3: Human Resolution (MISSING ATOMIC RPC)**

**Missing Function:**
```sql
CREATE OR REPLACE FUNCTION approve_profile_classification(
  p_audit_id UUID,
  p_reviewer_decision TEXT,  -- 'approved', 'rejected', 'override_profile_type'
  p_override_profile_type TEXT DEFAULT NULL,
  p_override_profile_id UUID DEFAULT NULL,
  p_reviewer_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE profile_classification_audit
  SET reviewed_by_user = true,
      final_profile_assignment = COALESCE(p_override_profile_type, recommended_profile_type),
      cross_profile_risk_detected = false,
      manual_review_required = false,
      updated_at = NOW()
  WHERE id = p_audit_id;

  UPDATE manual_review_queue
  SET review_status = 'completed',
      reviewer_decision = p_reviewer_decision,
      reviewer_notes = p_reviewer_notes,
      review_completed_at = NOW()
  WHERE processing_session_id = (
    SELECT processing_session_id FROM profile_classification_audit WHERE id = p_audit_id
  );

  -- TODO: Trigger Pass 2 processing resumption
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### Gap 4: Empty Identity Marker Arrays

**Root Cause:**
```typescript
// pass1-database-builder.ts:213-215
identity_markers_found: [],  // ← HARDCODED EMPTY ARRAY
age_indicators: [],          // ← HARDCODED EMPTY ARRAY
relationship_indicators: [], // ← HARDCODED EMPTY ARRAY
```

**What AI Should Return (but doesn't):**
```typescript
interface Pass1AIResponse {
  profile_safety: {
    patient_identity_confidence: number;
    age_appropriateness_score: number;
    safety_flags: string[];
    // ❌ MISSING:
    identity_markers: string[];  // e.g., ["full_name", "dob", "medicare_number"]
    age_indicators: string[];    // e.g., ["adult_age_range", "medicare_card_holder"]
    relationship_indicators: string[];  // e.g., ["parent", "guardian"]
  };
}
```

**Fix Required:**
1. Update AI prompt to extract identity marker TYPES
2. Update pass1-database-builder.ts to populate arrays from AI response
3. Update Pass1AIResponse type definition

---

### Gap 5: International Healthcare Identifier Storage

**Current Schema:**
```sql
CREATE TABLE profile_classification_audit (
  medicare_number_detected BOOLEAN,        -- ← Only handles Medicare
  healthcare_identifier_type TEXT,         -- ← Says "medicare" or NULL
  -- ❌ NO COLUMN for actual identifier value!
);
```

**Where do these go?**
- DVA number (Australian Department of Veterans Affairs)
- IHI number (Individual Healthcare Identifier)
- SSN (USA patients)
- NHS number (UK patients)
- Passport number (international patients)

**Short-term Solution:** Store in identity_extraction_results JSONB
```json
{
  "identifiers": {
    "medicare_number": "2123 45678 9",
    "dva_number": "N123456",
    "ssn": "123-45-6789",
    "nhs": "123 456 7890"
  }
}
```

**Long-term Solution:** Dedicated table
```sql
CREATE TABLE healthcare_identifiers (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES user_profiles(id),
  shell_file_id UUID REFERENCES shell_files(id),
  identifier_type TEXT NOT NULL,  -- 'medicare', 'dva', 'ssn', 'nhs', 'passport'
  identifier_value TEXT NOT NULL,
  identifier_country TEXT,  -- 'AU', 'US', 'UK'
  confidence_score NUMERIC(4,3),
  source TEXT,  -- 'ai_extraction', 'user_entered', 'verified'
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Gap 6: Generic Classification Reasoning

**Current:**
```
"Pass 1 automated profile classification based on document content analysis"
```

**Should Be:**
```
Adult patient record identified based on:
- Patient name "Xavier Flanagan" found with high confidence (0.98)
- Date of birth 15/03/1990 indicates age 35 (adult age range)
- Medicare number 2123 45678 9 detected (Australian healthcare identifier)
- High identity consistency across all pages (0.98 confidence)
- No dependent or family member data detected
- Medical content appropriate for adult patient (0.98 medical appropriateness)
- No contamination indicators found (0.02 contamination risk)

Recommendation: Assign to 'self' profile with high confidence (0.980)
```

**Fix:** Enhance AI prompt to require detailed, evidence-based reasoning (~50-100 additional output tokens)

---

### Gap 7: Profile Bootstrap UX Opportunity

**Concept:** AI-powered profile auto-population from first document upload

**Current (Tedious):**
1. User signs up → forced to fill profile form → THEN upload documents

**Proposed (Smart):**
1. User signs up → upload document → AI extracts identity data → user confirms → profile populated

**Implementation:**
```sql
CREATE TABLE profile_bootstrap_candidates (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  shell_file_id UUID REFERENCES shell_files(id),
  extracted_full_name TEXT,
  extracted_dob DATE,
  extracted_medicare_number TEXT,
  name_confidence NUMERIC(4,3),
  overall_confidence NUMERIC(4,3),
  user_reviewed BOOLEAN DEFAULT FALSE,
  user_approved BOOLEAN DEFAULT FALSE,
  user_corrections JSONB,
  profile_populated BOOLEAN DEFAULT FALSE,
  populated_profile_id UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Examples:** TurboTax (W-2 auto-fill), Banking apps (check scanning), Insurance apps (card scanning)

**Competitive Advantage:** Exora already has AI extraction, confidence scoring, manual review workflows, and compliance infrastructure. This is production-ready.

---

### Gap 8: Hardcoded Database Default for ai_model_used

**Issue:**
```sql
ai_model_used text null default 'gpt-4o-mini'::text
```

**Problems:**
1. Model upgrades require database migration
2. Can't A/B test different models
3. Multi-model strategies blocked
4. Default is misleading (actual usage is "gpt-5-mini")

**Fix:**
```sql
ALTER TABLE profile_classification_audit
ALTER COLUMN ai_model_used DROP DEFAULT;

-- Worker validation:
if (!sessionMetadata.model_used) {
  throw new Error('CRITICAL: AI model not specified in session metadata');
}
```

---

## AI Processing Token Cost Breakdown

### High Token Cost Columns (AI Must Analyze Document Content)

| Column | Token Impact | Purpose |
|--------|--------------|---------|
| `recommended_profile_type` | ❌ ZERO (hardcoded) | Should require full document analysis for profile type |
| `profile_confidence` | HIGH | Derived from comprehensive document analysis |
| `identity_extraction_results` | HIGH | AI must extract and structure identity markers from document |
| `contamination_risk_score` | HIGH | Requires full document scan for multiple identity signals |
| `contamination_checks_performed` | MEDIUM | AI must run multiple validation checks |
| `contamination_warnings` | MEDIUM | AI generates warning messages (when issues detected) |
| `identity_consistency_score` | HIGH | AI must compare identity markers across pages |
| `identity_markers_found` | ❌ ZERO (hardcoded empty) | Should be derived from identity extraction |
| `age_indicators` | ❌ ZERO (hardcoded empty) | Should require AI to detect age-related clues |
| `relationship_indicators` | ❌ ZERO (hardcoded empty) | Should require AI to scan for relationship keywords |
| `medicare_number_detected` | MEDIUM | AI must pattern-match Medicare number format |
| `healthcare_identifier_type` | LOW | Derived from Medicare/identifier detection |
| `healthcare_provider_context` | MEDIUM | AI must read letterhead/header for provider info |
| `classification_reasoning` | MEDIUM | AI generates explanatory text (~50-100 output tokens) |
| `medical_appropriateness_score` | HIGH | AI must validate medical content vs profile type |
| `safety_flags` | MEDIUM | AI generates safety warning messages |

**Total Estimated Token Cost**: ~2000-4000 tokens per document for comprehensive profile classification (when properly implemented)

### Low/No Token Cost Columns (Derived or System Metadata)

| Column | Token Impact | Purpose |
|--------|--------------|---------|
| `id` | NONE | Database auto-generated UUID |
| `processing_session_id` | NONE | System context (FK reference) |
| `shell_file_id` | NONE | System context (FK reference) |
| `cross_profile_risk_detected` | NONE | Derived boolean from contamination_risk_score |
| `manual_review_required` | NONE | Derived boolean from confidence/risk thresholds |
| `reviewed_by_user` | NONE | User action tracking |
| `final_profile_assignment` | NONE | Human override field |
| `age_appropriateness_validated` | NONE | Derived boolean from medical_appropriateness_score |
| `ai_model_used` | NONE | System configuration tracking |
| `validation_method` | NONE | Workflow type tracking |
| `created_at` | NONE | System timestamp |
| `updated_at` | NONE | System timestamp |

---

## Action Items Summary

| Priority | Issue | Type | Action Required |
|----------|-------|------|-----------------|
| 🔴 **CRITICAL** | Profile classification hardcoded to 'self' | Missing Feature | Implement actual profile type classification logic with comparison against user's existing profiles |
| 🔴 **CRITICAL** | No multi-child profile support | Schema Gap | Add `recommended_profile_id UUID` column + AI logic to match specific profiles |
| 🔴 **HIGH** | Manual review resolution workflow incomplete | Missing RPC | Create `approve_profile_classification()` function for atomic workflow resolution |
| 🟡 **MEDIUM** | identity_markers_found arrays empty | AI Output Gap | Update AI prompt + response parsing to populate identity marker arrays |
| 🟡 **MEDIUM** | age_indicators empty | AI Output Gap | Update AI prompt + response parsing to populate age indicator arrays |
| 🟡 **MEDIUM** | healthcare_provider_context NULL | AI Extraction Gap | Enhance AI prompt to extract provider context from document headers/letterhead |
| 🟡 **MEDIUM** | Non-Medicare identifiers not stored | Schema Gap | Store in identity_extraction_results JSONB; plan migration to healthcare_identifiers table |
| 🟡 **MEDIUM** | classification_reasoning too generic | AI Output Quality | Enhance AI prompt to require detailed, evidence-based reasoning |
| 🟢 **LOW** | Hardcoded database default for ai_model | Database Schema | Remove hardcoded default, require explicit worker values |
| 💡 **FEATURE** | Profile bootstrap from first upload | New Feature | Implement AI-powered profile auto-population for first-time users |

---

## Architectural Decisions Required

### Decision 1: Profile Classification Approach

**Option A: Type-Only Classification** (Current placeholder)
- AI returns profile_type ('self', 'child', 'pet')
- User manually assigns to specific child if multiple exist
- Simple, but poor UX

**Option B: Specific Profile Matching** (Recommended)
- AI receives list of user's profiles with demographic data
- AI compares document identity markers to all profiles
- AI returns recommended_profile_id (specific match)
- Better UX, more complex implementation

**Option C: Hybrid Approach**
- AI does type classification first
- If type='child' AND multiple children exist, trigger manual review
- Human selects correct child profile in UI
- Balanced complexity/UX

**Recommendation:** Start with Option C (hybrid), evolve to Option B as AI accuracy improves.

### Decision 2: International Identifier Support

**Question:** Should schema be Australia-centric with "international support" bolted on, or truly global from day one?

**Recommendation:**
- **Short term:** Store in identity_extraction_results JSONB (flexible, no schema lock-in)
- **Long term:** Migrate to healthcare_identifiers table (proper international design)

### Decision 3: Profile Bootstrap UX

**Question:** Should first-time users:
1. Fill demographic form THEN upload documents (traditional)
2. Upload document THEN confirm extracted demographics (AI-powered)
3. Choice of either workflow (advanced)

**Recommendation:** Option 2 (AI-powered) as PRIMARY flow, with manual form as backup for low-confidence extractions.

---

## SQL Verification Queries

```sql
-- Check identity_markers_found population across all records
SELECT
  recommended_profile_type,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE identity_markers_found = '{}') as empty_markers,
  COUNT(*) FILTER (WHERE array_length(identity_markers_found, 1) > 0) as populated_markers
FROM profile_classification_audit
GROUP BY recommended_profile_type;

-- Check age_indicators population
SELECT
  recommended_profile_type,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE age_indicators = '{}') as empty_age_indicators,
  COUNT(*) FILTER (WHERE array_length(age_indicators, 1) > 0) as populated_age_indicators
FROM profile_classification_audit
GROUP BY recommended_profile_type;

-- Check healthcare_provider_context population
SELECT
  healthcare_provider_context,
  COUNT(*) as record_count
FROM profile_classification_audit
GROUP BY healthcare_provider_context
ORDER BY record_count DESC;

-- Check contamination risk distribution
SELECT
  CASE
    WHEN contamination_risk_score < 0.100 THEN 'Very Low (<10%)'
    WHEN contamination_risk_score < 0.300 THEN 'Low (10-30%)'
    WHEN contamination_risk_score < 0.500 THEN 'Medium (30-50%)'
    ELSE 'High (>50%)'
  END as risk_category,
  COUNT(*) as record_count,
  AVG(profile_confidence) as avg_profile_confidence
FROM profile_classification_audit
GROUP BY risk_category
ORDER BY MIN(contamination_risk_score);
```

---

**Audit Complete:** 2025-10-09
**Overall Assessment:** ⚠️ **CRITICAL** - Core profile classification system not implemented, just hardcoded placeholders. Multiple schema gaps and AI output gaps identified. Requires comprehensive fixes before production deployment.
