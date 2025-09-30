# Clinical Tables Hub-and-Spoke Architecture Cleanup

**Status:** 🔴 CRITICAL ARCHITECTURAL INCONSISTENCY IDENTIFIED
**Created:** 30 September 2025
**Priority:** HIGH - Affects all clinical data extraction and referential integrity
**Issue:** Clinical tables have inconsistent foreign key patterns (some use event_id, others use patient_id directly)

---

## Core Architectural Questions

### Question 1: Should ALL clinical tables require an event_id that references patient_clinical_events.id?

**Current State:** INCONSISTENT
- ✅ `patient_observations` → HAS required `event_id` FK
- ✅ `patient_interventions` → HAS required `event_id` FK
- ⚠️ `patient_conditions` → Has OPTIONAL `clinical_event_id` (added via migration)
- ❌ `patient_vitals` → NO event_id reference (uses patient_id directly)
- ❌ `patient_allergies` → NO event_id reference (uses patient_id directly)
- ❌ `patient_medications` → NO event_id reference (uses patient_id directly)
- ❌ `patient_immunizations` → NO event_id reference (uses patient_id directly)
- ❌ `healthcare_encounters` → NO event_id reference (uses patient_id directly)

**Proposed State:** CONSISTENT (Hard Enforcement)
- ✅ ALL clinical tables REQUIRE `event_id` that references `patient_clinical_events(id) ON DELETE CASCADE`
- ✅ Every clinical entity is a child of a patient_clinical_events hub record
- ✅ Single source of truth for each clinical entity

### Question 2: Do ALL clinical tables require the existence of patient_id?

**Current State:** MIXED
- All tables currently have `patient_id UUID NOT NULL REFERENCES user_profiles(id)`
- This is denormalized data (patient_id can be derived via event_id → patient_clinical_events → patient_id)

**Proposed State:** To Be Decided
- **Option A:** Keep patient_id for denormalized query performance
- **Option B:** Remove patient_id, derive via JOIN through patient_clinical_events
- **Option C:** Keep patient_id but make it GENERATED ALWAYS AS computed column

---

## Current Architecture Issues

### Issue 1: Inconsistent Parent References

**Problem:** Some tables can exist independently of patient_clinical_events, breaking the hub-and-spoke model.

**Example Scenario:**
```sql
-- ❌ Currently possible: Create vitals without a parent event
INSERT INTO patient_vitals (patient_id, vital_type, measurement_value, unit, measurement_date)
VALUES ('patient-uuid', 'blood_pressure', '{"systolic": 120, "diastolic": 80}', 'mmHg', NOW());

-- ✅ Should require: Create event first, then vitals
INSERT INTO patient_clinical_events (patient_id, shell_file_id, activity_type, clinical_purposes, event_name, event_date)
VALUES ('patient-uuid', 'file-uuid', 'observation', ARRAY['monitoring'], 'Blood pressure measurement', NOW())
RETURNING id; -- Returns event_id

INSERT INTO patient_vitals (event_id, patient_id, vital_type, measurement_value, unit, measurement_date)
VALUES ('event-uuid', 'patient-uuid', 'blood_pressure', '{"systolic": 120, "diastolic": 80}', 'mmHg', NOW());
```

### Issue 2: Lost Semantic Context

Without patient_clinical_events as parent, we lose:
- **O3 Classification:** activity_type (observation/intervention) + clinical_purposes (why)
- **Source Provenance:** shell_file_id linkage to source document
- **Narrative Linking:** narrative_id for Pass 3 semantic processing
- **Event Context:** event_name, method, body_site, performed_by, facility_name
- **Deduplication Foundation:** Proper event-level identity for temporal management

### Issue 3: Bridge Schema Confusion

**Current Problem:** Bridge schemas don't enforce the hub-and-spoke flow.

**Example:** patient_vitals bridge schema allows direct insertion without mentioning patient_clinical_events requirement.

---

## Proposed Solution: Hard Enforcement

### Architectural Principle

**"Every clinical entity is a child of a patient_clinical_events hub record"**

This means:
1. You cannot create a clinical detail record without first creating a patient_clinical_events parent
2. All clinical tables MUST have `event_id` as a NOT NULL foreign key
3. All clinical entities inherit context (shell_file_id, encounter_id, narrative_id) from their parent event

### Database Schema Changes Required

