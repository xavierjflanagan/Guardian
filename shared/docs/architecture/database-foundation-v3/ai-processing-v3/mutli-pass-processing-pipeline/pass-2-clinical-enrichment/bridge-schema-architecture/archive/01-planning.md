# Phase 1: Bridge Schema System - Planning

**Date:** 26 September 2025 → **Completed:** 29 September 2025
**Status:** ✅ **SCOPE ANALYSIS COMPLETE** - Ready for Implementation
**Priority:** CRITICAL BLOCKER - Cannot proceed with AI processing without this
**Dependencies:** V3 database foundation (✅ deployed), Phase 1.6 cleanup (✅ completed)

---

## 📋 **FINAL SCOPE DEFINITION - SYSTEMATIC ANALYSIS COMPLETE**

### **Validated Table Count: 27 Core Processing Tables (20 current + 7 Pass 3 future implementation)**

**Comprehensive Analysis:** Systematically reviewed all 73 tables across 8 schema files to identify AI extraction targets vs system infrastructure. Updated classifications based on Pass 1 architecture analysis.

#### **Profile Demographics & Analytics (2 tables requiring bridge schemas)**

**PASS 2**: Core clinical data extraction
```sql
user_profiles              -- PASS 2: Core profile demographics for patient identification
profile_appointments       -- PASS 2: AI-extracted appointment references from medical documents
```

#### **Clinical Core & Semantic Architecture (15 tables requiring bridge schemas)**

**PASS 2**: Clinical data extraction and enrichment
```sql
patient_clinical_events       -- PASS 2: Central hub for all clinical activity (O3 two-axis classification)
patient_observations         -- PASS 2: Lab results, measurements, assessments
patient_interventions        -- PASS 2: Medications, procedures, treatments
patient_conditions          -- PASS 2: Medical diagnoses with status tracking
patient_allergies           -- PASS 2: Safety-critical allergy records
patient_vitals             -- PASS 2: Vital signs with measurement details
patient_medications        -- PASS 2: Prescription management and tracking
healthcare_encounters      -- PASS 2: Provider visit context and details
patient_immunizations      -- PASS 2: Vaccination records with healthcare standards
medical_code_assignments   -- PASS 2: Entity-to-code mapping (AI creates assignments)
```

**PASS 3**: Semantic narratives and relationships
```sql
healthcare_timeline_events -- PASS 3: UI timeline display optimization
clinical_narratives        -- PASS 3: AI-generated clinical storylines (Pass 3 output)
narrative_event_links      -- PASS 3: Generic linking table for clinical events relationships
narrative_source_mappings  -- PASS 3: AI-created provenance tracking for clinical storylines
```

**PASS 1, PASS 2**: Multi-pass processing infrastructure (requires pass-specific bridge schemas)
```sql
shell_files                -- PASS 1: OCR results + entity metadata; PASS 2: Clinical enrichment status
```

#### **AI Processing Pipeline (9 tables - entity audit added)**

**PASS 1**: Entity detection and audit foundation
```sql
entity_processing_audit      -- PASS 1: Complete audit trail for entity detection (✅ CREATED - enhanced version)
profile_classification_audit -- PASS 1: Patient identity verification and contamination prevention
```

**PASS 1, PASS 2**: Multi-pass audit and management (requires pass-specific bridge schemas)
```sql
entity_processing_audit      -- PASS 1: Entity creation; PASS 2: Clinical enrichment updates
ai_processing_sessions        -- PASS 1: Session creation; PASS 2: Clinical enrichment tracking
manual_review_queue          -- PASS 1: Low-confidence entities; PASS 2: Clinical conflicts
ai_confidence_scoring        -- PASS 1: Entity detection confidence; PASS 2: Clinical confidence
```

**PASS 2**: Clinical processing audit
```sql
-- Note: entity_processing_audit_v2 replaced by enhanced entity_processing_audit (now in PASS 1)
```

**PASS 3**: Semantic narrative processing
```sql
semantic_processing_sessions -- PASS 3: Pass 3 narrative creation session management
narrative_creation_audit     -- PASS 3: Audit trail for clinical narrative creation
shell_file_synthesis_results -- PASS 3: Post-Pass 3 intelligent document summaries
```

