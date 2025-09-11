GPT5 review of temporal-health-data-evolution-strategy-v4-planning-gpt5-review
DATE: 10th September 2025

I'll open the V4 planning document to review it end-to-end and assess feasibility, gaps, and improvements before build.

[1 tool called]

I read the V4 planning doc end-to-end and evaluated feasibility, gaps, and implementation risks. Here’s a senior-engineer review with concrete improvements before build.

### What’s strong
- Single-active-row per clinical identity with full supersession history is simple for the UI and safe for audit.
- Clear “search-before-create” and narrative versioning model; master categories (LONGTERM/SHORTTERM/ROUTINE/GENERAL) are intuitive for UX.
- Dual views (timeline vs narratives) sharing one clinical-event foundation avoids duplication and enables cross-navigation.

### Critical inconsistencies and risks to fix before build
- AI vs deterministic dedupe contradiction
  - Says no AI for supersession: “Supersession uses deterministic functions… no AI decision making needed” (40–43).
  - Conclusion says dedupe uses “medical codes and AI analysis” (852–855).
  - Decide one: If dedupe is deterministic, remove AI wording here; keep AI only for narrative matching.
- Supersession type naming drift
  - Part 1 uses EXACT_DUPLICATE, PARAMETER_CHANGE, STATUS_CHANGE, TEMPORAL_ONLY (55–85).
  - Part 9 lists TRUE_DUPLICATE, MEDICATION_UPDATE, STATUS_CHANGE, DISCONTINUATION_WITH_RESTART, TEMPORAL_UPDATE (742–744).
  - Unify names and semantics system-wide (DB enum, code constants, docs, and UI).
- Temporal precedence rules are oversimplified
  - “Use most recent document’s date as truth” (533–541) will misfire against higher-confidence older clinical dates. Use a weighted policy:
    - Prefer explicit clinical_effective_date > doc header date > file metadata > upload date.
    - Source trust weighting (EHR export > discharge summary > GP letter > patient note).
    - If disagreement persists → mark “conflicted” and queue for review or keep both as non-overlapping periods.
- Data types and constraints
  - valid_from/valid_to need timestamptz; better: a single tstzrange column with:
    - EXCLUDE USING gist (patient_id =, medical_code =, narrative_type =, valid_period &&) to prevent overlaps.
    - Partial unique index for “single current”: UNIQUE(patient_id, medical_code, narrative_type) WHERE upper_inf(valid_period).
  - Avoid persisting is_current (51–52); derive from valid_to IS NULL or make it a generated column.
- Code identity granularity not specified
  - “Single active row per medical code” (28) can over-merge meds if RxNorm identity is too coarse (ingredient) or ignore clinically relevant distinctions (route/form/SCD vs SBD).
  - Define per domain:
    - Medications: choose RxNorm level (SCD/SBD) + route/form as part of identity keys.
    - Conditions: prefer SNOMED CT (clinical identity), map ICD-10-AM for reporting.
    - Allergies: use SNOMED substance/group; handle ancestor/descendant relationships carefully (do not over-merge parent “seafood” with specific “shellfish” unless policy says so).
- Procedures path incomplete
  - Part 7 assumes procedures dedupe in interventions (601–608). Ensure consistent coding columns, indexes, and the same supersession pipeline for procedures. Decide if procedures are point-in-time (usually no supersession, just confirmations) vs occasionally status-bearing (e.g., planned vs performed).
- “Archived is FALSE” query predicate (91) without defining archived across tables. Either define archived boolean consistently or drop from examples.
- Narrative embeddings and PHI
  - Using embeddings for narratives is fine, but state the policy: embeddings stored only for narratives, de-identified content, and processed via HIPAA/APP-compliant regional provider or on-prem model. Remove ambiguity on event embeddings persistence (keep transient only).
- Concurrency, idempotency, and ordering
  - No plan for simultaneous ingests for the same patient/code.
  - Add: per-patient consolidation mutex, job idempotency keys (patient_id + shell_file_id), and transactional normalization with row-level locks to avoid race conditions.
