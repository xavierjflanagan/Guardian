# Encounter Date System - Current Architecture

**Status:** Production (2025-11-23)
**Context:** How encounter_start_date and encounter_end_date work in Pass 0.5

---

## Core Principle

**AI extracts dates → Reconciler applies quality hierarchy → Database stores with provenance**

---

## Date Fields & Storage

### Database Schema (healthcare_encounters)

```sql
-- Date columns
encounter_start_date    TIMESTAMPTZ   -- When encounter began
encounter_end_date      TIMESTAMPTZ   -- When encounter ended (NULL for single-day)
date_source            TEXT NOT NULL  -- Provenance: 'ai_extracted' | 'file_metadata' | 'upload_date'
```

**Design Decision:** `date_source` represents **encounter_start_date provenance only**
- Why: Start date is the primary timeline anchor
- End dates are either AI-extracted (multi-day admissions) or NULL (single-day events)

---

## Two Encounter Types

### Real-World Visits
- **Dates:** Always from AI extraction (dates are IN the clinical document or it doesnt qualify as real world encounter)
- **Example:** "Hospital admission 2024-03-10 to 2024-03-15"
- **date_source:** `'ai_extracted'`

### Pseudo Encounters
- **Definition:** Administrative summaries that may not have a specific event date
- **Dates:** Waterfall fallback (AI → file metadata → upload date)
- **Example:** Patient Health Summary (compiled medical history)
- **date_source:** `'ai_extracted'` OR `'file_metadata'` OR `'upload_date'`

---

## Date Waterfall Hierarchy (Pseudo Encounters Only)

```typescript
// Tier 1: AI extracted (highest quality)
if (AI found date in document) {
  encounter_start_date = AI_date
  date_source = 'ai_extracted'
}
// Tier 2: File creation metadata
else if (shell_files.created_at exists) {
  encounter_start_date = file_created_at
  date_source = 'file_metadata'
}
// Tier 3: Upload timestamp (last resort)
else {
  encounter_start_date = current_date
  date_source = 'upload_date'
}

// Pseudo encounters: start = end (point-in-time observation)
encounter_end_date = encounter_start_date
```

**Why this hierarchy?**
- AI-extracted = best (date is actually in the document)
- File metadata = good fallback (when document was created)
- Upload date = last resort (when file was imported to system)

---

## Multi-Chunk Date Quality Merging

For encounters split across multiple chunks (large documents):

```typescript
// Example: 142-page hospital admission
// Chunk 1 (pages 1-50):   encounter_start_date = NULL
// Chunk 2 (pages 51-100):  encounter_start_date = "2024-03-10"
// Chunk 3 (pages 101-142): encounter_start_date = NULL

// Reconciler picks BEST quality date:
pickBestDateByQuality([
  { date: null, source: 'ai_extracted' },      // Chunk 1
  { date: '2024-03-10', source: 'ai_extracted' }, // Chunk 2 ← WINNER
  { date: null, source: 'ai_extracted' }       // Chunk 3
])

// Result: encounter_start_date = '2024-03-10'
```

**Quality ranking:** `ai_extracted` > `file_metadata` > `upload_date`

---

## is_real_world_visit Merging

Multi-chunk encounters use **"any true = all true"** logic:

```typescript
// Example: Medical summary that reveals a visit
// Chunk 1: is_real_world_visit = false (just demographics)
// Chunk 2: is_real_world_visit = true  (found "GP visit Dr. Jones 2024-01-15")

// Reconciler: ANY chunk says true → final = true
const isRealWorldVisit = groupPendings.some(p => p.is_real_world_visit)
// Result: true (it's a real visit)
```

**Why:** Multi-chunk documents may reveal clinical context gradually

---

## Key Implementation Files

### AI Extraction
- **Prompt:** `apps/render-worker/src/pass05/aiPrompts.v11.ts`
  - Lines 278-279: AI instructed to extract encounter_start_date, encounter_end_date
  - AI returns `is_real_world_visit` decision

### Chunk Processing
- **Parser:** `apps/render-worker/src/pass05/progressive/chunk-processor.ts`
  - Line 563: `encounter_start_date: enc.encounter_start_date`
  - Line 564: `encounter_end_date: enc.encounter_end_date`
  - Line 566: `date_source: enc.date_source || null`
  - Line 582: `is_real_world_visit: enc.is_real_world_visit` (trusts AI)

### Reconciliation
- **Merger:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`
  - Lines 53-70: `pickBestDateByQuality()` - quality hierarchy function
  - Lines 463-470: Merge `is_real_world_visit` (any true = all true)
  - Lines 483-495: Pick best dates from multi-chunk pendings
  - Lines 539-565: Date waterfall logic (real vs pseudo encounters)

### Session Management
- **Orchestrator:** `apps/render-worker/src/pass05/progressive/session-manager.ts`
  - Lines 142-154: Fetch `shell_files.created_at` for waterfall fallback
  - Line 161: Pass `fileCreatedAt` to reconciler

### Date Normalization
- **Format Handler:** `apps/render-worker/src/pass05/progressive/pending-reconciler.ts`
  - Lines 76-394: `normalizeDateToISO()` - handles DD/MM/YYYY vs MM/DD/YYYY
  - Converts all date formats to ISO 8601 (YYYY-MM-DD)

---

## Design Decisions - Why This Approach?

### 1. AI as Source of Truth for is_real_world_visit
**Decision:** Trust AI's classification, don't recalculate
**Why:** AI has full document context, worker sees fragments
**Exception:** Reconciler can upgrade false→true for multi-chunk encounters

### 2. Single date_source Column
**Decision:** One column for encounter_start_date provenance only
**Why:**
- End dates for real visits are always AI-extracted (in clinical docs)
- End dates for pseudo encounters = start_date (point-in-time)
- No need for separate tracking

### 3. Waterfall Only for Pseudo Encounters
**Decision:** Real visits always use AI dates, no fallback
**Why:** If it's a real clinical encounter, the date WILL be in the document
**Implication:** Real visits without dates → data quality issue, not a fallback case

### 4. Quality Hierarchy for Multi-Chunk
**Decision:** Prefer ai_extracted > file_metadata > upload_date
**Why:** Later chunks might find dates earlier chunks missed
**Example:** Demographics page (no date) → visit details page (has date)

---

## Edge Cases Handled

1. **Pseudo encounter with AI date:** Lab report shows "Collected 2024-05-15"
   - Uses AI date, `date_source: 'ai_extracted'`

2. **Pseudo encounter without AI date:** Medication list (no specific date)
   - Uses file_created_at, `date_source: 'file_metadata'`

3. **Multi-day hospital admission:** Admission 2024-03-10, Discharge 2024-03-15
   - Both dates from AI, `date_source: 'ai_extracted'`
   - encounter_end_date ≠ encounter_start_date

4. **Multi-chunk encounter with partial dates:**
   - Chunk 1: start=NULL, end=NULL
   - Chunk 2: start="2024-01-15", end=NULL
   - Final: start="2024-01-15", end=NULL
   - `date_source: 'ai_extracted'` (best quality found)

---

## Related Documentation

- **Date Format Handling:** `16-DATE-FORMAT-ARCHITECTURE.md` (DD/MM/YYYY normalization)
- **v2.9 Date Source Spec:** `apps/render-worker/src/pass05/_archive/prompt-versions-and-improvements/production/v2.9-current/`
- **Schema:** `shared/docs/architecture/database-foundation-v3/current_schema/03_clinical_core.sql`
