# Manual Encounters and Progress Notes: Future Vision

**Status:** Future Enhancement Design (NOT required for Strategy A Pass 0.5)
**Created:** November 18, 2024
**Scope:** Post-Pass 0.5 enhancements for manual data entry, AI assistance, and voice integration

---

## Executive Summary

This document captures the **future vision** for manual encounter creation, AI-assisted updates, voice recording integration, and progress note workflows in Exora. These features represent significant enhancements beyond the core Strategy A Pass 0.5 implementation.

**Core Architectural Principle:**
All File 13 features create **shell_files** that flow through the existing Pass 0.5 pipeline. These are **upstream features** (before Pass 0.5), not pipeline modifications.

**What IS in Strategy A Pass 0.5 (File 12):**
- Pass 0.5 pipeline ready to handle shell_files from any source
- Database schema with metadata fields (encounter_source, manual_created_by, etc.)
- Reconciler preserves source metadata
- Quality tier calculation supports all sources

**What is NOT in Strategy A Pass 0.5 (documented here in File 13):**
- **Progress note generation** - How to create shell_files from manual UI/AI chat/voice
- **AI chat session integration** - Conversation tracking and classification
- **Session-based batching** - Grouping multiple updates into one progress note
- **Voice recording processing** - Transcript to progress note conversion
- **Governance policies** - Edit windows, deletion rules, cascade prevention
- **Manual encounter UI** - Frontend forms and workflows

**Key Understanding:**
- **File 12 (Pass 0.5):** "I process shell_files, I don't care where they came from"
- **File 13 (This doc):** "Here's how we CREATE those shell_files from various sources"

**Reference:** For Pass 0.5 pipeline readiness, see `12-ENCOUNTER-SOURCES-V2.md`

---

## Table of Contents

