# **Data Lifecycle, Provenance & Metadata Strategy, as suggested by o3 AI model**

_Last updated: July 2025 by o3_

This document extends Guardian’s normalization architecture with detailed guidance on lifecycle handling, provenance tracking, rich metadata, and inter-entity relationships. It serves as the canonical reference for Phase-2 work on deduplication, data quality, and dashboard provenance features.

---

## **I. Lifecycle & “Superseded” Logic**

### 1 · Effective-Date Columns
Every clinical table gains two columns:

```sql
valid_from date NOT NULL DEFAULT document_date,
valid_to   date NULL  -- NULL ⇒ still active
```

A new document that contradicts a record sets the previous row’s `valid_to` to the new document’s date. The table itself now **is** the history; “active” views simply filter on `valid_to IS NULL`.

### 2 · Resolution Metadata
Add `resolution_reason text` (`resolved`, `ruled_out`, `med_discontinued`, `duplicate`, `error`, …). The normalization function sets this value whenever it retires a row.

### 3 · Supersession Log
Create a `supersession_log` table capturing each closure/replacement event for full auditability.

---

## **II. Full Provenance — Multiple Representations at a Click**

### 1 · `document_representations` Table
Tracks every representation produced by the pipeline.

```sql
CREATE TABLE document_representations (
    id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id          uuid NOT NULL REFERENCES documents(id),
    page_number          int,                         -- for multi-page PDFs
    representation_type  text,                        -- 'raw_image' | 'ocr_text' | 'ai_json' | 'normalized_json'
    storage_path         text NOT NULL,               -- e.g. S3 / Supabase path
    bbox                 int4range[]                  -- optional per-datum bounding boxes
);
```

### 2 · `clinical_fact_sources` Link Table
Associates any normalized row with one or more source snippets.

```sql
CREATE TABLE clinical_fact_sources (
    fact_table        text,   -- 'patient_conditions', 'patient_medications', …
    fact_id           uuid,
    representation_id uuid REFERENCES document_representations(id),
    snippet_bbox      int4range,  -- bounding box of the snippet
    context_text      text         -- cached nearby OCR text for display
);
```

### 3 · Bounding Boxes & Cropping
Extraction must return page + `(x1,y1,x2,y2)` for each field. The UI can request a crop endpoint (`/api/crop?rep_id=…&bbox=…`) to display inline snippets.

---

## **III. Rich Metadata Tagging Model**

*Add a JSONB `tags` column to every clinical table.* Example:

```json
{
  "category": "allergy",
  "severity": "severe",
  "source_auth_level": "provider_letter",
  "context": { "due_to": "menorrhagia" }
}
```

Create a GIST index on `tags` so the frontend can issue faceted queries (e.g., “all items where `tags->>'category' = 'allergy'`”).

---

## **IV. Inter-Entity Relationships (e.g., Medication ↔ Condition)**

```sql
CREATE TABLE medication_conditions (
    medication_id uuid REFERENCES patient_medications(id),
    condition_id  uuid REFERENCES patient_conditions(id),
    relationship  text,               -- 'treatment_for' | 'caused_by' | …
    PRIMARY KEY   (medication_id, condition_id)
);
```

Normalization logic:
1. Encounter indication in AI JSON (`"indication": "hypertension"`).
2. Ensure a condition row exists/updates.
3. Insert into the link table.

UI: clicking a medication lists linked conditions; clicking a condition lists treatments.

---

## **V. Front-End UX Hooks**

### 1 · “View Source” Modal
`GET /facts/:table/:id/provenance` →

```json
{
  "representations": [
    { "type": "raw_image",      "url": "…/full.pdf#page=3" },
    { "type": "snippet",         "url": "…/crop?bbox=…" },
    { "type": "ocr_text",        "text": "…" },
    { "type": "ai_json",         "json": { /* original JSON */ } },
    { "type": "normalized_json", "json": { /* cleaned JSON */ } }
  ]
}
```

### 2 · Active vs History Queries
*Active* → `WHERE valid_to IS NULL`  
*History* → `WHERE valid_to IS NOT NULL`

### 3 · Tag-Based Facets
Dashboard filters (severity, confidence, etc.) translate directly to JSONB tag queries.

---

## **VI. Pipeline Updates**

1. **Extraction** emits bounding boxes and context sentences.
2. **Normalization Edge Function** enhancements:
   * Implements effective-date & supersession logic.
   * Writes `document_representations` & `clinical_fact_sources`.
   * Populates link tables (e.g., `medication_conditions`).
3. **Materialized Views**: replace `status = 'active'` predicate with `valid_to IS NULL`.

---

## **VII. Requirement → Design Traceability**

| Requirement                       | Design Element                                          |
|-----------------------------------|---------------------------------------------------------|
| Historical fidelity               | `valid_from` / `valid_to`, supersession log             |
| Multiple representations          | `document_representations`, `clinical_fact_sources`     |
| Clickable provenance              | Bounding boxes & crop API                               |
| Rich metadata & flexible UI       | JSONB `tags` + GIST index                               |
| Relationship navigation           | Many-to-many link tables                                |
| Performance                       | Indexed FKs, materialized views, no JSON traversal      |

---

## **Next Steps as suggested by o3**

1. **Write migration scripts** for all new tables/columns.
2. **Upgrade edge functions** to handle supersession & provenance.
3. **Implement API endpoints** (`/facts/*`, crop service).
4. **Prototype UI** for history filtering and source-view modal. 