#### **Healthcare Provider Integration (1 table)**

**PASS 3**: Provider workflow enhancement
```sql
provider_action_items        -- PASS 3: AI-generated action items and task management for healthcare teams
```

#### **Job Coordination & Analytics (4 tables - RESTRUCTURED)**

**PASS 1**: Entity detection metrics
```sql
pass1_entity_metrics         -- PASS 1: Entity detection performance and quality metrics
```

**PASS 2**: Clinical enrichment metrics
```sql
pass2_clinical_metrics       -- PASS 2: Clinical data extraction performance and confidence metrics
```

**PASS 3**: Narrative creation and processing summary
```sql
pass3_narrative_metrics      -- PASS 3: Narrative creation quality and semantic processing metrics
ai_processing_summary        -- PASS 3: Master summary aggregating all three passes (replaces usage_events)
```

### **UPDATED PASS CLASSIFICATION SUMMARY**

**PASS 1 Tables (Entity Detection): 2 tables**
- profile_classification_audit
- pass1_entity_metrics

**PASS 1, PASS 2 Tables (Multi-Pass): 5 tables × 2 pass versions = 10 bridge schemas**
- entity_processing_audit (Pass 1: entity creation; Pass 2: enrichment updates)
- ai_processing_sessions (Pass 1: session creation; Pass 2: clinical tracking)
- shell_files (Pass 1: OCR + entity metadata; Pass 2: clinical enrichment)
- manual_review_queue (Pass 1: low-confidence entities; Pass 2: clinical conflicts)
- ai_confidence_scoring (Pass 1: entity confidence; Pass 2: clinical confidence)

**PASS 2 Tables (Clinical Data Extraction): 13 tables**
- user_profiles, profile_appointments
- patient_clinical_events, patient_observations, patient_interventions, patient_conditions, patient_allergies, patient_vitals, patient_medications, healthcare_encounters, patient_immunizations, medical_code_assignments
- pass2_clinical_metrics

**PASS 3 Tables (Semantic Narratives): 9 tables (future implementation)**
- healthcare_timeline_events, clinical_narratives, narrative_event_links, narrative_source_mappings
- semantic_processing_sessions, narrative_creation_audit, shell_file_synthesis_results
- provider_action_items
- pass3_narrative_metrics, ai_processing_summary


**Total Bridge Schemas Required: 27 tables + 5 multi-pass duplicates × 3 tiers = 96 schema files**
**Current Phase Focus: 13 Pass 2 single-pass tables + 5 Pass 2 versions of multi-pass tables × 1 source tier = 18 schema files**

---

## 🏗️ **THREE-TIER SCHEMA ARCHITECTURE**

### **Tier 1: Source Schemas**
**Purpose:** Database-focused field definitions for final validation
**Usage:** Pass 2 final validation before database writes
**Content:** Exact field names, data types, constraints from actual V3 schema

**Example Structure:**
```json
{
  "table_name": "patient_clinical_events",
  "fields": {
    "id": "UUID PRIMARY KEY",
    "patient_id": "UUID NOT NULL REFERENCES user_profiles(id)",
    "activity_type": "'observation' | 'intervention'",
    "clinical_purposes": "TEXT[] (screening, diagnostic, therapeutic, monitoring, preventive)",
    "event_name": "TEXT NOT NULL",
    // ... exact database field definitions
  }
}
```

### **Tier 2: Detailed Schemas (Default)**
**Purpose:** Complete medical context with examples and clinical guidance
**Usage:** Standard Pass 2 processing for most documents
**Content:** Rich medical context, examples, clinical decision support

**Example Structure:**
```json
{
  "table_name": "patient_clinical_events",
  "clinical_context": "Central hub for all clinical activity using O3 two-axis classification",
  "fields": {
    "activity_type": {
      "type": "observation | intervention",
      "examples": {
        "observation": "Lab results, vital signs, diagnostic findings",
        "intervention": "Medications, procedures, treatments"
      },
      "clinical_guidance": "Use 'observation' for measurements and findings, 'intervention' for treatments and procedures"
    }
    // ... rich clinical context for each field
  }
}
```