```sql
-- =============================================================================
-- MIGRATION: Enforce Hub-and-Spoke Architecture for All Clinical Tables
-- =============================================================================

BEGIN;

-- Step 1: Add event_id to tables that don't have it (as nullable initially)
ALTER TABLE patient_vitals ADD COLUMN event_id UUID REFERENCES patient_clinical_events(id) ON DELETE CASCADE;
ALTER TABLE patient_allergies ADD COLUMN event_id UUID REFERENCES patient_clinical_events(id) ON DELETE CASCADE;
ALTER TABLE patient_medications ADD COLUMN event_id UUID REFERENCES patient_clinical_events(id) ON DELETE CASCADE;
ALTER TABLE patient_immunizations ADD COLUMN event_id UUID REFERENCES patient_clinical_events(id) ON DELETE CASCADE;
ALTER TABLE healthcare_encounters ADD COLUMN event_id UUID REFERENCES patient_clinical_events(id) ON DELETE CASCADE;

-- Step 2: Backfill event_id for existing records
-- This requires creating patient_clinical_events records for orphaned data
-- (See backfill script below)

-- Step 3: Make event_id NOT NULL after backfill
ALTER TABLE patient_vitals ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE patient_allergies ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE patient_medications ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE patient_immunizations ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE healthcare_encounters ALTER COLUMN event_id SET NOT NULL;

-- Step 4: Rename clinical_event_id to event_id for consistency (patient_conditions)
ALTER TABLE patient_conditions RENAME COLUMN clinical_event_id TO event_id;
ALTER TABLE patient_conditions ALTER COLUMN event_id SET NOT NULL;

-- Step 5: Create indexes for performance
CREATE INDEX idx_patient_vitals_event_id ON patient_vitals(event_id);
CREATE INDEX idx_patient_allergies_event_id ON patient_allergies(event_id);
CREATE INDEX idx_patient_medications_event_id ON patient_medications(event_id);
CREATE INDEX idx_patient_immunizations_event_id ON patient_immunizations(event_id);
CREATE INDEX idx_healthcare_encounters_event_id ON healthcare_encounters(event_id);

COMMIT;
```

### Backfill Script for Existing Data

```sql
-- =============================================================================
-- Create patient_clinical_events for orphaned clinical records
-- =============================================================================

-- Example: Backfill patient_vitals
INSERT INTO patient_clinical_events (
    patient_id,
    shell_file_id,
    activity_type,
    clinical_purposes,
    event_name,
    event_date,
    ai_extracted,
    ai_confidence,
    created_at,
    updated_at
)
SELECT
    pv.patient_id,
    COALESCE(pv.source_shell_file_id, (SELECT id FROM shell_files WHERE patient_id = pv.patient_id LIMIT 1)), -- Best guess or create synthetic
    'observation' AS activity_type,
    ARRAY['monitoring']::TEXT[] AS clinical_purposes,
    'Vital Signs: ' || pv.vital_type AS event_name,
    pv.measurement_date AS event_date,
    pv.ai_extracted,
    pv.ai_confidence,
    pv.created_at,
    pv.updated_at
FROM patient_vitals pv
WHERE pv.event_id IS NULL
RETURNING id, patient_id, event_name;

-- Then update patient_vitals with the new event_id
UPDATE patient_vitals pv
SET event_id = pce.id
FROM patient_clinical_events pce
WHERE pv.patient_id = pce.patient_id
  AND pv.measurement_date = pce.event_date
  AND pv.event_id IS NULL
  AND pce.event_name LIKE 'Vital Signs: %';

-- Repeat similar logic for other tables
```

---

## Pros and Cons of Hard Enforcement

### ✅ PROS (Strong Arguments FOR Hard Enforcement)

1. **Single Source of Truth**
   - Every clinical entity has one authoritative parent event
   - No orphaned clinical data
   - Clear data lineage and provenance

2. **Referential Integrity**
   - ON DELETE CASCADE ensures no orphaned records
   - Database enforces the architectural pattern
   - Impossible to create invalid data structures

3. **Rich Semantic Context**
   - All clinical data inherits O3 classification (activity_type + clinical_purposes)
   - Source provenance via shell_file_id
   - Narrative linking via narrative_id for Pass 3

4. **Deduplication Foundation**
   - Temporal management works at event level
   - clinical_identity_key on parent event enables proper deduplication
   - Version tracking across event updates

5. **Query Simplification**
   - Single JOIN path to get full context
   - Consistent query patterns across all clinical tables
   - No special cases for "standalone" vs "hub-linked" tables

