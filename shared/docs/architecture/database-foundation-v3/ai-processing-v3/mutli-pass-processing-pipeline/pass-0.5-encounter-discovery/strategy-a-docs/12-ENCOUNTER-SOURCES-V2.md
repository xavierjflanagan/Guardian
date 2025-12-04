# Encounter Sources: Pass 0.5 Pipeline Readiness

**Status:** REQUIRED for Strategy A Pass 0.5 Implementation
**Created:** November 18, 2024
**Scope:** Prepare Pass 0.5 to handle shell_files from ANY source

---

## Executive Summary

This document defines how **Pass 0.5 prepares to handle shell_files from multiple sources** without needing to know where they came from. The pipeline processes all shell_files identically, whether they're scanned hospital documents, AI-generated progress notes, or API imports.

**Core Principle:**
Pass 0.5 doesn't care about shell_file origin. It just processes documents and discovers encounters.

**What IS in this document (Pass 0.5 Requirements):**
- Database schema fields to track encounter origins (metadata)
- Pipeline neutrality - all shell_files processed the same way
- Forward compatibility for File 13 progress-note-first features
- Reconciler updates to preserve source metadata

**What is NOT in this document (File 13 Features):**
- How progress notes are created from manual UI updates
- AI chat session integration
- Session-based batching
- Voice recording workflows
- Those are UI/frontend concerns, not pipeline concerns

---

## Table of Contents