### **Tier 3: Minimal Schemas**
**Purpose:** Token-optimized for large documents or budget constraints
**Usage:** Large documents requiring token budget management
**Content:** Essential fields only with minimal context

**Example Structure:**
```json
{
  "table_name": "patient_clinical_events",
  "essential_fields": ["patient_id", "activity_type", "event_name", "event_date"],
  "field_types": {
    "activity_type": "observation|intervention",
    "event_name": "string",
    "event_date": "date"
  }
}
```

---

## 🎯 **DYNAMIC SCHEMA LOADING SYSTEM**

### **V3BridgeSchemaLoader Class Architecture**

```typescript
interface V3BridgeSchemaLoader {
  // Pass 1 → Pass 2 integration
  getSchemasForEntityCategories(
    categories: EntityCategory[]
  ): Promise<BridgeSchema[]>;

  // Token budget management
  getOptimalSchemaVersion(
    entityCount: number,
    tokenBudget: number
  ): 'minimal' | 'detailed' | 'source';

  // Performance optimization
  loadSchemaWithCaching(
    tableName: string,
    version: 'minimal' | 'detailed' | 'source'
  ): Promise<BridgeSchema>;

  // Validation
  validateSchemaCompleteness(): Promise<ValidationResult>;
}
```

### **Entity Category to Schema Mapping**

```typescript
const ENTITY_TO_SCHEMA_MAPPING = {
  clinical_event: [
    'patient_clinical_events',
    'patient_observations',
    'patient_interventions',
    'healthcare_encounters'
  ],
  healthcare_context: [
    'healthcare_timeline_events',
    'patient_demographics',
    'profile_classification_audit'
  ],
  document_structure: [
    'shell_files',
    'entity_processing_audit_v2'
  ]
};
```

---

## 🔍 **CRITICAL DISCOVERIES FROM SYSTEMATIC ANALYSIS**

### **Architecture Simplifications Achieved**
1. **Medical Code System Cleanup** - Removed vestigial FK-based system (Phase 1.6)
   - Eliminated 2 unused tables + 3 unused FK columns
   - Simplified to single vector-based medical code resolution

2. **Provider Integration Clarified** - Distinguished manual vs AI-generated content
   - `provider_clinical_notes`: Manual provider input (no bridge schema)
   - `clinical_alert_rules`: Administrator configuration (no bridge schema)
   - `provider_action_items`: AI-generated recommendations (bridge schema needed)

3. **System Infrastructure Identified** - Separated AI extraction from system management
   - `job_queue`: Function-driven system infrastructure (no bridge schema)
   - `dual_lens_user_preferences`: UI configuration (no bridge schema)
   - `usage_events`: AI processing analytics (bridge schema needed)

### **Data Flow Validation**
- **AI Document Extraction**: Tables where AI extracts content from medical documents
- **Manual Input**: Tables populated by users/providers through UI forms
- **System Functions**: Tables managed by database functions and worker processes
- **Configuration Data**: Tables containing static/admin configuration

---

## 📊 **UPDATED SUCCESS METRICS**

### **Technical Validation**
- **Schema Coverage:** 100% of 27 validated core processing tables covered (20 current + 7 Pass 3 future)
- **Three-Tier Completeness:** All tables have minimal/detailed/source versions
- **Database Alignment:** 100% accuracy with deployed V3 schema fields (post Phase 1.6)
- **Loading Performance:** Schema loading <50ms per table
- **Caching Efficiency:** >95% cache hit rate for repeated loads

### **Integration Validation**
- **Pass 1 Integration:** Entity categories correctly map to schema sets
- **Token Budget Management:** Automatic tier selection based on document size
- **Error Handling:** Graceful degradation when schemas unavailable
- **Validation Accuracy:** Source schemas match database constraints exactly

---

## 🗃️ **DATABASE MIGRATION REQUIREMENTS**