- Auditability and review
  - You state “no review queues” (42). For clinical safety, add an exception path:
    - Keep deterministic auto-apply for high-confidence cases (EXACT_DUPLICATE, clear PARAMETER_CHANGE).
    - Route “conflicted” temporal or identity cases to a lightweight review list (still append-only, safe defaults).
  - Add a normalization_audit table (decision_type, inputs snapshot, chosen period, source weights, actor, timestamps).

### Concrete improvements (database and algorithms)
- Clinical tables (meds/conditions/allergies/procedures)
  - Columns: medical_code, code_system, code_version; valid_period tstzrange; superseded_by_record_id; supersession_reason (enum); provenance array; date_confidence enum; conflicting_dates jsonb.
  - Indexes:
    - Partial unique: (patient_id, medical_code, narrative_type) WHERE upper_inf(valid_period).
    - GIN/GIST as needed for ranges and provenance.
  - Constraints:
    - EXCLUDE USING gist as above to prevent overlaps.
- Identity policy
  - Medications: identity = (patient_id, rxnorm_scd_or_sbd, route, form). Document this explicitly.
  - Conditions: identity = (patient_id, snomed_concept). ICD-10-AM stored as related code.
  - Allergies: identity = (patient_id, snomed_concept). If only category present, store at that level and do not supersede specific children.
  - Procedures: identity = (patient_id, snomed_procedure OR mbs_code, date).
- Supersession taxonomy (unified)
  - EXACT_DUPLICATE
  - PARAMETER_CHANGE (subtypes: dose, frequency, route, form)
  - STATUS_CHANGE (e.g., medication: active→discontinued; condition: active→resolved)
  - DISCONTINUATION_WITH_RESTART (gap opens, later re-start creates new period)
  - TEMPORAL_UPDATE (failsafe when fields differ but only date precedence known)
- Temporal conflict policy
  - Deterministic resolver function using:
    - evidence_date = max_weighted(clinical_effective_date candidates)
    - If two current records conflict: close the older period at the newer’s effective_from; if overlap remains and confidence is low, mark “conflicted” and do not auto-supersede.
- Narrative system
  - Versioning by supersession is solid. Ensure:
    - last_embedding_update timestamptz and pgvector dimension fixed; ivfflat index with tuned lists.
    - Junction table for sub↔master with relevance_score and reason.
    - Master assignment: deterministic heuristics first (condition-linked, temporal overlap), AI for residuals; always log rationale.
  - Derive narrative date ranges from linked clinical periods; do not hand-author them.
- Timeline integration
  - Keep a view or materialized view resolving all events with their linked narratives and effective times for fast UI filtering. Refresh incrementally post-processing.

### Policy/operational requirements
- RLS: All clinical and narrative tables must enforce patient-scoped RLS and care-team scoping.
- Terminology governance: Version pinning for SNOMED, ICD-10-AM, RxNorm; update cadence; mapping tables; source of truth (internal terminology service).
- Privacy: Clear DPIA. No PHI to non-compliant LLM endpoints; de-identify narrative embeddings.
- Observability: Metrics for duplicates detected, supersessions applied, conflict rates, time-to-consolidate, embedding latency, and query performance. Alarms for anomalies.

### Callouts to fix in the doc text
- Align language and types:
  - Replace date with timestamptz/tstzrange throughout, and remove is_current unless generated.
  - Define archived consistently or remove from example WHERE clauses.
  - Unify supersession type names across Parts 1, 7, and 9.
  - Clarify that dedupe is deterministic; AI is used only for narrative matching/assignment (if that’s the choice).
  - Specify identity granularity (RxNorm level + route/form).
  - State concurrency/idempotency plan and audit table.
  - Confirm real table names referenced in integration diagrams (e.g., patient_clinical_events, healthcare_timeline_events) match the current schema files.

### Feasibility
- With the fixes above, the plan is implementable and scalable. The biggest engineering work will be temporal modeling (ranges + constraints), identity policy, and concurrency-safe normalization.

- I reviewed the V4 doc and flagged contradictions (deterministic vs AI), taxonomy drift, temporal and identity policies, and missing ops details. I proposed concrete DB-level and algorithmic fixes so we can build safely.