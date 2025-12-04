# patient_unstructured_clinical_notes Bridge Schema (Source) - Pass 2

**Triage Status:** DONE
**Step A Decision:** NEW - Infrastructure/Orphan Handler table
**Step A Rationale:** Explicit orphan handler for clinical text that doesn't fit any other category. Preserves data rather than forcing into wrong categories.
**Step B Sync:** NEW TABLE - To be created via migration
**Step C Columns:** Complete - see Pass 2 AI Output Schema below
**Step D Temporal:** POINT-IN-TIME - Note extracted at document processing time
**Last Triage Update:** 2025-12-04
**Original Created:** 2025-12-04

---

## Table Purpose

Explicit orphan handler for clinical text that doesn't fit any defined spoke table category. Rather than force-fitting data into incorrect categories or losing valuable clinical information, this table preserves unstructured clinical content with minimal classification. This is the "other" catch-all designed to NEVER lose data.

**Key Principle:** Better to preserve unstructured than to misclassify or discard. This table is intentionally minimalist - it captures what we CAN'T confidently categorize.

---

## Pass 2 AI Output Schema

```typescript
interface Pass2UnstructuredClinicalNotesOutput {
  // REQUIRED - Source identification
  source_text_verbatim: string;         // Full verbatim text chunk

  // REQUIRED - Spatial reference
  y_anchor_start: number;
  y_anchor_end?: number;

  // REQUIRED - Content
  note_content: string;                 // The unstructured clinical text

  // OPTIONAL - Best-effort categorization
  note_type_hint?: 'progress_note' | 'consultation_note' | 'nursing_note' |
                   'discharge_summary' | 'referral' | 'correspondence' |
                   'miscellaneous' | 'unknown';

  // OPTIONAL - Why orphaned
  categorization_reason?: string;       // Why this couldn't be categorized elsewhere

  // OPTIONAL - Keywords for search
  extracted_keywords?: string[];        // Key terms for future retrieval
}
```

---

## Example Extractions

### Example 1: Mixed Progress Note Content
Document text: "Patient doing well overall. Family visited today. Will continue current management. Case discussed with Dr. Jones."

```json
{
  "source_text_verbatim": "Patient doing well overall. Family visited today. Will continue current management. Case discussed with Dr. Jones.",
  "y_anchor_start": 934,
  "note_content": "Patient doing well overall. Family visited today. Will continue current management. Case discussed with Dr. Jones.",
  "note_type_hint": "progress_note",
  "categorization_reason": "General progress commentary without specific clinical findings or actions to categorize",
  "extracted_keywords": ["progress", "family", "management", "consultation"]
}
```

### Example 2: Free-Text Impression
Document text: "Overall impression: Complex patient with multiple comorbidities requiring multidisciplinary approach."

```json
{
  "source_text_verbatim": "Overall impression: Complex patient with multiple comorbidities requiring multidisciplinary approach.",
  "y_anchor_start": 950,
  "note_content": "Complex patient with multiple comorbidities requiring multidisciplinary approach.",
  "note_type_hint": "consultation_note",
  "categorization_reason": "Summary impression without specific diagnoses, findings, or actionable data",
  "extracted_keywords": ["complex", "comorbidities", "multidisciplinary"]
}
```

### Example 3: Correspondence Fragment
Document text: "Thank you for your referral of this patient. I have reviewed the records you sent."

```json
{
  "source_text_verbatim": "Thank you for your referral of this patient. I have reviewed the records you sent.",
  "y_anchor_start": 966,
  "note_content": "Thank you for your referral of this patient. I have reviewed the records you sent.",
  "note_type_hint": "correspondence",
  "categorization_reason": "Administrative correspondence, not clinical data",
  "extracted_keywords": ["referral", "records"]
}
```

### Example 4: Unclear Clinical Note
Document text: "See attached. Previous workup reviewed. Will proceed as discussed."

```json
{
  "source_text_verbatim": "See attached. Previous workup reviewed. Will proceed as discussed.",
  "y_anchor_start": 982,
  "note_content": "See attached. Previous workup reviewed. Will proceed as discussed.",
  "note_type_hint": "unknown",
  "categorization_reason": "Vague reference without specific clinical content to categorize",
  "extracted_keywords": ["workup", "reviewed"]
}
```

