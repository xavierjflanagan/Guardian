I’m going to re-open the deduplication framework file to verify the latest content and check for implementation blockers, inconsistencies, and edge cases before we proceed.

[1 tool called]

I reopened the deduplication framework doc and verified each section against implementation feasibility. Here’s a focused pre-implementation review with concrete fixes.

### Must fix (will break or mis-merge)
- Composite identity key missing strength in SQL fallback
```129:146:shared/docs/architecture/database-foundation-v3/V3_Features_and_Concepts/temporal-data-management/deduplication-framework.md
RETURN 'composite:' || COALESCE(p_route, 'unknown') || ':' || COALESCE(p_dose_form, 'unknown');
```
- Include strength (and unit) to avoid merging different strengths. Match the TypeScript identity policy.

- Frontend query references non-existent `start_date`
```321:329:shared/docs/architecture/database-foundation-v3/V3_Features_and_Concepts/temporal-data-management/deduplication-framework.md
ORDER BY m.start_date DESC;
```
- Should be `clinical_effective_date` or `valid_from`.

- Function name and call alignment
```98:123:shared/docs/architecture/database-foundation-v3/V3_Features_and_Concepts/temporal-data-management/deduplication-framework.md
export async function normalizeClinicaEntities(...
```
```384:386:shared/docs/architecture/database-foundation-v3/V3_Features_and_Concepts/temporal-data-management/deduplication-framework.md
await normalizeClinicaEntities(null, patientId, [userGeneratedEvent]);
```
- OK now, but earlier the overview snippet uses different names:
```26:39:shared/docs/architecture/database-foundation-v3/V3_Features_and_Concepts/temporal-data-management/deduplication-framework.md
applySupersessionLogic(...), persistSupersessionDecisions(...)
```
- Align naming across the doc (either rename or add a note that these are conceptual).

- Confidence field shape inconsistent
```302:314:shared/docs/architecture/database-foundation-v3/V3_Features_and_Concepts/temporal-data-management/deduplication-framework.md
if (entity.medical_codes.confidence < 0.7) { ... }
```
- Elsewhere we use `code_confidence` (and enum strings for date confidence). Standardize the schema: use `code_confidence number` and `date_confidence enum`.

### Should fix (logic and safety)
- EXACT_DUPLICATE fields look good; ensure “significant fields” are fully specified
```51:57:shared/docs/.../deduplication-framework.md
... rxnorm_scd, dose_amount, frequency, route, dose_form
```
- If you store `dose_unit` separately, include it.

- TEMPORAL_ONLY requires tie-breakers when dates equal
```82:90:shared/docs/.../deduplication-framework.md
... new.clinical_effective_date > old...
```
- Document tie strategy (use date_confidence ordering, then upload sequence) to match temporal-conflict-resolution.

- Temporal types are mixed (DATE vs TIMESTAMPTZ)
```154:164:shared/docs/.../deduplication-framework.md
valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ, clinical_effective_date DATE
```
- This is workable; explicitly state timezone policy. If precision matters for some entities, consider `TIMESTAMPTZ` everywhere or document why DATE is sufficient for clinical_effective_date.

- Identity-grouping function omits strength in fallback (again)
```129:146:shared/docs/.../deduplication-framework.md
-- add strength to prevent merging different doses
```

- Source of truth for UI vs narratives is open-ended
```12:13:shared/docs/.../deduplication-framework.md
...may end up calling upon the sub-narrative ... But TBC.
```
- Decide one path now (Silver tables vs narratives as the UI source) to avoid duplicative logic and drift. If narratives are the source, clarify that dedup still drives the canonical clinical state used by narratives.

### Operational safeguards (concise)
- Concurrency/idempotency: Serialize per patient to avoid race conditions; make the normalization job idempotent by `(patientId, shellFileId)` and use row-level locks when applying supersessions.
- Overlap prevention: Add a partial unique index for “single current” per `(patient_id, clinical_identity_key)` where `is_current = true`, or an exclusion constraint if you move to range types later.
- Audit completeness: The audit table is good; add `actor` (system/user), processing version, and a pointer to the identity decision if available for traceability.

### Nice to have (performance/maintenance)
- Index on `(patient_id, clinical_identity_key, is_current)` for current lookups by identity.
- Materialized view for “current clinical state” if the UI reads directly from Silver.
- Clear enums/constants for `status` transitions to avoid free-text drift.

### Verdict
- Architecture is solid and implementable. Fix the strength omission in composite identity, the `start_date` query bug, and standardize confidence fields. Add tie-breakers for equal dates and note concurrency constraints. After these, the doc is build-ready.