### **Metrics Restructuring Prerequisites**
- **Complete Cleanup Plan**: Detailed database migration documented in `database-metrics-restructuring.md`
- **Implementation Order**: Follow detailed migration steps for safe transition from usage_events to pass-specific tables
- **Function Updates**: Update tracking functions while preserving billing integration (`user_usage_tracking` unchanged)
- **Permission Management**: Update function grants for new pass-specific metrics functions
- **Dependency Safety**: Remove old infrastructure only after new tables are operational

### **Critical Database Changes Required**
- **Remove**: 1 table (`usage_events`), 2 indexes, 1 RLS policy, function permissions
- **Add**: 4 new metrics tables with structured pass-specific analytics
- **Update**: 2 existing functions (`track_shell_file_upload_usage`, `track_ai_processing_usage`)
- **Create**: 4 new functions (`log_pass1_metrics`, `log_pass2_metrics`, `log_pass3_metrics`, `update_ai_processing_summary`)

---

## ⚠️ **CRITICAL DEPENDENCIES**

### **Database Consistency Achieved ✅**
- **Phase 1.6 completion:** ✅ Medical code cleanup completed (vestigial tables removed)
- **Schema alignment:** ✅ Source of truth schemas updated to match deployed database
- **Architecture cleanup:** ✅ Database reality aligned with intended design

### **Infrastructure Requirements**
- **Worker integration:** Bridge schemas must integrate with operational Render.com worker
- **Caching system:** Performance caching for repeated schema loads
- **Error handling:** Robust error handling for schema loading failures

---

## 📅 **UPDATED IMPLEMENTATION TIMELINE**

### **Week 0: Database Migration (Prerequisites)**
- Day 0: Execute database cleanup plan (`database-metrics-restructuring.md`)
- Day 1: Validate new metrics tables and updated functions

### **Week 1: Schema Content Creation**
- Days 2-5: Create source tier schemas (database-exact field definitions for 31 tables)
- Days 6-7: Create detailed tier schemas (rich medical context)

### **Week 2: Minimal Schemas and Loading System**
- Days 8-9: Create minimal tier schemas (token-optimized)
- Days 10-12: Implement V3BridgeSchemaLoader class
- Days 13-14: Add caching and performance optimization
- Days 15-16: Integration testing and validation

**Total Duration:** 16 days (2.5 weeks including database migration)
**Success Criteria:** 96 schema files + functional loading system + integration tests passing

---

## 🔗 **INTEGRATION WITH SUBSEQUENT PHASES**

### **Phase 2 Dependencies**
- Pass 1 entity detection requires entity-to-schema mapping
- Pass 2 clinical enrichment requires dynamic schema loading
- Token budget management requires tier selection logic

### **Database Integration**
- Bridge schemas exactly match V3 database field definitions (validated via systematic review)
- Source tier used for final validation before database writes
- Schema versions align with deployed table structures (post Phase 1.6 cleanup)

---

**Next Steps:** ✅ **Ready for Implementation** - Begin bridge schema creation for 27 validated tables (20 current + 7 Pass 3 future) with clean V3 database foundation and restructured metrics architecture.



Log of fil by file individual review of tables:

01_foundations.sql Analysis Complete

  Tables Identified:

  Bridge Schema Required: 0 tables

  Justification: All tables are system infrastructure, not AI processing targets.

  1. audit_log - NO BRIDGE SCHEMA NEEDED
    - Purpose: System audit logging for compliance and debugging
    - AI Relevance: Not processed by AI - tracks AI operations instead
    - Justification: Infrastructure table for monitoring, not clinical data extraction
  2. system_notifications - NO BRIDGE SCHEMA NEEDED
    - Purpose: Internal system notifications and alerts
    - AI Relevance: Not processed by AI - system communication only
    - Justification: Administrative interface, not medical document content
  3. system_configuration - NO BRIDGE SCHEMA NEEDED
    - Purpose: Application settings and configuration
    - AI Relevance: Not processed by AI - system settings only
    - Justification: Configuration data, not clinical information
  4. user_account_archival - NO BRIDGE SCHEMA NEEDED
    - Purpose: GDPR compliance account deletion tracking
    - AI Relevance: Not processed by AI - privacy compliance only
    - Justification: Legal/compliance tracking, not medical content
  5. feature_flags - NO BRIDGE SCHEMA NEEDED
    - Purpose: Progressive feature rollout management
    - AI Relevance: Not processed by AI - application control only
    - Justification: Feature management, not clinical data
  6. implementation_sessions - NO BRIDGE SCHEMA NEEDED
    - Purpose: Migration and deployment tracking
    - AI Relevance: Not processed by AI - deployment history only
    - Justification: System administration, not medical information

  Critical System Infrastructure Noted:

  - 6 ENUM types created for consistency across schema
  - Security functions (is_admin(), is_healthcare_provider(), etc.) available to all subsequent scripts
  - Audit infrastructure ready for clinical table integration
  - Feature flags system for V3 AI processing capabilities

  Planning File Status:
  No updates required - 01_foundations.sql contains only system infrastructure tables, confirming our 20-table clinical focus is correct.
  Summary: 6 system infrastructure tables - 0 require bridge schemas (all are administrative/audit tables, not AI processing targets)