1. [Metadata Tracking Through Pipeline](#1-metadata-tracking-through-pipeline)
2. [AI Chat Session Architecture](#2-ai-chat-session-architecture)
3. [Progress Note Lifecycle Management](#3-progress-note-lifecycle-management)
4. [Voice Recording Integration](#4-voice-recording-integration)
5. [Progress-Note-First Pipeline](#5-progress-note-first-pipeline)
6. [Session-Based Update Batching](#6-session-based-update-batching)
7. [Governance and Security Policies](#7-governance-and-security-policies)
8. [Cascade Deletion Behavior](#8-cascade-deletion-behavior)
9. [Database Schema Extensions](#9-database-schema-extensions)

---

## 1. Metadata Tracking Through Pipeline

### 1.1 The Critical Question

**User's Question:** "When you say 'Copies from shell_file metadata to encounter', do you mean a function tracks the progress note as it makes its way through the pipeline and then at the end once the encounter is created in pending, the shell_file metadata is then pasted into the appropriate columns?"

**Answer:** YES, exactly. But it's **hard-wired code** (not AI) that does the copying.

### 1.2 Metadata Flow Architecture

**File 13 creates shell_files WITH metadata → Pass 0.5 processes WITHOUT seeing metadata → Reconciler COPIES metadata to final encounters**

```typescript
┌─────────────────────────────────────────────────────────────┐
│                  FILE 13 FEATURES                            │
│         (Create shell_files from various sources)           │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Create shell_file with metadata                     │
│ (Manual UI, AI chat, voice recording)                       │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
      shell_file created:
      {
        id: 'shell-abc',
        file_type: 'progress_note',
        uploaded_by: user_id,
        content_json: {...}
      }
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Store metadata separately                           │
│ (shell_file_metadata table - NOT on shell_files)            │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
      shell_file_metadata:
      {
        shell_file_id: 'shell-abc',
        manual_created_by: 'user',        // ← Metadata!
        source_type: 'manual_ui',
        session_id: 'session-xyz'
      }
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PASS 0.5 PIPELINE                         │
│              (AI processes clinical content)                 │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
      AI sees ONLY clinical content:
      - Patient names
      - Medications
      - Dates

      AI does NOT see:
      - manual_created_by ✗
      - encounter_source ✗
      - Quality tiers ✗
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Post-processor creates pending encounters           │
│ (Still NO metadata - just clinical data from AI)            │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
      pass05_pending_encounters:
      {
        encounter_type: 'outpatient_visit',
        patient_full_name: 'John Smith',
        provider_name: 'Dr. Johnson',
        // NO manual_created_by yet!
      }
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Reconciler fetches metadata and copies              │
│ (HARD-WIRED TypeScript code, not AI)                        │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
      Reconciler queries:
      1. Fetch shell_file metadata
      2. Copy to final encounter
              │
              ▼
      healthcare_encounters:
      {
        encounter_source: 'shell_file',
        source_shell_file_id: 'shell-abc',
        manual_created_by: 'user',        // ← Copied from metadata!
        created_by_user_id: user_id,
        data_quality_tier: 'MEDIUM'       // ← Calculated from manual_created_by
      }
```

### 1.3 shell_file_metadata Table (NEW - File 13)

**Purpose:** Store metadata about shell_file origin WITHOUT polluting the shell_files table.

```sql
-- File 13 addition (NOT in Pass 0.5)
CREATE TABLE shell_file_metadata (
  shell_file_id uuid PRIMARY KEY REFERENCES shell_files(id) ON DELETE CASCADE,

  -- Source classification
  source_type varchar(50) NOT NULL,     -- 'uploaded', 'manual_ui', 'ai_chat', 'voice', 'api_import'

  -- Manual entry metadata
  manual_created_by varchar(20),        -- 'provider', 'user', 'other_user'
  session_id uuid,                      -- REFERENCES manual_update_sessions(session_id)

  -- AI chat metadata
  ai_session_id uuid,                   -- REFERENCES ai_chat_sessions(session_id)

  -- Voice recording metadata
  recording_id uuid,                    -- REFERENCES voice_recordings(recording_id)

  -- API import metadata
  api_source_name varchar(100),
  api_import_date date,

  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_shell_file_metadata_source ON shell_file_metadata(source_type);
CREATE INDEX idx_shell_file_metadata_manual ON shell_file_metadata(manual_created_by);
```

### 1.4 Example: Manual UI Creates Progress Note

**Frontend (File 13):**
```typescript
// User makes manual update in UI
async function handleManualMedicationAdd(medication: MedicationInput) {
  // 1. Create or get active session
  const session = await getOrCreateSession(user_id);

  // 2. Add update to session
  await addSessionUpdate(session.id, {
    entity_type: 'medication',
    action: 'create',
    new_value: medication
  });

  // 3. When session closes (timeout or user clicks "Done")...
}

async function closeSession(sessionId: uuid) {
  const session = await getSession(sessionId);

  // 4. Generate progress note from session updates
  const progressNote = generateProgressNote(session.updates);

  // 5. Create shell_file (JUST the document, no metadata yet)
  const { data: shellFile } = await supabase
    .from('shell_files')
    .insert({
      file_type: 'progress_note',
      uploaded_by: session.user_id,
      content_markdown: progressNote.markdown,
      content_json: progressNote.json
    })
    .select()
    .single();

  // 6. Store metadata separately (CRITICAL!)
  await supabase
    .from('shell_file_metadata')
    .insert({
      shell_file_id: shellFile.id,
      source_type: 'manual_ui',
      manual_created_by: determineCreatorRole(session.user_id), // 'user' | 'provider' | 'other_user'
      session_id: sessionId
    });

  // 7. Enqueue for Pass 0.5 processing
  await enqueueJobV3({
    shell_file_id: shellFile.id,
    job_type: 'pass_05_encounter_discovery'
  });
}
```

**Reconciler (File 12 - Pass 0.5):**
```typescript
async function reconcilePendingEncountersV2(
  sessionId: string,
  shellFileId: string,
  totalPages: number
): Promise<EncounterMetadata[]> {

  // FETCH METADATA (hard-wired code, not AI)
  const { data: metadata } = await supabase
    .from('shell_file_metadata')
    .select('manual_created_by, api_source_name, source_type')
    .eq('shell_file_id', shellFileId)
    .maybeSingle();

  // Fetch shell_file info
  const { data: shellFile } = await supabase
    .from('shell_files')
    .select('uploaded_by, file_type')
    .eq('id', shellFileId)
    .single();

  // Fetch pending encounters (from AI processing)
  const { data: pendings } = await supabase
    .from('pass05_pending_encounters')
    .select('*')
    .eq('session_id', sessionId);

  // Group by cascade_id
  const cascadeGroups = groupBy(pendings, p => p.cascade_id);

  for (const [cascadeId, groupPendings] of cascadeGroups) {
    // Calculate quality tier from metadata
    const qualityTier = calculateQualityTier({
      manual_created_by: metadata?.manual_created_by,
      api_source_name: metadata?.api_source_name,
      source_type: metadata?.source_type
    });

    // INSERT WITH METADATA (copied from metadata table)
    await supabase.from('healthcare_encounters').insert({
      // Clinical data from AI
      patient_id: groupPendings[0].patient_id,
      encounter_type: groupPendings[0].encounter_type,

      // METADATA COPIED (not from AI!)
      encounter_source: 'shell_file',
      source_shell_file_id: shellFileId,
      manual_created_by: metadata?.manual_created_by || null,
      created_by_user_id: shellFile.uploaded_by,
      api_source_name: metadata?.api_source_name || null,
      data_quality_tier: qualityTier
    });
  }
}
```

### 1.5 Quality Tier Calculation (Hard-Wired Code)

```typescript
function calculateQualityTier(metadata: ShellFileMetadata): QualityTier {
  // For uploaded medical documents (no metadata)
  if (!metadata || metadata.source_type === 'uploaded') {
    // AI analyzes document content for A/B/C criteria
    // This is existing Pass 0.5 logic (unchanged)
    return calculateFromABCCriteria(encounter);
  }

  // For progress notes from manual UI
  if (metadata.source_type === 'manual_ui') {
    if (metadata.manual_created_by === 'provider') {
      return 'VERIFIED';  // Provider attestation = Criteria C
    } else if (metadata.manual_created_by === 'user') {
      return 'MEDIUM';    // User self-report (no Criteria C)
    } else {
      return 'LOW';       // Other user (untrusted)
    }
  }

  // For AI chat sessions
  if (metadata.source_type === 'ai_chat') {
    // Same rules as manual_ui
    return metadata.manual_created_by === 'provider' ? 'VERIFIED' : 'MEDIUM';
  }

  // For voice recordings
  if (metadata.source_type === 'voice') {
    return 'MEDIUM';      // Requires provider review
  }

  // For API imports
  if (metadata.source_type === 'api_import') {
    const apiReputation = {
      'medicare_australia': 'HIGH',
      'my_health_record': 'HIGH',
      'fitbit_api': 'MEDIUM'
    };
    return apiReputation[metadata.api_source_name] || 'MEDIUM';
  }

  return 'LOW'; // Default fallback
}
```

### 1.6 Key Takeaways

**The metadata never touches the AI:**
- AI extracts clinical data (names, dates, medications)
- Hard-wired code tracks source metadata separately
- Reconciler combines clinical data + metadata = final encounter

**File 13 responsibilities:**
1. Create shell_files from various sources
2. Store metadata in shell_file_metadata table
3. Enqueue shell_file for Pass 0.5 processing

**Pass 0.5 responsibilities (File 12):**
1. Process shell_files (AI extracts clinical data)
2. Fetch metadata from shell_file_metadata table
3. Copy metadata to final encounters
4. Calculate quality tiers from metadata

**Separation of concerns:**
- **File 13 = Upstream (shell_file creation)**
- **File 12 = Pipeline (shell_file processing)**

---

## 2. AI Chat Session Architecture

### 2.1 Session Outcome Categories

**Not all AI chat sessions result in health data changes.** Three outcome types:

#### Type 1: Actionable Sessions
AI chat leads to explicit health data changes (new medication, allergy confirmation, etc.)

**Outcome:**
- Progress note generated (both Markdown + JSON)
- Progress note becomes shell_file
- Flows through Pass 0.5/1/2 pipeline
- Creates manual encounter(s) with clinical entities

**Example:**
```
User: "I started taking Metformin 500mg yesterday"
AI: "I'll record that. Let me confirm..."
→ Progress note created
→ shell_file created with subtype='progress_note'
→ Processed through pipeline
→ Manual encounter created with medication entity
```

#### Type 2: Information-Gathering Sessions
User asks questions, AI provides information, no data changes requested.

**Outcome:**
- Chat transcript stored for user reference
- NO progress note generated
- NO health data created
- Conversation history maintained

**Example:**
```
User: "What are the side effects of Metformin?"
AI: "Common side effects include..."
→ Conversation stored in chat_history table
→ No clinical data impact
```

#### Type 3: Exploratory Sessions
User browsing their data, asking "what medications am I on?", reviewing history.

**Outcome:**
- Chat transcript stored for user reference
- NO progress note generated
- Read-only data access
- Audit trail of data views

**Example:**
```
User: "Show me all my medications from 2023"
AI: [displays list]
→ Conversation stored
→ Audit log: CLINICAL_DATA_VIEW event
→ No data changes
```

### 2.2 Session Classification Logic

**How to determine session type:**

```typescript
interface AIChatSession {
  session_id: string;
  user_id: uuid;
  started_at: timestamp;
  ended_at: timestamp;

  // Classification
  session_type: 'actionable' | 'information' | 'exploratory';
  resulted_in_data_change: boolean;
  progress_note_generated: boolean;

  // If actionable:
  progress_note_id?: uuid;          // Links to shell_files
  manual_encounter_ids?: uuid[];    // Created encounters
  entities_created?: number;
  entities_updated?: number;
}
```

**Classification Rules:**
- If user explicitly adds/updates/confirms clinical data → `actionable`
- If user asks questions without data changes → `information`
- If user reviews existing data without changes → `exploratory`

### 2.3 Progress Note Generation from AI Sessions

**Only for Type 1 (Actionable) sessions:**

```typescript
interface AISessionProgressNote {
  // Standard progress note fields
  shell_file_id: uuid;
  file_type: 'progress_note';
  subtype: 'ai_assisted';

  // AI session context
  ai_session_id: uuid;
  conversation_turns: number;

  // Content (dual format)
  content_markdown: string;         // Human-readable
  content_json: {                   // Machine-readable
    chief_complaint: string;
    assessment: string[];
    plan: {
      medications?: Array<{action, drug, dose}>;
      allergies?: Array<{action, allergen}>;
      conditions?: Array<{action, diagnosis}>;
    };
  };

  // Metadata
  created_by_user_id: uuid;
  created_at: timestamp;
  ai_model_version: string;
}
```

**Example Generated Progress Note:**
```markdown
# Patient-Initiated Update - AI Assisted
Date: November 18, 2024
Created by: Patient (John Smith)
AI Session: sess_abc123

## Updates Requested

**New Medication Started**
- Medication: Metformin 500mg
- Dosage: 500mg twice daily with meals
- Started: November 17, 2024
- Reason: Type 2 Diabetes management

## Assessment

Patient reports starting new diabetes medication as prescribed by Dr. Johnson at Melbourne Medical Centre on Nov 17, 2024.

## Plan

- Record new medication: Metformin 500mg BID
- Flag for provider review at next visit
- Monitor blood glucose levels

---
*This progress note was generated from AI-assisted patient input and requires provider verification.*
```

---

## 3. Progress Note Lifecycle Management

### 3.1 Creation Pathways

**Four ways progress notes are created:**

1. **AI Chat Session** (Type 1 Actionable)
   - User updates data via AI chat
   - Progress note auto-generated
   - Becomes shell_file for pipeline processing

2. **Manual Provider Entry**
   - Provider creates note during/after visit
   - Professional documentation
   - Higher quality tier (VERIFIED possible)

3. **Voice Recording Transcript**
   - User records visit conversation
   - Transcript processed → structured progress note
   - Flows through pipeline

4. **Batch Manual Updates**
   - User makes multiple edits in session window
   - Session-based batching creates single note
   - Documents all changes together

### 3.2 Editing vs Creating New Notes

**User's Key Question:** Should edits create new progress notes or modify existing?

**Answer: Depends on creator and time window**

#### Provider-Created Notes
- **Within 24 hours:** Direct edit allowed (append-only audit trail)
- **After 24 hours:** New correcting note required (references original)
- **Never:** Hard delete (preserve medical record integrity)

#### Patient-Created Notes
- **Any time:** Can request deletion (subject to cascade rules)
- **Preferred:** Duplicate → edit → delete original
- **Alternative:** Create new correcting note

**Example Edit Workflow:**
```typescript
// Provider edit within 24 hours
async function editProgressNote(noteId: uuid, changes: object) {
  if (creatorRole === 'provider' && ageHours < 24) {
    // Direct edit with audit trail
    await appendAuditEntry(noteId, changes);
    await updateNoteContent(noteId, changes);
  } else {
    // Create correcting note
    const newNote = await createCorrectingNote(noteId, changes);
    await linkNotes(originalId: noteId, correctingId: newNote.id);
  }
}
```

### 3.3 Deletion Policies

**CRITICAL CONCERN:** Deleting progress note could cascade delete clinical entities

**User's Question:** "Can deleting a progress note cascade delete medications/allergies?"

**Answer: Configurable with safety defaults**

#### Safety Levels

**Level 1: Soft Delete Only (Safest)**
- Progress note marked `deleted_at`
- Clinical entities remain active
- Encounter remains visible
- Audit trail preserved

**Level 2: Orphan Entities**
- Progress note deleted
- Clinical entities become orphaned (encounter_id = NULL)
- Entities still visible, just no source encounter
- User can re-associate or delete separately

**Level 3: Full Cascade (Dangerous)**
- Progress note deleted
- Linked encounter deleted
- Clinical entities deleted
- Only allowed for patient-created, unverified data

**Default Policy:**
```sql
-- Provider-created notes: Level 1 only (soft delete)
-- Patient-created notes: Level 2 (orphan entities)
-- AI-generated notes: Level 3 allowed (cascade delete)

CREATE TABLE progress_note_deletion_log (
  deletion_id uuid PRIMARY KEY,
  progress_note_id uuid REFERENCES shell_files(id),
  deleted_by_user_id uuid,
  deletion_level integer,              -- 1, 2, or 3
  entities_affected integer,
  encounters_affected integer,
  cascade_prevented boolean,
  deleted_at timestamptz
);
```

---

## 4. Voice Recording Integration

### 4.1 Voice Recording as Input Type

**User records conversations with providers during visits**

**Workflow:**
1. User uploads voice recording (audio file)
2. Transcription service converts to text
3. AI processes transcript → structured progress note
4. Progress note becomes shell_file
5. Flows through Pass 0.5/1/2 pipeline

### 4.2 Voice Recording Schema

```sql
CREATE TABLE voice_recordings (
  recording_id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  uploaded_at timestamptz,

  -- Audio file
  storage_path text,                    -- Supabase Storage path
  duration_seconds integer,
  file_size_bytes bigint,
  audio_format varchar(10),             -- 'mp3', 'wav', 'm4a'

  -- Transcription
  transcription_status varchar(20),     -- 'pending', 'completed', 'failed'
  transcription_service varchar(50),    -- 'openai_whisper', 'google_speech'
  transcript_text text,
  transcription_confidence numeric,

  -- Progress note generation
  progress_note_generated boolean,
  progress_note_id uuid REFERENCES shell_files(id),

  -- Context
  visit_date date,
  provider_name text,
  facility_name text
);
```

### 4.3 Transcript to Progress Note

**AI Processing Steps:**

1. **Speaker Diarization:** Identify provider vs patient speech
2. **Clinical Entity Extraction:** Find medications, allergies, diagnoses
3. **Structured Note Generation:** Convert to progress note format
4. **Confidence Scoring:** Flag low-confidence sections for review

**Example:**
```typescript
// Input: Voice recording transcript
const transcript = `
Provider: "So we're going to start you on Metformin 500mg twice daily"
Patient: "Okay, with meals?"
Provider: "Yes, with breakfast and dinner. Also, I see you're allergic to penicillin?"
Patient: "Yes, I get hives"
`;

// Output: Structured progress note
const progressNote = {
  chief_complaint: "Type 2 Diabetes management",
  assessment: [
    "New diagnosis: Type 2 Diabetes Mellitus",
    "Known allergy: Penicillin (hives reaction)"
  ],
  plan: {
    medications: [{
      action: 'start',
      drug: 'Metformin',
      dose: '500mg',
      frequency: 'twice daily with meals',
      instructions: 'Take with breakfast and dinner'
    }],
    allergies: [{
      action: 'confirm',
      allergen: 'Penicillin',
      reaction: 'hives'
    }]
  },
  provider_name: 'Dr. [Name from context]',
  visit_date: '[Date from context]'
};
```

---

## 5. Progress-Note-First Pipeline

### 5.1 Architectural Shift

**User + Second Opinion AI Insight:** Everything should become a document

**Current Strategy A:** Document → Pass 0.5 → entities
**Future Vision:** Update → Progress Note → Pass 0.5 → entities

### 5.2 Unified Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    ALL INPUT SOURCES                         │
├─────────────┬──────────────┬──────────────┬─────────────────┤
│ Scanned     │ AI Chat      │ Manual Edit  │ Voice           │
│ Documents   │ Session      │ Session      │ Recording       │
└─────┬───────┴──────┬───────┴──────┬───────┴────┬────────────┘
      │              │              │             │
      └──────────────┴──────────────┴─────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  shell_file created    │
            │  (all become documents)│
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │   Pass 0.5 Processing  │
            │   (encounters)         │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │   Pass 1 Processing    │
            │   (entity detection)   │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │   Pass 2 Processing    │
            │   (clinical extract)   │
            └────────────┬───────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Clinical Entities     │
            │  (medications, etc.)   │
            └────────────────────────┘
```

### 5.3 Progress Note as shell_file Subtype

```sql
ALTER TABLE shell_files ADD COLUMN
  subtype varchar(50);  -- 'scanned_document', 'progress_note', 'voice_transcript', 'api_import'

-- Progress note specific fields
ALTER TABLE shell_files ADD COLUMN
  source_session_id uuid,          -- AI chat session or manual edit session
  source_recording_id uuid,        -- Voice recording if applicable
  content_format varchar(20),      -- 'markdown', 'json', 'hybrid'
  content_markdown text,           -- Human-readable format
  content_json jsonb;              -- Machine-readable format
```

### 5.4 Dual-Format Content

**All progress notes stored in TWO formats:**

1. **Markdown** - Human-readable, display in UI
2. **JSON** - Machine-readable, easy for AI to parse

**Example:**
```typescript
const progressNote = {
  content_markdown: `
# Visit Summary
Date: Nov 18, 2024
Provider: Dr. Johnson

## New Medications
- Metformin 500mg twice daily with meals
  `,

  content_json: {
    visit_date: '2024-11-18',
    provider: 'Dr. Johnson',
    medications: [{
      action: 'start',
      drug: 'Metformin',
      dose: '500mg',
      frequency: 'BID',
      instructions: 'with meals'
    }]
  }
};
```

**Benefits:**
- Markdown: Easy for patients/providers to read
- JSON: Easy for Pass 0.5/1 to parse (no complex OCR/Vision needed)
- Consistency: Same structure regardless of input source

---

## 6. Session-Based Update Batching

### 6.1 Time Window Batching

**Problem:** User makes 5 medication updates in 10 minutes → should create 1 encounter, not 5

**Solution:** Session-based batching with configurable time window

```typescript
interface ManualUpdateSession {
  session_id: uuid;
  user_id: uuid;
  started_at: timestamp;
  last_activity_at: timestamp;

  // Session window config
  max_idle_minutes: number;         // Default: 15 minutes
  auto_close_after: number;         // Default: 2 hours

  // Updates collected
  updates: Array<{
    timestamp: timestamp;
    entity_type: 'medication' | 'allergy' | 'condition';
    action: 'create' | 'update' | 'confirm' | 'discontinue';
    entity_id?: uuid;
    previous_value?: any;
    new_value: any;
  }>;

  // Completion
  closed_at?: timestamp;
  progress_note_id?: uuid;
  encounter_id?: uuid;
}
```

### 6.2 Session Lifecycle

**States:**
1. **Active** - User making updates, window open
2. **Idle** - No updates for N minutes, but session not closed
3. **Closed** - Session finalized, progress note generated

**Trigger Points:**
- User explicitly clicks "Done" → close immediately
- Idle timeout (15 min default) → auto-close
- Max session time (2 hours) → force close
- User logs out → auto-close active session

### 6.3 Session to Progress Note

**When session closes:**

```typescript
async function closeManualUpdateSession(sessionId: uuid) {
  const session = await getSession(sessionId);

  // 1. Generate progress note from session updates
  const progressNote = {
    content_markdown: formatSessionAsMarkdown(session.updates),
    content_json: formatSessionAsJSON(session.updates),
    source_session_id: sessionId,
    created_by_user_id: session.user_id
  };

  // 2. Create shell_file
  const shellFile = await createShellFile({
    file_type: 'progress_note',
    subtype: 'manual_update_session',
    content_markdown: progressNote.content_markdown,
    content_json: progressNote.content_json,
    uploaded_by: session.user_id
  });

  // 3. Enqueue for Pass 0.5 processing
  await enqueueJobV3({
    shell_file_id: shellFile.id,
    job_type: 'pass_05_encounter_discovery'
  });

  // 4. Update session record
  await updateSession(sessionId, {
    closed_at: now(),
    progress_note_id: shellFile.id
  });
}
```

---

## 7. Governance and Security Policies

### 7.1 Provider Edit Window

**24-Hour Grace Period for Providers:**

```typescript
interface ProviderEditPolicy {
  // Within 24 hours: Direct edit allowed
  grace_period_hours: 24;

  // After 24 hours: New correcting note required
  require_correcting_note_after: 24;

  // Never allowed: Hard delete
  allow_hard_delete: false;

  // Always required: Audit trail
  append_only_audit: true;
}
```

**Implementation:**
```sql
CREATE TABLE progress_note_edits (
  edit_id uuid PRIMARY KEY,
  progress_note_id uuid REFERENCES shell_files(id),
  edited_by_user_id uuid,
  edit_timestamp timestamptz,

  -- What changed
  field_changed text,
  previous_value text,
  new_value text,

  -- Edit metadata
  edit_reason text,
  within_grace_period boolean,
  hours_since_creation numeric
);

-- Check if edit allowed
CREATE FUNCTION can_edit_progress_note(
  note_id uuid,
  editor_id uuid
) RETURNS boolean AS $$
DECLARE
  note_age_hours numeric;
  creator_role text;
BEGIN
  SELECT
    EXTRACT(EPOCH FROM (now() - created_at)) / 3600,
    creator_role
  INTO note_age_hours, creator_role
  FROM shell_files sf
  JOIN user_profiles up ON sf.uploaded_by = up.user_id
  WHERE sf.id = note_id;

  -- Providers: 24-hour window
  IF creator_role = 'provider' THEN
    RETURN note_age_hours < 24;
  END IF;

  -- Patients: any time (but separate deletion rules)
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

### 7.2 Patient Deletion Privileges

**Users can delete their own patient-created notes:**

```typescript
interface PatientDeletionPolicy {
  // Who can delete
  can_delete_own_notes: true;
  can_delete_provider_notes: false;

  // Deletion level (see Section 2.3)
  default_deletion_level: 2;         // Orphan entities (safe)
  allow_cascade_delete: true;        // For AI-generated only

  // Confirmation required
  require_confirmation: true;
  show_impact_warning: true;         // "This will affect X medications"
}
```

**UI Confirmation:**
```typescript
function confirmProgressNoteDeletion(noteId: uuid) {
  const impact = await analyzeNoteImpact(noteId);

  showConfirmation({
    title: 'Delete Progress Note?',
    message: `
      This progress note contains:
      - ${impact.medications} medications
      - ${impact.allergies} allergies
      - ${impact.conditions} conditions

      Deleting this note will:
      - Remove the progress note from your timeline
      - Orphan ${impact.total_entities} clinical entities
      - These entities will remain visible but have no source encounter

      You can delete orphaned entities separately if needed.
    `,
    actions: ['Cancel', 'Delete Note Only', 'Delete Note + Entities']
  });
}
```

### 7.3 Cascade Prevention Rules

**Default: Prevent dangerous cascades**

```sql
-- Block cascade delete for provider-created notes
CREATE TRIGGER prevent_provider_note_cascade
BEFORE DELETE ON shell_files
FOR EACH ROW
WHEN (OLD.subtype = 'progress_note' AND OLD.creator_role = 'provider')
EXECUTE FUNCTION block_cascade_deletion();

-- Allow cascade for AI-generated notes only
CREATE TRIGGER allow_ai_note_cascade
BEFORE DELETE ON shell_files
FOR EACH ROW
WHEN (OLD.subtype = 'progress_note' AND OLD.source_session_id IS NOT NULL)
EXECUTE FUNCTION orphan_or_cascade_entities();
```

---

## 8. Cascade Deletion Behavior

### 8.1 Entity Orphaning Strategy

**When progress note deleted without cascade:**

```sql
-- Mark entities as orphaned (encounter_id = NULL)
CREATE FUNCTION orphan_entities_on_note_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Find encounter created from this progress note
  UPDATE healthcare_encounters
  SET
    source_encounter_id = NULL,
    orphaned_at = now(),
    orphan_reason = 'source_progress_note_deleted'
  WHERE source_shell_file_id = OLD.id;

  -- Log orphaning event
  INSERT INTO entity_orphaning_log (
    shell_file_id,
    encounter_id,
    entities_orphaned,
    orphaned_at,
    orphaned_by_user_id
  ) VALUES (
    OLD.id,
    encounter_id,
    (SELECT count(*) FROM clinical_entities WHERE encounter_id = encounter_id),
    now(),
    current_user_id()
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
```

### 8.2 Re-Association Workflow

**User can re-associate orphaned entities:**

```typescript
interface OrphanedEntity {
  entity_id: uuid;
  entity_type: 'medication' | 'allergy' | 'condition';
  orphaned_at: timestamp;
  orphan_reason: string;

  // Potential matches
  suggested_encounters: Array<{
    encounter_id: uuid;
    match_confidence: number;
    encounter_date: date;
    provider_name: string;
  }>;
}

async function reAssociateOrphanedEntity(
  entityId: uuid,
  newEncounterId: uuid
) {
  // Move entity to new encounter
  await supabase
    .from('clinical_entities')
    .update({
      encounter_id: newEncounterId,
      orphaned_at: null,
      re_associated_at: new Date()
    })
    .eq('id', entityId);

  // Log re-association
  await logAuditEvent({
    event_type: 'ENTITY_REASSOCIATED',
    entity_id: entityId,
    new_encounter_id: newEncounterId
  });
}
```

---

## 9. Database Schema Extensions

### 9.1 shell_file_metadata Table

See Section 1.3 for complete definition.

### 9.2 AI Chat Sessions Table

```sql
CREATE TABLE ai_chat_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),

  -- Session lifecycle
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  last_activity_at timestamptz,

  -- Classification
  session_type varchar(20) CHECK (session_type IN ('actionable', 'information', 'exploratory')),
  resulted_in_data_change boolean DEFAULT false,

  -- Outcomes
  progress_note_generated boolean DEFAULT false,
  progress_note_id uuid REFERENCES shell_files(id),

  -- Metrics
  conversation_turns integer,
  entities_created integer DEFAULT 0,
  entities_updated integer DEFAULT 0,

  -- AI model tracking
  ai_model_version varchar(50),
  total_tokens_used integer
);

CREATE INDEX idx_ai_sessions_user ON ai_chat_sessions(user_id);
CREATE INDEX idx_ai_sessions_type ON ai_chat_sessions(session_type);
```

### 9.3 Manual Update Sessions Table

```sql
CREATE TABLE manual_update_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),

  -- Session window
  started_at timestamptz DEFAULT now(),
  last_activity_at timestamptz DEFAULT now(),
  closed_at timestamptz,

  -- Configuration
  max_idle_minutes integer DEFAULT 15,
  auto_close_after_hours integer DEFAULT 2,

  -- Session state
  status varchar(20) CHECK (status IN ('active', 'idle', 'closed')),

  -- Updates tracking
  updates_count integer DEFAULT 0,

  -- Outcome
  progress_note_id uuid REFERENCES shell_files(id),
  encounter_id uuid REFERENCES healthcare_encounters(id)
);

CREATE INDEX idx_manual_sessions_user ON manual_update_sessions(user_id);
CREATE INDEX idx_manual_sessions_status ON manual_update_sessions(status);
```

### 9.4 Session Updates Table

```sql
CREATE TABLE session_updates (
  update_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES manual_update_sessions(session_id),

  -- Update details
  timestamp timestamptz DEFAULT now(),
  entity_type varchar(50) NOT NULL,
  action varchar(20) CHECK (action IN ('create', 'update', 'confirm', 'discontinue')),

  -- Entity reference
  entity_id uuid,

  -- Change tracking
  previous_value jsonb,
  new_value jsonb,

  -- Metadata
  user_id uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_session_updates_session ON session_updates(session_id);
CREATE INDEX idx_session_updates_timestamp ON session_updates(timestamp);
```

### 9.5 Progress Note Deletion Log

```sql
CREATE TABLE progress_note_deletion_log (
  deletion_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was deleted
  progress_note_id uuid NOT NULL,
  shell_file_id uuid REFERENCES shell_files(id) ON DELETE SET NULL,

  -- Who and when
  deleted_by_user_id uuid REFERENCES auth.users(id),
  deleted_at timestamptz DEFAULT now(),

  -- Deletion level (see Section 2.3)
  deletion_level integer CHECK (deletion_level IN (1, 2, 3)),

  -- Impact
  entities_affected integer,
  encounters_affected integer,
  cascade_prevented boolean DEFAULT false,

  -- Reason
  deletion_reason text,

  -- Snapshot (for recovery)
  note_content_snapshot jsonb
);

CREATE INDEX idx_deletion_log_user ON progress_note_deletion_log(deleted_by_user_id);
CREATE INDEX idx_deletion_log_timestamp ON progress_note_deletion_log(deleted_at);
```

### 9.6 Entity Orphaning Log

```sql
CREATE TABLE entity_orphaning_log (
  orphaning_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  shell_file_id uuid,
  encounter_id uuid,

  -- Impact
  entities_orphaned integer,

  -- Tracking
  orphaned_at timestamptz DEFAULT now(),
  orphaned_by_user_id uuid REFERENCES auth.users(id),
  orphan_reason varchar(100),

  -- Re-association tracking
  re_associated_at timestamptz,
  re_associated_to_encounter_id uuid REFERENCES healthcare_encounters(id)
);

CREATE INDEX idx_orphaning_log_encounter ON entity_orphaning_log(encounter_id);
CREATE INDEX idx_orphaning_log_timestamp ON entity_orphaning_log(orphaned_at);
```

---

## Appendix A: Strategy A Exclusions

**These features are explicitly OUT OF SCOPE for Strategy A Pass 0.5:**

1. AI chat session integration
2. Session-based progress note generation
3. Voice recording transcript processing
4. Complex edit window enforcement
5. Cascade deletion policies
6. Progress-note-first pipeline architecture
7. Dual-format (Markdown + JSON) content storage
8. Entity orphaning and re-association
9. Session-based update batching
10. Provider 24-hour edit window

**What IS in Strategy A:**
- Basic `encounter_source` field ('shell_file', 'manual', 'api')
- Minimal manual encounter creation capability
- Simple quality tier assignment
- Basic manual encounter schema

**Reference:** See `12-ENCOUNTER-SOURCES-V2.md` for actual Strategy A scope.

---

## Appendix B: Implementation Priority

**If/when these features are implemented, suggested priority order:**

**Phase 1: Foundation**
1. Session-based update batching (highest value, enables rest)
2. Progress note generation from manual updates
3. Basic edit policies (24-hour provider window)

**Phase 2: AI Integration**
4. AI chat session classification
5. Actionable session → progress note workflow
6. Progress-note-first pipeline (shell_file subtype)

**Phase 3: Advanced Features**
7. Voice recording integration
8. Dual-format content (Markdown + JSON)
9. Entity orphaning and re-association

**Phase 4: Governance**
10. Complex cascade deletion policies
11. Advanced edit workflows (duplicate-edit-delete)
12. Provider verification through progress notes

---

## Appendix C: Key Architectural Decision

### The Central Innovation: Metadata Separation

**File 13's most important design decision:**

Store source metadata (manual_created_by, api_source_name, etc.) in a **separate table** (`shell_file_metadata`), NOT on the shell_files table itself.

**Why this matters:**
1. **Keeps shell_files table clean** - Only document content, not tracking metadata
2. **AI never sees metadata** - Clinical extraction remains pure
3. **Easy to extend** - Add new metadata types without touching shell_files schema
4. **Clear separation** - File 13 features (upstream) vs Pass 0.5 (pipeline) vs File 12 (reconciler)

**The flow:**
```
File 13 creates:
  - shell_file (document only)
  - shell_file_metadata (origin tracking)

Pass 0.5 processes:
  - shell_file (AI extracts clinical data)

File 12 reconciler:
  - Fetches shell_file_metadata
  - Copies to healthcare_encounters
  - Calculates quality tiers
```

**This architecture allows:**
- Pass 0.5 pipeline to remain completely source-agnostic
- Future features (AI chat, voice, API) to add new metadata types without touching pipeline
- Clean separation between "what is the data" (shell_file) and "where did it come from" (metadata)

---

**Document Status:** Future Vision (not required for Strategy A Pass 0.5)
**Last Updated:** November 18, 2024
**Next Review:** After Strategy A Pass 0.5 implementation complete

**Related Documents:**
- `12-ENCOUNTER-SOURCES-V2.md` - Pass 0.5 pipeline readiness (REQUIRED for Strategy A)
- `11-DATA-QUALITY-SYSTEM.md` - Quality tier framework and A/B/C criteria
- `03-TABLE-DESIGN-V3.md` - Complete database schema