1. [Pass 0.5 Pipeline Perspective](#1-pass-05-pipeline-perspective)
2. [Encounter Source Metadata Fields](#2-encounter-source-metadata-fields)
3. [Database Schema Extensions](#3-database-schema-extensions)
4. [Reconciler Updates](#4-reconciler-updates)
5. [Forward Compatibility](#5-forward-compatibility)

---

## 1. Pass 0.5 Pipeline Perspective

### 1.1 Pipeline is Source-Agnostic

**Pass 0.5's Job:**
"I receive a `shell_file` with OCR data. I chunk it, discover encounters, and reconcile them. I don't need to know if this was a hospital discharge summary or an AI-generated progress note."

```typescript
// Pass 0.5 perspective
interface ShellFileInput {
  id: uuid;
  file_type: string;              // Could be anything
  subtype?: string;               // Could be 'progress_note', 'scanned_doc', etc.
  ocr_pages: OCRPage[];           // What I actually need
  uploaded_by: uuid;              // Who created it

  // I don't care about these (yet):
  // - source_session_id
  // - source_recording_id
  // - content_markdown
}

// Pass 0.5 output
interface EncounterDiscovered {
  // Clinical data...
  patient_id: uuid;
  encounter_type: string;

  // Source tracking (metadata only)
  source_shell_file_id: uuid;     // Always present
  encounter_source: 'shell_file'; // Always 'shell_file' for Pass 0.5

  // Other metadata fields (for future features)
  manual_created_by?: string;     // Set by upstream (if progress note from manual UI)
  created_by_user_id: uuid;       // Set by upstream
  api_source_name?: string;       // Set by upstream (if API import)
}
```

### 1.2 Three Future Shell File Sources

While Pass 0.5 treats all shell_files the same, **upstream systems** will create shell_files from different sources:

#### Source Type 1: Uploaded Medical Documents (Current)
User uploads PDF/image of medical record.

**Shell File Creation:**
- Via current upload flow
- `file_type: 'medical_record'`
- `subtype: null` (or 'scanned_document')
- OCR performed immediately

**Pass 0.5 Processing:**
- Standard chunking → encounter discovery → reconciliation
- `encounter_source: 'shell_file'` (default)

#### Source Type 2: Progress Notes from Manual UI (File 13 Future)
User makes manual health updates via UI → system generates progress note → creates shell_file.

**Shell File Creation (Future):**
- Via progress note generator (File 13)
- `file_type: 'progress_note'`
- `subtype: 'manual_update_session'` or `'ai_chat_session'`
- `content_markdown` + `content_json` fields populated
- No traditional OCR (structured JSON instead)

**Pass 0.5 Processing:**
- Receives shell_file just like any other document
- May use `content_json` instead of OCR for encounter extraction
- Still outputs encounters to pending table
- `encounter_source: 'shell_file'` (all progress notes are shell_files)

**Metadata Preservation:**
- If progress note came from manual UI, `manual_created_by: 'user'` carried through
- If provider created it, `manual_created_by: 'provider'` preserved
- Quality tier calculated based on creator

#### Source Type 3: API Imports (File 13 Future)
External healthcare system sends encounter data → creates shell_file.

**Shell File Creation (Future):**
- Via API integration (File 13)
- `file_type: 'api_import'`
- `api_source_name: 'medicare_australia'`
- Structured data format

**Pass 0.5 Processing:**
- Processes like any other shell_file
- `encounter_source: 'shell_file'`
- `api_source_name` preserved as metadata

### 1.3 Why This Matters

**Current State (Strategy A):**
- Only Source Type 1 exists (uploaded documents)
- All encounters have `encounter_source: 'shell_file'`

**Future State (File 13):**
- Sources 2 and 3 also create shell_files
- Pass 0.5 pipeline unchanged
- Metadata fields track origin for UI/reporting

**Pipeline Benefit:**
Pass 0.5 never needs modification. It's truly source-agnostic.

---

## 2. Encounter Source Metadata Fields

These fields track WHERE encounters came from. They're **metadata** for reporting/UI, not pipeline logic.

### 2.1 encounter_source Field

**Purpose:** Track the general category of how this encounter was discovered.

```sql
encounter_source varchar(20) NOT NULL DEFAULT 'shell_file'
  CHECK (encounter_source IN ('shell_file', 'manual', 'api'))
```

**Pass 0.5 Usage:**
- Always sets to `'shell_file'` (because everything comes through shell_files)
- Other values reserved for potential future direct-entry (no document)

**Why 'manual' and 'api' exist:**
Future-proofing. If someday we allow encounters WITHOUT documents, we have the field.

**Current Reality:**
- 100% of encounters = `'shell_file'`
- Even progress notes from manual UI = `'shell_file'`
- Even API imports = `'shell_file'`

### 2.2 manual_created_by Field

**Purpose:** If shell_file was a progress note from manual UI, who created it?

```sql
manual_created_by varchar(20)
  CHECK (manual_created_by IN ('provider', 'user', 'other_user'))
```

**Pass 0.5 Usage:**
- Copies from shell_file metadata to encounter
- Used for quality tier calculation
- NULL for uploaded medical documents

**Example Flow (File 13 Future):**
```typescript
// User makes manual edit in UI
User: "I started Metformin yesterday"
  ↓
Progress note generator creates shell_file:
{
  file_type: 'progress_note',
  uploaded_by: user_id,
  // Metadata for Pass 0.5:
  manual_created_by: 'user'
}
  ↓
Pass 0.5 discovers encounter:
{
  encounter_source: 'shell_file',
  source_shell_file_id: shell_file.id,
  manual_created_by: 'user',        // ← Copied from shell_file
  data_quality_tier: 'MEDIUM'       // ← Calculated from manual_created_by
}
```

### 2.3 created_by_user_id Field

**Purpose:** Which user created the shell_file (audit trail).

```sql
created_by_user_id uuid NOT NULL REFERENCES auth.users(id)
```

**Pass 0.5 Usage:**
- Always populated (from shell_file.uploaded_by)
- Used for RLS policies
- Used for audit logging

### 2.4 api_source_name Field

**Purpose:** If shell_file came from external API, which system?

```sql
api_source_name varchar(100)
```

**Pass 0.5 Usage:**
- Copies from shell_file metadata
- NULL for uploaded docs and progress notes
- Used for trust scoring (File 13 future)

**Example (File 13 Future):**
```typescript
// Medicare Australia sends data via API
API creates shell_file:
{
  file_type: 'api_import',
  api_source_name: 'medicare_australia',
  api_import_date: '2024-11-18'
}
  ↓
Pass 0.5 discovers encounters:
{
  encounter_source: 'shell_file',
  api_source_name: 'medicare_australia',
  data_quality_tier: 'HIGH'  // Based on source reputation
}
```

---

## 3. Database Schema Extensions

### 3.1 Core Metadata Fields (Both Tables)

**Tables:** `pass05_pending_encounters`, `healthcare_encounters`

```sql
-- Primary source classification
ALTER TABLE pass05_pending_encounters ADD COLUMN
  encounter_source varchar(20) NOT NULL DEFAULT 'shell_file'
    CHECK (encounter_source IN ('shell_file', 'manual', 'api'));

ALTER TABLE healthcare_encounters ADD COLUMN
  encounter_source varchar(20) NOT NULL DEFAULT 'shell_file'
    CHECK (encounter_source IN ('shell_file', 'manual', 'api'));

-- Manual encounter metadata (from progress notes)
ALTER TABLE pass05_pending_encounters ADD COLUMN
  manual_created_by varchar(20)
    CHECK (manual_created_by IN ('provider', 'user', 'other_user'));

ALTER TABLE healthcare_encounters ADD COLUMN
  manual_created_by varchar(20)
    CHECK (manual_created_by IN ('provider', 'user', 'other_user'));

-- User tracking (audit trail)
ALTER TABLE pass05_pending_encounters ADD COLUMN
  created_by_user_id uuid REFERENCES auth.users(id);

ALTER TABLE healthcare_encounters ADD COLUMN
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id);

-- API source metadata (future)
ALTER TABLE pass05_pending_encounters ADD COLUMN
  api_source_name varchar(100),
  api_import_date date;

ALTER TABLE healthcare_encounters ADD COLUMN
  api_source_name varchar(100),
  api_import_date date;

-- Data quality tier (calculated from metadata)
ALTER TABLE pass05_pending_encounters ADD COLUMN
  data_quality_tier varchar(20)
    CHECK (data_quality_tier IN ('LOW', 'MEDIUM', 'HIGH', 'VERIFIED'));

ALTER TABLE healthcare_encounters ADD COLUMN
  data_quality_tier varchar(20)
    CHECK (data_quality_tier IN ('LOW', 'MEDIUM', 'HIGH', 'VERIFIED'));
```

### 3.2 Validation Constraints

**Strategy A Reality:**
Since everything goes through shell_files, only the first constraint is needed now.

```sql
-- Current constraint (Strategy A)
ALTER TABLE pass05_pending_encounters ADD CONSTRAINT
  check_shell_file_source_valid
  CHECK (
    encounter_source != 'shell_file' OR source_shell_file_id IS NOT NULL
  );

ALTER TABLE healthcare_encounters ADD CONSTRAINT
  check_shell_file_source_valid
  CHECK (
    encounter_source != 'shell_file' OR source_shell_file_id IS NOT NULL
  );

-- Future-proofing constraints (not enforced in Strategy A)
-- These would only matter if we allow direct entry without documents

ALTER TABLE pass05_pending_encounters ADD CONSTRAINT
  check_manual_source_valid
  CHECK (
    encounter_source != 'manual' OR manual_created_by IS NOT NULL
  );

ALTER TABLE healthcare_encounters ADD CONSTRAINT
  check_manual_source_valid
  CHECK (
    encounter_source != 'manual' OR manual_created_by IS NOT NULL
  );

ALTER TABLE pass05_pending_encounters ADD CONSTRAINT
  check_api_source_valid
  CHECK (
    encounter_source != 'api' OR api_source_name IS NOT NULL
  );

ALTER TABLE healthcare_encounters ADD CONSTRAINT
  check_api_source_valid
  CHECK (
    encounter_source != 'api' OR api_source_name IS NOT NULL
  );
```

### 3.3 Indexes

```sql
-- Index by encounter source (reporting queries)
CREATE INDEX idx_pending_encounters_source
  ON pass05_pending_encounters(encounter_source);

CREATE INDEX idx_healthcare_encounters_source
  ON healthcare_encounters(encounter_source);

-- Index by manual creator (quality tier filtering)
CREATE INDEX idx_pending_encounters_manual_creator
  ON pass05_pending_encounters(manual_created_by)
  WHERE manual_created_by IS NOT NULL;

CREATE INDEX idx_healthcare_encounters_manual_creator
  ON healthcare_encounters(manual_created_by)
  WHERE manual_created_by IS NOT NULL;

-- Index by created_by_user (audit/RLS)
CREATE INDEX idx_pending_encounters_creator
  ON pass05_pending_encounters(created_by_user_id);

CREATE INDEX idx_healthcare_encounters_creator
  ON healthcare_encounters(created_by_user_id);

-- Index by API source (future)
CREATE INDEX idx_healthcare_encounters_api_source
  ON healthcare_encounters(api_source_name)
  WHERE api_source_name IS NOT NULL;
```

### 3.4 NOT Included in Strategy A

**These tables from File 13 are NOT created yet:**
- `ai_chat_sessions` - AI conversation tracking
- `manual_update_sessions` - Session batching
- `session_updates` - Update change log
- `progress_note_deletion_log` - Deletion governance
- `entity_orphaning_log` - Cascade tracking
- `voice_recordings` - Voice integration

**These shell_files columns are NOT added yet:**
- `subtype` - Fine-grained document classification
- `source_session_id` - Link to manual update session
- `source_recording_id` - Link to voice recording
- `content_markdown` - Human-readable progress note
- `content_json` - Machine-readable progress note

**These are File 13 features.** Pass 0.5 pipeline doesn't need them.

---

## 4. Reconciler Updates

### 4.1 Metadata Preservation

When reconciler creates final encounters from pending encounters, it must preserve source metadata.

**CRITICAL: Metadata is copied by HARD-WIRED CODE, not extracted by AI.**

The AI only sees clinical content (names, dates, medications, etc.). It has NO knowledge of:
- `manual_created_by` - Who created the progress note
- `encounter_source` - Where the shell_file came from
- `api_source_name` - Which external system sent the data
- Quality tiers - Trust level of the data

**The reconciler (TypeScript function) fetches shell_file metadata and copies it to final encounters.** This happens in code, after AI processing is complete.

**Updated Reconciliation Logic:**

```typescript
async function reconcilePendingEncountersV2(
  sessionId: string,
  shellFileId: string,
  totalPages: number
): Promise<EncounterMetadata[]> {

  // ... existing session guard check ...

  // Fetch all pending encounters
  const { data: pendings } = await supabase
    .from('pass05_pending_encounters')
    .select('*')
    .eq('session_id', sessionId);

  // Fetch shell_file metadata once (for all encounters in this session)
  const { data: shellFile } = await supabase
    .from('shell_files')
    .select('uploaded_by, file_type, subtype')
    .eq('id', shellFileId)
    .single();

  // Group by cascade_id
  const cascadeGroups = groupBy(pendings, p => p.cascade_id);

  for (const [cascadeId, groupPendings] of cascadeGroups) {
    // ... existing position merging logic ...

    // Insert final encounter with metadata
    await supabase.from('healthcare_encounters').insert({
      // Clinical data (existing)
      patient_id: groupPendings[0].patient_id,
      encounter_type: groupPendings[0].encounter_type,

      // Position data (existing - 13 fields)
      start_page: startPosition.start_page,
      // ... all position fields ...

      // SOURCE METADATA (NEW)
      encounter_source: 'shell_file',                    // Always shell_file for Pass 0.5
      source_shell_file_id: shellFileId,                 // Link back to document

      // Copy metadata from pending (preserves upstream settings)
      manual_created_by: groupPendings[0].manual_created_by,  // NULL for uploaded docs
      created_by_user_id: shellFile.uploaded_by,         // Who created shell_file
      api_source_name: groupPendings[0].api_source_name, // NULL for uploaded docs

      // Quality tier (calculated from metadata)
      data_quality_tier: groupPendings[0].data_quality_tier,

      // Existing fields
      page_ranges: mergedPageRanges,
      cascade_id: cascadeId,
      chunk_count: groupPendings.length
    });
  }

  // ... existing batching aggregation ...
}
```

### 4.2 Quality Tier Calculation

**For uploaded medical documents:**
```typescript
// AI determines quality tier from document content (existing logic)
data_quality_tier = calculateFromABCCriteria(encounter);
manual_created_by = null;
```

**For progress notes (File 13 future):**
```typescript
// Quality tier based on who created the progress note
if (manual_created_by === 'provider') {
  data_quality_tier = 'VERIFIED';  // Provider attestation
} else if (manual_created_by === 'user') {
  data_quality_tier = 'MEDIUM';    // User self-report
} else if (manual_created_by === 'other_user') {
  data_quality_tier = 'LOW';       // Untrusted third party
}
```

**For API imports (File 13 future):**
```typescript
// Quality tier based on source reputation
const apiReputation = {
  'medicare_australia': 'HIGH',
  'my_health_record': 'HIGH',
  'fitbit_api': 'MEDIUM',
  'user_entered_api': 'LOW'
};

data_quality_tier = apiReputation[api_source_name] || 'MEDIUM';
```

---

## 5. Forward Compatibility

### 5.1 File 13 Integration Points

When File 13 features are built, they integrate seamlessly:

**Progress Note Creation Flow (File 13):**
```typescript
// 1. User makes manual update via UI (File 13 frontend)
const progressNote = generateProgressNote(userUpdates);

// 2. Create shell_file (File 13 backend)
const { data: shellFile } = await supabase
  .from('shell_files')
  .insert({
    file_type: 'progress_note',
    subtype: 'manual_update_session',
    uploaded_by: user_id,
    content_markdown: progressNote.markdown,
    content_json: progressNote.json,

    // Metadata for Pass 0.5 (already exists in schema)
    // No new fields needed!
  })
  .select()
  .single();

// 3. Pass 0.5 processes it (existing pipeline, zero changes)
await enqueueJobV3({
  shell_file_id: shellFile.id,
  job_type: 'pass_05_encounter_discovery'
});

// 4. Encounters created with metadata preserved (existing reconciler)
```

**Key Point:**
File 13 builds "above" Pass 0.5. The pipeline itself doesn't change.

### 5.2 Schema is Already Ready

**What File 13 needs that already exists:**
- `encounter_source` field (already added)
- `manual_created_by` field (already added)
- `created_by_user_id` field (already added)
- `api_source_name` field (already added)
- `data_quality_tier` field (already added)

**What File 13 needs that will be added later:**
- New tables (ai_chat_sessions, etc.) - separate from Pass 0.5
- New shell_files columns (subtype, content_markdown, etc.) - doesn't affect Pass 0.5
- Frontend UI for manual updates - completely separate

**Migration Path:**
Zero breaking changes to Pass 0.5 pipeline when File 13 is implemented.

### 5.3 Phased Implementation Strategy

**Phase 1: NOW (Strategy A Pass 0.5)**
Build:
- ✅ Universal document processing pipeline
- ✅ Metadata fields in database schema
- ✅ Reconciler preserves source metadata
- ✅ Quality tier calculation supports all sources

Don't build:
- ❌ Manual encounter UI forms
- ❌ Progress note generation
- ❌ AI chat sessions
- ❌ Session batching

**Phase 2: LATER (File 13 Pre-Launch)**
Build:
- Manual encounter UI
- Progress note generator
- Session-based batching
- AI chat integration

Reuse:
- Existing Pass 0.5 pipeline (unchanged)
- Existing database schema (just add File 13 tables)
- Existing reconciler (unchanged)

---

## Appendix A: Example Data Flows

### Example 1: Uploaded Medical Document (Current)

```typescript
// 1. User uploads PDF
const file = uploadPDF('discharge_summary.pdf');

// 2. Shell file created (current upload flow)
const shellFile = {
  id: 'shell-001',
  file_type: 'medical_record',
  uploaded_by: user_id,
  // These are NULL for uploaded docs:
  manual_created_by: null,
  api_source_name: null
};

// 3. Pass 0.5 processes
const encounters = processDocument(shellFile);

// 4. Encounters created
{
  encounter_source: 'shell_file',
  source_shell_file_id: 'shell-001',
  manual_created_by: null,          // Uploaded doc, not manual
  created_by_user_id: user_id,
  api_source_name: null,
  data_quality_tier: 'HIGH'         // From A/B/C criteria
}
```

### Example 2: Progress Note from Manual UI (File 13 Future)

```typescript
// 1. User makes manual update in UI
User: "Add medication: Metformin 500mg BID"

// 2. Progress note generator creates shell_file (File 13)
const shellFile = {
  id: 'shell-002',
  file_type: 'progress_note',
  subtype: 'manual_update_session',
  uploaded_by: user_id,
  content_markdown: "# Patient Update\n...",
  content_json: { medications: [...] },

  // Metadata for Pass 0.5 (no new fields needed):
  // (manual_created_by will be inferred from context, not stored on shell_file)
};

// 3. Pass 0.5 processes (unchanged pipeline)
const encounters = processDocument(shellFile);

// 4. Encounters created (with metadata)
{
  encounter_source: 'shell_file',       // It's a shell_file
  source_shell_file_id: 'shell-002',    // Links to progress note
  manual_created_by: 'user',            // Metadata from File 13
  created_by_user_id: user_id,
  api_source_name: null,
  data_quality_tier: 'MEDIUM'           // User-created = MEDIUM max
}
```

### Example 3: API Import (File 13 Future)

```typescript
// 1. Medicare Australia sends data via API
const apiData = receiveFromMedicare(patientId);

// 2. API integration creates shell_file (File 13)
const shellFile = {
  id: 'shell-003',
  file_type: 'api_import',
  subtype: 'medicare_claim',
  uploaded_by: system_user_id,
  content_json: apiData,

  // Metadata for Pass 0.5:
  // (api_source_name will be set during creation)
};

// 3. Pass 0.5 processes (unchanged pipeline)
const encounters = processDocument(shellFile);

// 4. Encounters created
{
  encounter_source: 'shell_file',
  source_shell_file_id: 'shell-003',
  manual_created_by: null,
  created_by_user_id: system_user_id,
  api_source_name: 'medicare_australia',
  api_import_date: '2024-11-18',
  data_quality_tier: 'HIGH'             // Trusted source
}
```

---

## Appendix B: Key Takeaways

### For Pass 0.5 Implementation

**What you need to know:**
1. All encounters come from shell_files (no exceptions in Strategy A)
2. Always set `encounter_source: 'shell_file'`
3. Copy metadata from shell_file/pending to final encounter
4. Calculate quality tier based on metadata (manual_created_by, api_source_name)
5. Don't build any progress note generation (that's File 13)

**What you don't need to worry about:**
1. How progress notes are created (File 13 problem)
2. Manual encounter UI forms (File 13 problem)
3. Session batching (File 13 problem)
4. AI chat integration (File 13 problem)

### For File 13 Implementation (Future)

**What's already ready:**
1. Database schema has all needed metadata fields
2. Pass 0.5 pipeline processes all shell_files identically
3. Reconciler preserves source metadata
4. Quality tier calculation supports all sources

**What File 13 needs to build:**
1. Progress note generator (upstream of Pass 0.5)
2. Manual encounter UI (frontend)
3. Session batching logic (frontend)
4. New tables for AI chat, sessions, etc. (separate from Pass 0.5)

**Integration is seamless:**
File 13 creates shell_files → Pass 0.5 processes them → Done.

---

**Document Status:** Strategy A Pass 0.5 Pipeline Readiness (REQUIRED)
**Last Updated:** November 18, 2024
**Related Documents:**
- `13-MANUAL-ENCOUNTERS-FUTURE.md` - Progress note generation, UI workflows, File 13 features
- `11-DATA-QUALITY-SYSTEM.md` - Quality tier framework and A/B/C criteria
- `03-TABLE-DESIGN-V3.md` - Complete database schema
- `02-SCRIPT-ANALYSIS-V2.md` - Reconciler implementation details