---------------------------------------- 


02_profiles.sql Analysis Complete

Tables Identified: 10 tables

Bridge Schema Required: 2 tables
Justification: Profile demographics and appointment extraction are AI processing targets. User events excluded as system-generated data.

BRIDGE SCHEMA REQUIRED:
1. user_profiles - BRIDGE SCHEMA NEEDED ✅
   - Purpose: Core profile demographics and identity information
   - AI Relevance: Profile classification, document routing, patient identification
   - Fields for AI: display_name, full_name, date_of_birth, species, breed, relationship, date_preferences

2. user_events - TABLE DOES NOT EXIST ❌
   - Status: This table does not exist in the current database schema
   - Reason: Was never implemented or was removed during database evolution

3. profile_appointments - BRIDGE SCHEMA NEEDED ✅
   - Purpose: AI-extracted appointment references from medical documents
   - AI Relevance: Extract appointment mentions from GP summaries, appointment reminder emails
   - Fields for AI: appointment_date, provider_name, appointment_type, source tracking
   - Use Cases: "Next appointment March 15th with Dr. Smith", appointment reminder emails uploaded as documents

BRIDGE SCHEMA NOT REQUIRED: 7 tables
- profile_access_permissions (access control configuration)
- user_profile_context (UI state management)
- smart_health_features (triggered by AI results, not input)
- pregnancy_journey_events (subset of clinical events)
- profile_verification_rules (business logic configuration)
- profile_detection_patterns (AI model configuration)
- profile_auth_progression (authentication state)

Summary: 10 profile management tables - 2 require bridge schemas

-----------------------------

03_clinical_core.sql Analysis Complete

Tables Identified: 26 tables + 1 materialized view

Bridge Schema Required: 16 tables
Justification: Core clinical data processing tables containing the bulk of AI extraction targets.

BRIDGE SCHEMA REQUIRED:

Core Clinical Data Extraction (10 tables):
1. patient_clinical_events - Central hub for all clinical activity (O3 two-axis classification)
2. patient_observations - Lab results, measurements, assessments
3. patient_interventions - Medications, procedures, treatments
4. patient_conditions - Medical diagnoses with status tracking
5. patient_allergies - Safety-critical allergy records
6. patient_vitals - Vital signs with measurement details
7. patient_medications - Prescription management and tracking
8. healthcare_encounters - Provider visit context and details
9. healthcare_timeline_events - UI timeline display optimization
10. clinical_narratives - AI-generated clinical storylines (Pass 3 output)

V3 Semantic Architecture (3 tables):
11. shell_files - Document containers with AI synthesis (Pass 1-3 processing metadata)
12. patient_immunizations - Vaccination records with healthcare standards
13. narrative_event_links - Generic linking table for clinical events relationships

Medical Code Resolution (2 tables):
14. medical_code_assignments - Entity-to-code mapping (AI creates assignments)
15. narrative_source_mappings - AI-created provenance tracking for clinical storylines

Medical Code Resolution Reference Tables - NO BRIDGE SCHEMA:
- universal_medical_codes (pre-embedded reference library for vector search)
- regional_medical_codes (pre-embedded reference library for vector search)
- Note: AI searches these tables but doesn't write to them

