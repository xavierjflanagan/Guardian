GPT5 2nd review of shared/docs/architecture/database-foundation-v3/temporal-health-data-evolution-strategy-v4-planning.md and ongoing discussion chat with user (me)
Date: 11th September 2025


I’m re-reading the updated V4 planning doc end-to-end to verify Claude’s changes and re-assess feasibility for Exora [[memory:6400632]].

### What’s fixed and now solid
- Deterministic dedup only: Language is now consistent that supersession is deterministic (no AI).
```849:855:/Users/xflanagan/Documents/GitHub/Guardian-Cursor/shared/docs/architecture/database-foundation-v3/temporal-health-data-evolution-strategy-v4-planning.md
V4 represents a complete, production-ready solution that:

1. **Deduplicates effectively** using medical codes and deterministic temporal functions
```
- Supersession taxonomy unified to EXACT_DUPLICATE, PARAMETER_CHANGE, STATUS_CHANGE, TEMPORAL_ONLY (reflects across scenarios and requirements).
- Removed undefined `archived` predicate from example queries.

### Remaining issues and concrete recommendations
- Temporal conflict resolution still has a contradicting sentence
  - The policy section retains “use most recent document’s date as truth,” which conflicts with your explicit date hierarchy.
```533:541:/Users/xflanagan/Documents/GitHub/Guardian-Cursor/shared/docs/architecture/database-foundation-v3/temporal-health-data-evolution-strategy-v4-planning.md
Approach:
- Use most recent document's date as truth
- Apply temporal precedence automatically
- Store all conflicting dates for audit
```
  - Recommendation: Replace with “Apply the date hierarchy (explicit clinical date > doc date > metadata > upload date). If dates still conflict, prefer the higher-confidence source; otherwise mark ‘conflicted’ and apply TEMPORAL_ONLY with provenance.”

- User edits default to “now” as effective date
```616:617:/Users/xflanagan/Documents/GitHub/Guardian-Cursor/shared/docs/architecture/database-foundation-v3/temporal-health-data-evolution-strategy-v4-planning.md
- Apply temporal precedence (user edit gets current timestamp)
```
  - Risk: Users often backfill earlier periods (e.g., stopped last week). Recommendation: For UI edits, capture an explicit clinical effective date; if omitted, use now with low date_confidence and provenance “user_generated”.

- “Single active row per medical code” can over-merge meds
```684:686:/Users/xflanagan/Documents/GitHub/Guardian-Cursor/shared/docs/architecture/database-foundation-v3/temporal-health-data-evolution-strategy-v4-planning.md
- Single active row per medical code across all clinical entities
```
  - Recommendation: Add a short “Identity Policy” note now (details later): Medications identity = RxNorm level (SCD/SBD) + route + form; Conditions = SNOMED; Allergies = SNOMED substance/group; Procedures = SNOMED/MBS per date. This avoids unsafe merges.

- Procedures path: clarify supersession vs confirmation
  - Many procedures are point-in-time; dedupe should collapse exact repeats to a canonical record with provenance/confirmations, not supersede history. Add one line to that effect in Scenario 5 and Part 9.

- Narrative embeddings policy: clarify storage/processing scope
  - Keep the doc explicit that embeddings are stored for narratives only, not events; treat embeddings as PHI-equivalent under RLS and ensure processing on a compliant provider or in-region. This aligns with your position while closing the policy gap.

- Consistency for reasons/enums
  - Throughout examples, ensure `supersession_reason` values map 1:1 to the standardized taxonomy (e.g., exact_duplicate, parameter_change:dose_10_to_20, status_change:discontinued, temporal_only). Helpful later for analytics and UI badges.

- Minimal note on concurrency/idempotency (one sentence)
  - Even if implementation detail, add a single guardrail line in Part 9 “Post-Processing System”: “Normalization runs idempotently per (patient_id, shell_file_id) with per-patient serialization to avoid race conditions.” Keeps the plan practical without deep dive.

### Things I agree with keeping as-is
- Deterministic-only supersession (no review queues) with TEMPORAL_ONLY failsafe is coherent and implementable, given the strong provenance and conflict capture.
- Narrative supersession/versioning and dual-view integration are sound and clear.
- Defer code identity granularity to a dedicated planning doc; just add the brief identity-policy placeholder now to prevent misinterpretation during build.

### Quick doc edits to consider
- Replace the dated-truth sentence per the hierarchy/confidence guidance.
- Add one sentence under UI edits about capturing clinical effective date.
- Add the brief “Identity Policy (placeholder)” bullets.
- Add a one-liner about procedures being point-in-time confirmations vs supersession.
- Add one sentence about narrative embedding PHI handling.
- Add the single concurrency/idempotency guardrail line in Post-Processing.

If you want, I can apply those small text edits directly now and keep the rest untouched.



User: 
Please explain this futther: "“Single active row per medical code” can over-merge meds
entities
Recommendation: Add a short “Identity Policy” note now (details later): Medications identity = RxNorm level (SCD/SBD) + route + form; Conditions = SNOMED; Allergies = SNOMED substance/group; Procedures = SNOMED/MBS per date. This avoids unsafe merges." what do you mean? are you saying that the same emdication in oral form vs cream form have the same medical code adn therefore we risk merging them? is this actuallyt he case, i wouldve thought they have different medical codes (codes take into account varying adminisatration routes) ?