6. **AI Extraction Clarity**
   - Bridge schemas have one clear pattern
   - Pass 2 AI always creates parent event first
   - No confusion about which tables need event_id vs patient_id

7. **Future-Proof Architecture**
   - Adding new clinical tables follows same pattern
   - Scales to Pass 3 narrative architecture
   - Supports complex clinical reasoning queries

### ❌ CONS (Arguments AGAINST Hard Enforcement)

1. **Breaking Change for Existing Data**
   - Requires data migration for all existing records
   - Backfill process could be complex for large datasets
   - Risk of data loss if backfill logic is incorrect

2. **Increased Database Operations**
   - Must create parent event before detail record (2 INSERTs instead of 1)
   - Potential performance impact for high-volume insertions
   - Transaction complexity (must succeed/fail atomically)

3. **Overkill for Simple Use Cases**
   - Simple self-tracking apps (BP monitor, weight tracker) may not need full event context
   - Users manually entering single vitals don't have shell_file_id or O3 classification
   - Forces semantic overhead where it may not be needed

4. **Migration Complexity**
   - Patient-entered data has no shell_file_id (no source document)
   - Creating synthetic events for manual entries feels artificial
   - Temporal backfill may not preserve original creation dates accurately

5. **Query Performance Trade-off**
   - Simple queries like "get all BP readings" now require JOIN
   - Denormalized patient_id in detail tables was useful for RLS policies
   - Additional index maintenance overhead

6. **Developer Friction**
   - More complex API endpoints (create event + detail in transaction)
   - Error handling becomes more complex (partial failures)
   - Testing requires setting up parent events for all test data

---

## Recommendation

**🟢 PROCEED WITH HARD ENFORCEMENT**

Despite the cons, the architectural benefits far outweigh the migration costs. Here's why:

### Core Rationale

1. **Exora is a document-centric platform**
   - Primary use case is extracting clinical data from uploaded documents
   - Every extraction has a shell_file_id (source document)
   - Manual data entry is secondary use case

2. **O3 Classification is fundamental**
   - Understanding WHY data was collected is as important as the data itself
   - clinical_purposes inform deduplication, narrative building, and clinical reasoning
   - Losing this context degrades the product's core value proposition

3. **Temporal management requires event-level identity**
   - clinical_identity_key lives on patient_clinical_events
   - Deduplication across uploads needs parent event grouping
   - Version tracking across document updates needs event lineage

4. **Pass 3 narrative architecture depends on events**
   - narrative_id references live on patient_clinical_events
   - Semantic narratives group events, not individual vitals/meds
   - Missing parent events breaks Pass 3 entirely

### Mitigation Strategies for Cons

**For Simple Use Cases (manual entry):**
- Create "synthetic" patient_clinical_events with activity_type='observation', clinical_purposes=['self_monitoring']
- Use shell_file_id=NULL or special "manual_entry" sentinel value
- Wrap in application layer so users don't see complexity

**For Performance:**
- Use database transactions to create event + detail atomically
- Batch operations for multiple vitals from same document
- Index event_id on all detail tables