V2 Legacy Reference Tables - VESTIGIAL (TO BE REMOVED):
- medical_condition_codes (unused empty table with no queries - scheduled for Phase 1.6 cleanup)
- medication_reference (unused empty table with no queries - scheduled for Phase 1.6 cleanup)
- Note: Has FK references but no data/queries - architectural legacy to be cleaned up

BRIDGE SCHEMA NOT REQUIRED: 11 tables
- All audit tables (temporal_audit_log, clinical_identity_audit, etc.)
- Vestigial reference tables (medical_condition_codes, medication_reference - to be removed in Phase 1.6)
- System processing logs (deduplication_processing_log, code_resolution_log)
- Computed views (patient_current_clinical_state materialized view)

Critical Discovery: Old FK-based medical code system is vestigial (unused) - only vector-based system is functional.

Phase 1.6 Cleanup Required: Remove 2 unused tables + 3 unused FK columns before bridge schema creation.

Summary: 26 tables + 1 view - 16 require bridge schemas

Running Total: 18 bridge schemas identified (2 profiles + 16 clinical core)

---------------------------------------- 

04_ai_processing.sql Analysis Complete

Tables Identified: 10 tables

Bridge Schema Required: 9 tables
Justification: AI processing pipeline tables are core AI extraction targets and processing metadata repositories.

BRIDGE SCHEMA REQUIRED:

AI Processing Core (3 tables):
1. ai_processing_sessions - Session management for three-pass AI processing pipeline
2. entity_processing_audit_v2 - Audit trail for AI entity extraction decisions
3. profile_classification_audit - Profile classification safety and contamination prevention

Quality & Validation (2 tables):
4. manual_review_queue - Human-in-the-loop validation for low-confidence AI results
5. ai_confidence_scoring - AI confidence metrics and scoring algorithms

Pass 3 Semantic Infrastructure (3 tables):
6. semantic_processing_sessions - Pass 3 narrative creation session management
7. narrative_creation_audit - Audit trail for clinical narrative creation
8. shell_file_synthesis_results - Post-Pass 3 intelligent document summaries

BRIDGE SCHEMA NOT REQUIRED: 2 tables
- dual_lens_user_preferences (user interface preference configuration, not AI extraction target)
- narrative_view_cache (performance optimization cache, not extraction target)

Summary: 10 AI processing tables - 8 require bridge schemas

Running Total: 26 bridge schemas identified (2 profiles + 16 clinical core + 8 AI processing)

---------------------------------------- 

05_healthcare_journey.sql Analysis Complete

Tables Identified: 12 tables (8 main + 4 partitions)

Bridge Schema Required: 1 table
Justification: AI-generated clinical recommendations for healthcare providers.

BRIDGE SCHEMA REQUIRED:

Clinical Decision Support (1 table):
1. provider_action_items - AI-generated action items and task management for healthcare teams

BRIDGE SCHEMA NOT REQUIRED: 11 tables
- provider_clinical_notes (manual provider input during encounters, not AI extraction)
- clinical_alert_rules (configuration data created by administrators, not AI extraction)
- provider_registry (provider directory, not AI extraction target)
- registered_doctors_au (regulatory verification data)
- patient_provider_access (security/permissions configuration)
- provider_access_log + 4 partitions (audit logging, not clinical content)
- healthcare_provider_context (provider workflow state)

Critical Discovery: provider_clinical_notes and clinical_alert_rules are manual input/configuration, not AI extraction targets.

Summary: 12 healthcare journey tables - 1 require bridge schemas

Running Total: 27 bridge schemas identified (2 profiles + 16 clinical core + 8 AI processing + 1 healthcare journey)

----------------------------------------

06_security.sql Analysis Complete

Tables Identified: 3 tables

Bridge Schema Required: 0 tables
Justification: All tables are GDPR consent management and user preferences - not AI extraction targets.

BRIDGE SCHEMA NOT REQUIRED: 3 tables

GDPR Consent Management (3 tables):
- patient_consents (GDPR Article 7 compliant consent management - user configuration)
- patient_consent_audit (compliance audit trail - system logging)
- user_consent_preferences (user preference management - UI configuration)

Additional Content: Comprehensive RLS policy framework for all V3 tables (no new tables)