GPT5:
### Short answer
Yes—if you dedupe on a too-coarse “medical code,” you can wrongly merge clinically different meds. RxNorm has multiple levels. If you key identity on an ingredient-level CUI (IN), you’ll collapse different strengths, dose forms, and sometimes routes into one “active row.” To avoid this, define an explicit identity policy that uses RxNorm levels that include form/strength (SCD/SBD), and carry route/form alongside. That’s what I meant.

### Why this matters
- RxNorm levels differ:
  - IN (ingredient) → too coarse; same code across tablets, injections, creams, strengths.
  - PIN (precise ingredient/salt) → still coarse.
  - SCD (Semantic Clinical Drug) → ingredient + strength + dose form.
  - SBD (Semantic Branded Drug) → brand + strength + dose form.
- If your `rxnorm_code` field sometimes stores IN-level codes (common when extraction is uncertain), “single active per code” will over-merge:
  - Example class of errors: hydrocortisone 1% cream vs hydrocortisone oral tablets share the same ingredient; IN-level dedupe would collapse them. SCD-level would not.
- ATC codes are classification (C09AA03, etc.) → far too coarse for identity; they group many different products.
- PBS/MBS item codes can be too fine (brand/pack-size) and fragment identity if used alone.

### Practical identity policy (meds)
- Use SCD/SBD for identity where possible:
  - Identity key = patient_id + rxnorm_scd_or_sbd + dose_form + route (route is usually implicit in SCD dose form, but keep it explicit to be safe) + optionally component structure for combos.
- Combination products must not merge with monotherapy:
  - Lisinopril-HCTZ ≠ Lisinopril; SCDs differ, keep separate.
- Fallbacks when SCD/SBD unavailable:
  - If only IN available, do NOT merge blindly. Use a composite fallback key:
    - ingredient (IN) + route + dose_form + strength (parsed) ± frequency.
  - If route/form/strength are missing, keep separate records (conservative), or assign a `custom_code` per extracted tuple to avoid unsafe merges.

### Recommended columns to make this safe
- rxnorm_ingredient_cui (IN)
- rxnorm_scd_cui (SCD) and rxnorm_sbd_cui (SBD)
- dose_form, route, strength_value/strength_unit, frequency
- custom_code (when no standard code fits)
- clinical_identity_key (materialized/generated from the chosen policy)

Then:
- “Single active row” should be enforced on clinical_identity_key, not on a generic `rxnorm_code`.

### Identity policy for other entities
- Conditions: SNOMED CT concept as identity; ICD-10(-AM) stored for reporting. Synonyms (“lupus” vs “SLE”) map to the same SNOMED.
- Allergies: SNOMED substance/agent as identity. Do not auto-merge a parent category (“seafood”) with a child (“shellfish”) unless policy explicitly allows ancestor-descendant collapsing.
- Procedures: SNOMED/MBS + occurrence date (and optionally laterality/site). Typically dedupe as confirmations of the same event rather than superseding.

### Bottom line
- You’re right that RxNorm can encode route/form—at the SCD/SBD levels. The risk is when pipelines match at ingredient-level for convenience. Make the identity level explicit (prefer SCD/SBD) and carry route/form so “single active row” doesn’t over-merge distinct therapies.




User:
Can AI models handle this without the provision of schemas/files outlining the esact codes? ie.., would be in hteir inherent knowledge / training data? or do we need ot provide the humungous list of all the codes?


GPT5:
### Short answer
- No—don’t rely on model “knowledge” to emit authoritative codes. It will hallucinate, drift across versions, and miss locale-specific systems.
- Yes—you need a terminology lookup layer. But you don’t need to stuff giant code lists into prompts. Keep codes server-side and query them deterministically. This keeps Exora safe and auditable [[memory:6400632]].

### Practical approach (recommended)
- Extract, don’t code in the model:
  - Have the model output normalized attributes: name, ingredient(s), strength, unit, dose form, route, frequency, free-text.
- Deterministic resolver:
  - Resolve attributes to codes via a terminology service:
    - Meds: RxNorm (prefer SCD/SBD), plus ATC as class; AU: PBS item codes where applicable.
    - Conditions: SNOMED CT (primary), ICD‑10‑AM (secondary/reporting).
    - Allergies: SNOMED substance/agent (handle category vs specific).
    - Procedures: SNOMED procedure; AU: MBS.
- Confidence + versioning:
  - Return code_system, code, display, version, confidence, and provenance (which rules/matches fired).
  - If below threshold: assign `custom_code` and keep the raw attributes for later improvement.

### Where the code lists live
- Not in prompts. Use:
  - External terminology APIs: RxNorm REST, SNOMED CT Snowstorm/FHIR Terminology, UMLS Metathesaurus.
  - Or a local mirror in Postgres: import code sets; index with trigram/GIN for lexical search; maintain synonym tables and mappings; schedule updates.

### If you want an LLM in the loop
- Use tool-augmented selection, not memory:
  - Retrieve top N candidate codes via the terminology service.
  - Ask the model to pick the best candidate and explain. Persist only the chosen code from the service, not the free-text.

### Bottom line
- Models alone: not sufficient for authoritative coding.
- Deterministic terminology resolution: required.
- You don’t provide “the humongous list” to the model—you host it as a service/data store and let the pipeline query it.