# Narrative Architecture – Draft Vision

Status: Draft for iteration (embeddings enabled) 
Author: GPT5
Date: 19 Sep 2025

## North Star

Enable rich, navigable clinical storytelling. A user can click any narrative and seamlessly explore: contributing clinical events (with source files and timestamps), related/sibling narratives, parent/child context, and a timeline view. Narratives evolve as new documents arrive, while preserving auditability and clinical safety.

## Core Concepts

- Narrative Unit: A cohesive clinical storyline segment (e.g., “Lisinopril dose optimization”, “Acute HF admission”).
- Relationship Graph: Narratives form a flexible graph (parent/child/sibling/related). No rigid fixed levels required; “Grand/Minor/Sub” can be expressed as views or tags when useful.
- Clinical Event Links: Narratives reference concrete clinical events (medications, conditions, procedures, labs, encounters) from the core tables. The events remain the factual source of truth.
- Summary + Embedding: Each narrative has a short, de‑identified summary/heading. We embed this summary for semantic discovery (narrative discovery stage) and shortlisting (vector search).
- Parallel Codes: Narrative discovery leverages universal and regional medical codes via the linked clinical events; codes are not stored on narratives themselves.

## Conceptual Data Model (broad strokes)

- Narratives:
  - Identity and ownership (patient/profile), type (condition/medication/event/procedure/monitoring), title, summary, content.
  - Temporal fields: valid_from, valid_to (active when NULL), last_event_effective_at (freshness), last_updated_at (system write time).
  - Role: direct | indirect | mixed (derived from presence of direct event links; used for Pass 3 routing).
  - Change detection: content_fingerprint_hash (re-embed/re-cache only when this changes).
  - Version markers and audit fields.
  - Display via existing three‑layer architecture: use a narratives_display cache per language/complexity (health‑data‑universality); core narratives remain the source of truth.

- Narrative Relationships (separate table):
  - Stored in dedicated narrative_relationships table.
  - Typed directed edges between narratives (contains, relates_to, caused_by, part_of).
  - Note: Siblings inferred from shared parents, not explicitly stored.
  - Relationship strength/relevance and optional context notes.

- Narrative–Event Links (separate tables):
  - Associations to clinical events stored in dedicated linking tables.
  - Existing tables: narrative_medication_links, narrative_condition_links, etc.
  - Generic fallback: narrative_event_links for any event type.

- Narrative Updates (Audit Trail):
  - Immutable history of narrative changes. Current vs prior versions can be derived without deleting past state.

### Separate Linking Tables Architecture

```sql
-- Narrative to narrative relationships
CREATE TABLE narrative_relationships (
  id UUID PRIMARY KEY,
  parent_narrative_id UUID REFERENCES clinical_narratives(id),
  child_narrative_id UUID REFERENCES clinical_narratives(id),
  relationship_type VARCHAR(50),
  relationship_strength DECIMAL(3,2),
  patient_id UUID NOT NULL,  -- For RLS
  created_at TIMESTAMP
);

-- Generic narrative to clinical event links
CREATE TABLE narrative_event_links (
  id UUID PRIMARY KEY,
  narrative_id UUID REFERENCES clinical_narratives(id),
  clinical_event_id UUID,
  event_table VARCHAR(50),  -- Which table the event is in
  patient_id UUID NOT NULL,  -- For RLS
  created_at TIMESTAMP
);

-- Existing specific linking tables (already in 03_clinical_core.sql)
-- narrative_medication_links, narrative_condition_links, etc.
```

Note: Implementation uses "graph on relational" (edge tables) for clean normalization, RLS support, and indexed joins.

## Processing & Pipelines (Pass 2 → Pass 3)

1) Pass 2 produces enhanced clinical events (deduped, coded, dated, attributed).
2) Step 2.5: Narrative Discovery (two engines in parallel):
   - Deterministic: Match via medical codes and event metadata for obvious fits.
   - Semantic: Embed new event(s) text and shortlist relevant narratives via vector search over narrative short summaries/headings.