Summary: 3 security/consent tables - 0 require bridge schemas

Running Total: 27 bridge schemas identified (2 profiles + 16 clinical core + 8 AI processing + 1 healthcare journey + 0 security)

----------------------------------------

07_optimization.sql Analysis Complete

Tables Identified: 2 tables

Bridge Schema Required: 0 tables
Justification: All tables are system infrastructure, not AI extraction targets.

BRIDGE SCHEMA NOT REQUIRED: 2 tables
- job_queue (system job management via functions, not AI document extraction)
- failed_audit_events (system error recovery infrastructure, not clinical content extraction)

Critical Discovery: job_queue is function-driven system infrastructure (enqueue_job_v3(), worker coordination), not AI extraction from medical documents.

Data Flow Analysis: User uploads → System functions create jobs → Render.com workers process → System functions update status. No AI document extraction involved.

Additional Content: Performance indexes, database constraints, health monitoring functions, production settings (no new tables)

Summary: 2 optimization tables - 0 require bridge schemas

Running Total: 28 bridge schemas identified (2 profiles + 15 clinical core + 9 AI processing + 1 healthcare journey + 0 security + 0 optimization + 1 multi-pass reclassification)

----------------------------------------

08_job_coordination.sql Analysis Complete - FINAL SCHEMA FILE

Tables Identified: 4 tables (RESTRUCTURED TO 7 TABLES)

Bridge Schema Required: 4 tables (UPDATED)
Justification: Restructured usage_events into pass-specific metrics tables for better analytics and bridge schema alignment.

BRIDGE SCHEMA REQUIRED:

Pass-Specific Analytics (4 tables):
1. pass1_entity_metrics - Entity detection performance and quality metrics
2. pass2_clinical_metrics - Clinical data extraction performance and confidence metrics
3. pass3_narrative_metrics - Narrative creation quality and semantic processing metrics
4. ai_processing_summary - Master summary aggregating all three passes (replaces usage_events)

BRIDGE SCHEMA NOT REQUIRED: 3 tables
- api_rate_limits (multi-provider API quota configuration, not AI extraction)
- user_usage_tracking (billing cycle management, system-calculated usage)
- subscription_plans (business configuration with pre-seeded plans, not AI extraction)

RESTRUCTURING NOTE:
- OLD: 1 usage_events table spanning all passes with JSONB metrics
- NEW: 4 tables with pass-specific structured metrics + master summary
- BENEFIT: Better analytics, performance, and bridge schema alignment

Additional Content: V3 job coordination functions (10 functions), RPC interface for Render.com workers, security framework

Summary: 7 job coordination tables - 4 require bridge schemas

FINAL TOTAL: 32 bridge schemas identified (2 profiles + 15 clinical core + 8 AI processing + 1 healthcare journey + 0 security + 0 optimization + 4 job coordination + 2 pass-1-only)

========================================
SYSTEMATIC SCHEMA REVIEW COMPLETE
========================================

Total Database Tables Analyzed: 73 tables across 8 schema files (actual implementation)
Total Bridge Schemas Required: 27 tables + 5 multi-pass duplicates × 3 tiers = 96 schema files

Bridge Schema Breakdown by Category:
- Profile Demographics & Analytics: 2 tables (user_profiles, profile_appointments)
- Clinical Core & Semantic Architecture: 15 tables (10 Pass 2 + 4 Pass 3 + 1 shell_files multi-pass)
- AI Processing Pipeline: 8 tables (5 multi-pass + 3 Pass 3 semantic processing)
- Healthcare Provider Integration: 1 table (provider_action_items - Pass 3)
- Security & Consent Management: 0 tables
- System Optimization: 0 tables
- Job Coordination & Analytics: 4 tables (pass1_entity_metrics, pass2_clinical_metrics, pass3_narrative_metrics, ai_processing_summary)
- Pass 1 Entity Detection: 2 tables (pass1_entity_metrics, profile_classification_audit)
- Multi-Pass Tables: 5 tables requiring pass-specific schemas (ai_processing_sessions, shell_files, manual_review_queue, ai_confidence_scoring, entity_processing_audit)