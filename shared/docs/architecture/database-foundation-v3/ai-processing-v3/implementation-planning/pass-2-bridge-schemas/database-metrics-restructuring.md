# Database Metrics Restructuring - COMPLETED ✓

**Date:** 30 September 2025
**Purpose:** Restructure single `usage_events` table into pass-specific metrics tables
**Reason:** Better analytics, performance, and bridge schema alignment for three-pass AI pipeline
**Status:** ✅ COMPLETED - Migration applied successfully on 30 September 2025

---

## **Current State Analysis**

### **Existing Table: `usage_events`**
**Location:** `08_job_coordination.sql` lines 213-235

**Current Structure:**
```sql
CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Event Details
    event_type TEXT NOT NULL CHECK (event_type IN (
        'shell_file_uploaded', 'shell_file_processed', 'ai_processing_started', 'ai_processing_completed',
        'page_extracted', 'storage_used', 'plan_upgraded', 'plan_downgraded', 'limit_hit'
    )),

    -- Metrics (flexible JSONB for different event types)
    metrics JSONB DEFAULT '{}', -- { "file_size_mb": 2.5, "pages": 10, "tokens_used": 1500 }

    -- References
    shell_file_id UUID REFERENCES shell_files(id),
    job_id UUID,  -- References job_queue

    -- Metadata for analytics
    user_agent TEXT,
    ip_address INET,

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **Current Dependencies:**

**Tables (Direct Dependencies):**
- `usage_events` (line 213) - Target table for removal

**Tables (Related - NO CHANGES NEEDED):**
- `user_usage_tracking` (line 165) - Monthly billing aggregates - **KEEP UNCHANGED**
- `api_rate_limits` (line 91) - API rate limiting configuration - **KEEP UNCHANGED**
- `subscription_plans` (line 242) - Billing plans configuration - **KEEP UNCHANGED**

**Indexes to Remove:**
- `idx_usage_events_profile_type` on `usage_events(profile_id, event_type, created_at)` (line 238)
- `idx_usage_events_created_at` on `usage_events(created_at)` (line 239)

**RLS Policies to Remove:**
- `usage_events_profile_isolation` policy (lines 311-318)

**Functions that INSERT into usage_events (MAJOR UPDATES REQUIRED):**
1. **`track_shell_file_upload_usage()`** (line 733):
   ```sql
   -- Line 806: Current INSERT
   INSERT INTO usage_events (profile_id, event_type, metrics, shell_file_id)
   VALUES (p_profile_id, 'shell_file_uploaded', {...})

   -- ALSO updates user_usage_tracking (line 784) - KEEP THIS UNCHANGED
   ```

2. **`track_ai_processing_usage()`** (line 832):
   ```sql
   -- Line 890: Current INSERT
   INSERT INTO usage_events (profile_id, event_type, metrics, job_id)
   VALUES (p_profile_id, 'ai_processing_completed', {...})

   -- ALSO updates user_usage_tracking (line 871) - KEEP THIS UNCHANGED
   ```

**Function Permissions to Update (lines 1022-1036):**
```sql
-- Current permissions that need updating
REVOKE EXECUTE ON FUNCTION track_shell_file_upload_usage(uuid, uuid, bigint, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION track_ai_processing_usage(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_shell_file_upload_usage(uuid, uuid, bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION track_ai_processing_usage(uuid, uuid, integer, integer) TO service_role;
```

---

## **Target Architecture: Pass-Specific Tables**

### **New Table Structure:**

#### **1. Pass 1 Entity Detection Metrics**
```sql
CREATE TABLE IF NOT EXISTS pass1_entity_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    processing_session_id UUID REFERENCES ai_processing_sessions(id),

    -- Pass 1 Specific Metrics
    entities_detected INTEGER NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    vision_model_used TEXT NOT NULL,
    ocr_model_used TEXT,

    -- Quality Metrics
    ocr_agreement_average NUMERIC(3,2),
    confidence_distribution JSONB, -- { "high": 15, "medium": 8, "low": 2 }
    entity_types_found TEXT[], -- ['medication', 'condition', 'vital_sign']

    -- Cost and Performance
    vision_tokens_used INTEGER,
    ocr_pages_processed INTEGER,
    cost_usd NUMERIC(8,4),

    -- Metadata
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### **2. Pass 2 Clinical Enrichment Metrics**
```sql
CREATE TABLE IF NOT EXISTS pass2_clinical_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    processing_session_id UUID REFERENCES ai_processing_sessions(id),

    -- Pass 2 Specific Metrics
    clinical_entities_enriched INTEGER NOT NULL,
    schemas_populated TEXT[] NOT NULL, -- ['patient_conditions', 'patient_medications']
    clinical_model_used TEXT NOT NULL,

    -- Quality Metrics
    average_clinical_confidence NUMERIC(3,2),
    manual_review_triggered_count INTEGER DEFAULT 0,
    validation_failures INTEGER DEFAULT 0,

    -- Bridge Schema Performance
    bridge_schemas_used TEXT[],
    schema_loading_time_ms INTEGER,

    -- Cost and Performance
    clinical_tokens_used INTEGER NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    cost_usd NUMERIC(8,4),

    -- Metadata
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### **3. Pass 3 Narrative Creation Metrics**
```sql
CREATE TABLE IF NOT EXISTS pass3_narrative_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,
    semantic_session_id UUID REFERENCES semantic_processing_sessions(id),

    -- Pass 3 Specific Metrics
    narratives_created INTEGER NOT NULL,
    narrative_quality_score NUMERIC(3,2),
    semantic_model_used TEXT NOT NULL,
    synthesis_complexity TEXT CHECK (synthesis_complexity IN ('simple', 'moderate', 'complex')),

    -- Content Metrics
    narrative_length_avg INTEGER, -- Average narrative length in characters
    clinical_relationships_found INTEGER,
    timeline_events_created INTEGER,

    -- Cost and Performance
    semantic_tokens_used INTEGER NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    cost_usd NUMERIC(8,4),

    -- Metadata
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### **4. Master AI Processing Summary**
```sql
CREATE TABLE IF NOT EXISTS ai_processing_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    shell_file_id UUID NOT NULL REFERENCES shell_files(id) ON DELETE CASCADE,

    -- Processing Overview
    processing_status TEXT NOT NULL CHECK (processing_status IN (
        'pass1_only', 'pass1_pass2', 'complete_pipeline', 'failed'
    )),
    overall_success BOOLEAN NOT NULL,
    failure_stage TEXT, -- 'pass1', 'pass2', 'pass3' if failed

    -- Aggregated Metrics
    total_processing_time_ms INTEGER NOT NULL,
    total_tokens_used INTEGER NOT NULL,
    total_cost_usd NUMERIC(8,4) NOT NULL,

    -- Quality Summary
    overall_confidence_score NUMERIC(3,2),
    entities_extracted_total INTEGER,
    manual_review_required BOOLEAN DEFAULT FALSE,

    -- Pass References
    pass1_metrics_id UUID REFERENCES pass1_entity_metrics(id),
    pass2_metrics_id UUID REFERENCES pass2_clinical_metrics(id),
    pass3_metrics_id UUID REFERENCES pass3_narrative_metrics(id),

    -- Business Events (preserved from original usage_events)
    business_events JSONB DEFAULT '[]', -- [{"event": "plan_upgraded", "timestamp": "..."}]

    -- Metadata
    user_agent TEXT,
    ip_address INET,
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## **Migration Steps**

### **Step 1: Create New Tables**
- Add four new tables to `08_job_coordination.sql`
- Create appropriate indexes for performance
- Set up RLS policies for each table

### **Step 2: Update Functions**

**Critical: Maintain Dual-Insert Pattern**
Both existing functions insert into **TWO SYSTEMS**:
- `user_usage_tracking` (monthly billing aggregates) - **KEEP UNCHANGED**
- `usage_events` (detailed analytics) - **REPLACE WITH NEW TABLES**

**Function Updates Required:**

1. **Modify `track_shell_file_upload_usage()`**:
   - **KEEP**: `user_usage_tracking` updates (lines 784-803)
   - **REPLACE**: `usage_events` insert (line 806) with `ai_processing_summary` insert
   - **ADD**: Initialize new summary record for the shell file

2. **Modify `track_ai_processing_usage()`**:
   - **KEEP**: `user_usage_tracking` updates (lines 871-887)
   - **REPLACE**: `usage_events` insert (line 890) with pass-specific table inserts
   - **ADD**: Update `ai_processing_summary` with final aggregation

**New Functions to Create:**
- `log_pass1_metrics()` - Insert into `pass1_entity_metrics`
- `log_pass2_metrics()` - Insert into `pass2_clinical_metrics`
- `log_pass3_metrics()` - Insert into `pass3_narrative_metrics`
- `update_ai_processing_summary()` - Aggregate and finalize summary

**Function Permission Updates:**
- Update existing grants to match new function signatures
- Add grants for new pass-specific functions
- Maintain security model (authenticated for upload tracking, service_role for AI processing)

### **Step 3: Data Migration (if needed)**
- Migrate existing `usage_events` data to appropriate new tables
- Preserve business events in `ai_processing_summary.business_events`

### **Step 4: Remove Old Infrastructure**

**Remove in this order:**
1. **Drop function permissions** for old function signatures:
   ```sql
   REVOKE EXECUTE ON FUNCTION track_shell_file_upload_usage(uuid, uuid, bigint, integer) FROM PUBLIC;
   REVOKE EXECUTE ON FUNCTION track_ai_processing_usage(uuid, uuid, integer, integer) FROM PUBLIC;
   ```

2. **Drop RLS policy:**
   ```sql
   DROP POLICY IF EXISTS "usage_events_profile_isolation" ON usage_events;
   ```

3. **Drop indexes:**
   ```sql
   DROP INDEX IF EXISTS idx_usage_events_profile_type;
   DROP INDEX IF EXISTS idx_usage_events_created_at;
   ```

4. **Drop table:**
   ```sql
   DROP TABLE IF EXISTS usage_events;
   ```

5. **Add new function permissions** for updated function signatures

---

## **Bridge Schema Impact**

### **New Bridge Schema Requirements:**

**Pass 1 Bridge Schemas:**
- `pass1_entity_metrics.md` (new)

**Pass 2 Bridge Schemas:**
- `pass2_clinical_metrics.md` (new)

**Pass 3 Bridge Schemas:**
- `pass3_narrative_metrics.md` (new)
- `ai_processing_summary.md` (new, replaces `usage_events.md`)

### **Updated Table Count:**
- **Before**: 28 tables requiring bridge schemas
- **After**: 30 tables requiring bridge schemas (+3 new metrics tables, -1 usage_events)
- **Total Bridge Schemas**: 30 × 3 tiers = 90 schema files

---

## **Benefits of This Restructuring**

### **Performance Benefits:**
- **Smaller, focused tables** for faster pass-specific queries
- **Optimized indexes** for each pass's query patterns
- **Reduced JSONB usage** in favor of structured columns

### **Analytics Benefits:**
- **Pass-specific analysis** without complex WHERE clauses
- **Clear separation** of concerns between passes
- **Better cost tracking** per pass for optimization

### **Bridge Schema Benefits:**
- **Pass-aligned schemas** that match processing phases
- **Specific field requirements** for each pass type
- **Cleaner architecture** for AI model integration

---

## **Implementation Status: ✅ COMPLETED**

### **Migration Applied: 30 September 2025**
- ✅ **Created new table structures** - All 4 pass-specific metrics tables created
- ✅ **Updated functions** - Both tracking functions updated to use new tables
- ✅ **Removed old infrastructure** - usage_events table and related components removed
- ✅ **Source of truth updated** - 08_job_coordination.sql updated to reflect new structure

### **Migration Details:**
- **Migration Script:** `2025-09-30_07_pass1_entity_audit_and_metrics_restructuring.sql`
- **Database Status:** Successfully applied to Supabase production database
- **Source Files Updated:** 08_job_coordination.sql (v1.1) with complete metrics restructuring

### **Verification:**
All changes have been implemented and verified:
1. ✅ Four new pass-specific metrics tables created and indexed
2. ✅ usage_events table completely removed
3. ✅ Functions updated to write to new table structure
4. ✅ RLS policies applied to all new tables
5. ✅ Backward compatibility maintained through function signature preservation

**Status:** Ready for Pass 1, Pass 2, and Pass 3 implementation with structured metrics tracking