I'll open the medical code resolution README to review it for completeness, correctness, and consistency with the other temporal/identity/dedup docs.

[1 tool called]

I opened the medical code resolution README and reviewed it for correctness and alignment with the temporal/identity/dedup stack; here are focused findings and fixes for Exora [[memory:6400632]].

### What’s good
- Clear rationale: use embeddings to find candidate codes from a curated DB; don’t stuff giant code lists into prompts.
- Properly positions code resolution as the keystone for deduplication and narrative building.

### Gaps and risks
- Role of AI vs deterministic selection is ambiguous
  - “Provide relevant code candidates to Pass 2 for final selection” suggests the model picks the code. For safety, the selection should be deterministic (terminology service picks best match by rules), or model-assisted but still constrained to candidates.
- Identity policy alignment not stated
  - Must explicitly commit to code levels used downstream:
    - Medications: RxNorm SCD/SBD (not IN), with route/form/strength preserved.
    - Conditions: SNOMED primary; ICD‑10‑AM secondary for reporting.
    - Allergies: SNOMED substance/agent.
    - Procedures: SNOMED procedure; AU MBS as applicable.
- Confidence and fallbacks missing
  - Define confidence scoring, thresholds (e.g., ≥0.8 accept; 0.6–0.8 flag as low-confidence; <0.6 create `custom_code`), and provenance logging of candidate set.
- Privacy/compliance posture not stated
  - Clarify embeddings processing (HIPAA/APP-compliant regional provider or local), PHI handling, RLS, and no raw notes in embeddings.
- Versioning/governance not stated
  - Pin and store code_system, code_version, release date; define update cadence for RxNorm/SNOMED/PBS/MBS; audit changes.
- Data sources and topology unclear
  - Specify one: local mirrored terminology DB (preferred) vs Snowstorm/FHIR/UMLS APIs; vector index (pgvector/OpenSearch/FAISS) and update pipeline.
- API contract between passes missing
  - Define Pass 1 output schema (normalized attributes), code-resolution service request/response (candidate list with scores), and Pass 2 final code payload shape.
- Performance and caching
  - State embedding model/dim, index type (ivfflat/HNSW) and parameters, cache hot codes, and expected latency SLOs.
- Observability
  - Metrics: match rate, low-confidence rate, no-match rate, average candidates considered, latency; audit table for decisions.

### Typos/wording cleanups
- “interopability” → interoperability; “regulation complicance” → regulatory compliance; “neccessity” → necessity; “thefore fascilitating” → therefore facilitating; “hierachial” → hierarchical; “maintenence” → maintenance; “succint” → succinct; “an succint” → a succinct.

### What to add to this README (concise)
- Scope of responsibility
  - Extract attributes in Pass 1; code-resolution service retrieves top-N candidates from terminology store; deterministic selector chooses the code; Pass 2 consumes the chosen code(s).
- Identity-level commitments
  - Explicit bullets for SCD/SBD vs IN, SNOMED vs ICD‑10‑AM, etc., to match the dedup/identity policies.
- Confidence policy and fallbacks
  - Thresholds; `custom_code` path; store `code_confidence`, `provenance`, and candidate array in audit.
- Privacy/compliance
  - Embeddings processed on compliant infrastructure; de-identified inputs; RLS applied to code-linkage tables.
- Versioning and sources
  - List sources (RxNorm monthly, SNOMED-AU, PBS/MBS); store `code_version`; schedule updates.
- API contracts (brief)
  - Pass 1 output (attributes); resolution request (attributes + locale); response (code_system, code, display, version, confidence, candidates[]).
- Performance targets
  - 50–150 ms p95 resolution per entity with cache; 10–20 candidate cap; vector index and params.
- Observability/audit
  - Decision audit table and core metrics.

If you want, I can draft the short API contracts (request/response schemas) and a one-paragraph compliance note to drop into this README so it’s implementation-ready.