### Example 5: Nursing Assessment Fragment
Document text: "Patient comfortable and resting. No acute distress. Family at bedside."

```json
{
  "source_text_verbatim": "Patient comfortable and resting. No acute distress. Family at bedside.",
  "y_anchor_start": 998,
  "note_content": "Patient comfortable and resting. No acute distress. Family at bedside.",
  "note_type_hint": "nursing_note",
  "categorization_reason": "General status observation without specific findings for physical_findings or symptoms tables",
  "extracted_keywords": ["comfortable", "resting", "no acute distress"]
}
```

---

## Note Type Hints Reference

| Type Hint | When to Use |
|-----------|-------------|
| `progress_note` | General progress updates, daily notes |
| `consultation_note` | Specialist consultation fragments |
| `nursing_note` | Nursing documentation |
| `discharge_summary` | Discharge-related text fragments |
| `referral` | Referral correspondence |
| `correspondence` | Letters, communications |
| `miscellaneous` | Known category but doesn't fit above |
| `unknown` | Cannot determine category |

---

## What Server Adds

| Field | Source |
|-------|--------|
| `id` | gen_random_uuid() |
| `patient_id` | From encounter context |
| `event_id` | From hub record just created |
| `verbatim_text_vertices` | Post-Pass 2 algorithm |
| `created_at` | NOW() |

---

## Database Schema (Target)

```sql
CREATE TABLE patient_unstructured_clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    patient_id UUID NOT NULL,

    -- Content
    note_content TEXT NOT NULL,

    -- Best-effort categorization
    note_type_hint TEXT CHECK (note_type_hint IN (
        'progress_note', 'consultation_note', 'nursing_note',
        'discharge_summary', 'referral', 'correspondence',
        'miscellaneous', 'unknown'
    )),

    -- Why orphaned
    categorization_reason TEXT,

    -- Keywords for search
    extracted_keywords TEXT[],

    -- Spatial
    y_anchor_start INTEGER NOT NULL,
    y_anchor_end INTEGER,
    verbatim_text_vertices JSONB,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fk_unstructured_notes_event FOREIGN KEY (event_id, patient_id)
        REFERENCES patient_clinical_events(id, patient_id) ON DELETE CASCADE
);
```

---

## When to Use This Table

**USE this table when:**
- Text doesn't fit any defined spoke category
- Content is too vague to confidently categorize
- Mixed content that would require arbitrary splitting
- Administrative/correspondence text that's still clinically relevant
- AI cannot confidently assign to a specific spoke

**DO NOT use this table when:**
- Content clearly fits another spoke (symptoms, conditions, etc.)
- Content is non-clinical (page headers, footers, etc.)
- Content is duplicate of already-extracted data

---

## Orphan Handler Philosophy

This table embodies a key principle: **Preserve over discard, humility over overconfidence.**

| Principle | Implementation |
|-----------|----------------|
| Never lose clinical data | Everything gets stored somewhere |
| Avoid misclassification | If unsure, use orphan handler |
| Enable future refinement | Keywords enable later categorization |
| Maintain audit trail | categorization_reason documents decision |

---

## Monitoring and Refinement

This table should be monitored to:
1. **Identify new categories:** High-volume note_type_hints may need dedicated spoke tables
2. **Refine AI prompts:** Common categorization_reasons suggest prompt improvements
3. **Validate extraction:** Low orphan rates indicate good spoke table coverage

**Target:** Less than 5% of clinical entities should land in orphan handler.

---

## Notes

- **Last resort table:** AI should attempt all other categories first
- **Keyword extraction:** Always extract keywords for searchability
- **Categorization reason:** Document WHY content couldn't be categorized - this feeds prompt refinement
- **No forcing:** Never force content into wrong spoke just to avoid orphan handler
- **Review queue:** High orphan volumes may warrant manual review

---

## Related Documentation

- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Table Architecture:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`
- **Pass 2 Master:** `PASS2-STRATEGY-A-MASTER.md`