3) Pass 3 (single call, three phases inside one prompt for coherence):
   - Phase 1 – Direct narratives:
     - Always update deterministically matched narratives (duplicates may change `valid_to`).
     - If no deterministic match exists, create a new direct narrative (idempotent).
     - Include active parents (`valid_to IS NULL`) for context only; hard-cap top‑k parents and depth.
   - Phase 2 – Relationship hints:
     - From Phase 1 outputs, propose parent/child links with confidence and reasons.
     - Siblings are automatically inferred from shared parents (not AI-assigned).
     - Keep suggestions bounded (top‑k) to control context and cost.
   - Phase 3 – Indirect narratives:
     - Consider shortlisted indirect candidates (from discovery + Phase 2 hints).
     - Update/create indirect narratives as needed; keep work bounded and idempotent.
   - Output: Minimal context back to storage: narrative selection, updated relationships, updated summary/content.
   - Guardrails (MVP):
     - Parent propagation: only where `valid_to IS NULL`; cap parents (e.g., 5) and depth (e.g., 2).
     - Bound per‑job work: cap number of narrative updates/creations; re‑queue overflow.
     - Idempotency: stable keys per narrative update using content fingerprints; safe retries.
     - Re‑embed only when `content_fingerprint_hash` changes.
     - Keep context lean: titles, summaries, key timeline points; avoid bulk content.
4) Storage & Audit:
   - Append narrative updates (audit); refresh “current” markers; maintain relationships and event links.

### Pass 2 → Pass 3 Handoff: Deterministic Signals (payload-only)

- Purpose: Lightweight metadata hints that Pass 2 generates while processing clinical events.
- What Pass 2 can realistically provide:
  - **canonical_identity_key**: From medical code resolution (e.g., "rxnorm_314076_lisinopril_10mg")
  - **code_signature**: From parallel code assignment (e.g., "rxnorm:314076|pbs:2345")
  - **temporal_bucket**: Simple date parsing (e.g., "2025-09")
  - **encounter_key**: IF extractable from document text (often missing)
  - **change_hint**: IF detectable from context (e.g., "dose_increase")

Note: Not all signals will be present for all events. Pass 3 handles missing signals gracefully. Duplicate detection relies on matching medical codes and identity keys.

These signals travel in the Pass 2 → Pass 3 payload only and can later be persisted in an audit table if needed.

## Discovery & Matching

- Deterministic: Uses codes (universal + regional) and event types to group and route updates with explainability.
- Semantic (Embeddings): Narrative summary embeddings enable semantic retrieval for nuanced matches. Particularly useful for the indirect overarching 'master' or 'grand-parent' narratives. Restrict vector search by patient; keep summaries de‑identified.
- Ranking: Combine deterministic signals (code overlap, recency) with semantic similarity; define deterministic tiebreakers.

### Event‑type identity and reopen policy

- Identity (preferred): Use source encounter identifiers when available (encounter_id/visit number/MRN + facility + encounter type).
- Identity (fallback): Deterministic key from facility/location + clinician + overlapping date range + encounter type.
- Reopen policy: Event narratives with `valid_to` may be reopened if late‑arriving events extend or clarify the window.
- Grace period: Optional time window after `valid_to` during which propagation still considers the narrative.

## Versioning & Immutability (Healthcare Requirements)

- **INSERT-only pattern**: Never UPDATE narrative rows, only INSERT new versions.
- **Timestamp-based ordering**: Use created_at for natural version ordering (not error-prone version numbers).
- **Current flag as source of truth**: is_current BOOLEAN determines active version.
- **Lineage**: Track supersedes_id to maintain version chain.
- **Audit trail**: Complete history from day one (not "future enhancement").
- **Version numbers**: Generated on-read for display only, never relied upon for logic.

Example structure:
```sql
clinical_narratives (
  id UUID PRIMARY KEY,
  narrative_id UUID,        -- Groups all versions of same narrative
  -- version INTEGER,       -- REMOVED: Too risky, could be miscounted
  content TEXT,
  content_fingerprint TEXT,
  is_current BOOLEAN,       -- Single source of truth for active version
  supersedes_id UUID,       -- Points to previous version
  created_at TIMESTAMP,     -- Natural ordering, can't be wrong
  created_by TEXT          -- Which Pass/model created this
  -- Never UPDATE, only INSERT
)

-- Find current version (source of truth)
WHERE narrative_id = ? AND is_current = true

-- Generate version numbers for display only
SELECT *, ROW_NUMBER() OVER (PARTITION BY narrative_id ORDER BY created_at) as display_version
```

## Security & Privacy

- RLS: Every narrative, relationship, and link row carries patient/profile context for strict access control.
- PHI: Narrative summaries used for embeddings must be de‑identified and scoped per patient during search.
- Audit: Capture method/model/version and provenance for AI‑assisted updates.

## Performance & UX

- Fast Reads: Optional “narratives_display” cache for UI (language/complexity in future), hydrated from core records.
- Indexing & Trees: Relationship traversals via recursive queries; cache common views (e.g., a patient’s narrative tree).
- Timeline Integration: Provide quick fetch of chronological sequences for a narrative’s linked events.