**For Migration:**
- Write careful backfill logic with dry-run mode
- Migrate table-by-table with validation checks
- Keep patient_id as denormalized field (don't remove it)

---

## Question 2 Deep Dive: Should patient_id Remain on Clinical Tables?

### Current State
All clinical tables have:
```sql
patient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE
```

### Analysis

**Denormalized Data (current):**
- patient_id stored directly on every clinical table
- Can query patient data without JOINing through patient_clinical_events
- Useful for RLS (Row Level Security) policies

**Normalized Data (could remove):**
- patient_id derivable via: detail_table → event_id → patient_clinical_events → patient_id
- Eliminates data duplication
- Enforces single source of truth

### Recommendation: KEEP patient_id (Denormalization Justified)

**Reasons:**

1. **RLS Policy Performance**
   ```sql
   -- Current (fast): Direct patient_id check
   CREATE POLICY patient_vitals_isolation ON patient_vitals
   FOR ALL USING (patient_id = auth.uid());

   -- Without patient_id (slow): JOIN required
   CREATE POLICY patient_vitals_isolation ON patient_vitals
   FOR ALL USING (
       event_id IN (
           SELECT id FROM patient_clinical_events WHERE patient_id = auth.uid()
       )
   );
   ```

2. **Query Performance for Common Patterns**
   ```sql
   -- Get all BP readings for patient (current)
   SELECT * FROM patient_vitals WHERE patient_id = ?;

   -- Without patient_id (requires JOIN)
   SELECT pv.* FROM patient_vitals pv
   JOIN patient_clinical_events pce ON pv.event_id = pce.id
   WHERE pce.patient_id = ?;
   ```

3. **Database Constraint Safety**
   - Double-check that detail record belongs to same patient as event
   - Prevents accidental cross-patient data leakage
   - CHECK constraint: `(SELECT patient_id FROM patient_clinical_events WHERE id = event_id) = patient_id`

4. **Minimal Cost**
   - UUIDs are 16 bytes - not huge overhead
   - Disk space is cheap
   - Write complexity minimal (set patient_id same as parent event)

**Implementation:**
- Keep patient_id as NOT NULL
- Add CHECK constraint to ensure it matches parent event's patient_id
- Maintain denormalization for performance, use event_id for semantics

---

## Implementation Plan

### Phase 1: Schema Migration (Database Changes)
- [ ] Add event_id columns to tables missing it
- [ ] Create backfill scripts for existing data
- [ ] Run backfill in staging environment
- [ ] Validate backfill accuracy
- [ ] Make event_id NOT NULL after backfill
- [ ] Add CHECK constraints for patient_id consistency
- [ ] Create indexes on event_id columns

### Phase 2: Bridge Schema Updates
- [ ] Update all Pass 2 bridge schemas to require event_id
- [ ] Add extraction order guidance: "Create patient_clinical_events first"
- [ ] Update examples to show hub-and-spoke flow
- [ ] Add validation rules for event_id presence

### Phase 3: Pass 2 AI Processing Updates
- [ ] Update system prompt to enforce event-first extraction
- [ ] Implement transaction logic: create event → get event_id → create details
- [ ] Add validation layer to reject detail records without event_id
- [ ] Update error messages to guide correct extraction flow

### Phase 4: Application Layer Updates
- [ ] Update API endpoints to create events + details atomically
- [ ] Add helper functions for "synthetic" events (manual entry use case)
- [ ] Update frontend to handle event-first creation flow
- [ ] Migrate existing API consumers

### Phase 5: Testing & Validation
- [ ] Unit tests for all clinical table insertions
- [ ] Integration tests for Pass 2 extraction flow
- [ ] Performance testing (query latency with new JOINs)
- [ ] Data integrity validation (no orphaned records)

---

## Decision Required

**Primary Decision:** Should we proceed with hard enforcement of hub-and-spoke architecture?
- ✅ YES - Make event_id NOT NULL on all clinical tables
- ❌ NO - Keep current mixed pattern

**Secondary Decision:** Should we keep patient_id on clinical tables?
- ✅ YES - Keep for RLS and query performance (denormalized)
- ❌ NO - Remove and derive via JOIN (normalized)

**Recommended Decisions:**
1. **YES** - Hard enforce hub-and-spoke (event_id NOT NULL everywhere)
2. **YES** - Keep patient_id denormalized (with CHECK constraint for consistency)

---

## Impact Assessment

**Affected Components:**
- 🔴 Database schema (8 clinical tables need migration)
- 🔴 Pass 2 bridge schemas (all 18 need event_id guidance)
- 🔴 Pass 2 AI processing logic (extraction order enforcement)
- 🟡 Application APIs (transaction logic updates)
- 🟡 Frontend UI (minimal impact if API abstracts complexity)
- 🟢 Pass 3 (benefits from consistent architecture)

**Timeline Estimate:**
- Schema migration: 1-2 days (including backfill)
- Bridge schema updates: 1 day
- Pass 2 AI updates: 2-3 days
- Application updates: 2-3 days
- Testing: 2-3 days
- **Total: ~2 weeks**

**Risk Level:** MEDIUM
- Breaking change but with clear migration path
- Requires careful backfill for existing data
- Can be rolled out table-by-table to reduce risk

---

## Next Steps

1. **Review and approve** this architectural decision with stakeholders
2. **Create detailed migration scripts** for each clinical table
3. **Update bridge schemas** to document the hub-and-spoke requirement
4. **Test migration** in staging environment with production data snapshot
5. **Execute migration** in production during maintenance window
6. **Update Pass 2 AI** to enforce new extraction flow
7. **Monitor** for orphaned records or referential integrity violations

---

**Document Status:** 🟡 AWAITING DECISION
**Next Review:** After stakeholder approval
**Owner:** Xavier Flanagan / Claude Code

**END OF DOCUMENT**