### Policy: Pass 3 sequencing and context limits (MVP)

- Sequencing: Single call with three phases (direct → hints → indirect) to keep coherence.
- Caps: Top‑k parents (e.g., 5) and depth (e.g., 2) for context; limit narratives updated per job; re‑queue overflow.
- Idempotency: Stable id per narrative update (narrative_id + content_fingerprint_hash); retries are safe.
- Version safety: Set previous is_current=false atomically when creating new version.
- Embeddings: Re‑embed summaries only on fingerprint change; batch when possible.
- Context diet: Use titles, summaries, and key timeline points; avoid bulk content payloads.

### Event Bundling Policy (identity-based, not time-windowed)

- Group direct‑narrative candidates by canonical identity keys (e.g., medication_identity_key) - no arbitrary time windows needed.
- Skip duplicates via matching medical codes and identity keys (prevents double-counting same clinical fact from multiple documents).
- Exception: Healthcare encounters use encounter-based boundaries (not arbitrary time windows).
- For each bundle, update/create the direct narrative and its timeline (adjust valid_to/last_event_effective_at).
- Emit parent relationship hints only (siblings inferred from graph structure, not explicitly assigned).

## Integration Points

- Temporal Data Management: Narratives never replace factual event history; they reference deduplicated, superseded clinical events.
- Medical Code Resolution: Codes remain on events. Narrative clustering/filters derive from those codes.
- Health Data Universality: Display‑layer translations for narrative titles/summaries later; source content preserved.
- FHIR Interop (future): Expose narrative content via Composition/Section patterns, with Provenance for updates.

### Narratives as Complementary Enhancement Layer (MVP)

- System remains fully functional on Pass 1/2 alone (events/timeline/UI) if Pass 3 is unavailable.
- Pass 3 adds coherence and relationships; no write‑on‑read in DB functions; jobs enqueued via API.
- Future: Option to pivot to narrative‑first UI without changing core writes.

## Open Questions

- Relationship Semantics: Minimal set of relationship types needed for MVP (contains, part_of, relates_to)? Note: Siblings are inferred from shared parents, not explicitly assigned.
- Update Propagation: When a small narrative changes, when/how do we update parent episode/condition narratives?
- Embedding Governance: Summary length, regeneration cadence, and cost controls for re‑embedding.
- Personalization: Should the narrative tree be editable by users (labels, grouping) with safe constraints?

## Next Steps

1) Finalize narrative summary template (short, de‑identified) for consistent embeddings.
2) Define Pass 3 minimal input contract (current summary/relationships + new events) and decision outputs.
3) Choose initial relationship types; prototype traversal and caching patterns.
4) Add deterministic + semantic discovery heuristics and ranking rulebook.
5) Plan RLS and audit fields across narratives, relationships, and event links.
6) Implement encounter identity strategy and reopen/grace policies.

### Pass 3 MVP API contract (concise)

- Input:
  - patient_id, profile_id
  - new_or_updated_events: list of event refs + key metadata
  - deterministic_matches: direct narrative ids per event
  - active_parents: parent narrative ids (filtered by `valid_to IS NULL`, top‑k, depth‑capped)
  - indirect_shortlist: candidate indirect narrative ids from semantic + heuristics
- Output:
  - direct_narratives: created/updated ids + summaries + fingerprints + last_event_effective_at + is_current flag
  - indirect_narratives: created/updated ids + summaries + fingerprints + is_current flag
  - relationships: edges created/updated with types + confidences
  - reembedding_required: list of narrative ids that changed fingerprint
  - job_metrics: counts, token estimates, time

### MVP Scope Gate for Pass 3 (start criteria)

- Pass 1/2 outputs finalized (including deterministic signals in Pass 2 → Pass 3 payload).
- Small test harness with 10–20 documents covering meds, labs, encounters, conditions.
- Guardrails configured: bundle caps, parent/depth caps, idempotency keys, re‑embedding policy.
- Metrics logging in place: counts, token usage, latencies, success/error codes.

### Glossary: Graph on Relational

- Graph on relational = model nodes and edges using relational tables (e.g., narratives + narrative_relationships) for SQL/RLS performance and simplicity; no separate graph DB required.

This document is a broad architectural guide. Subsequent iterations should add concrete API contracts, storage outlines, and performance targets, while keeping the core principles: flexible relationships, event‑anchored provenance, embedding‑powered discovery, and strict privacy.

