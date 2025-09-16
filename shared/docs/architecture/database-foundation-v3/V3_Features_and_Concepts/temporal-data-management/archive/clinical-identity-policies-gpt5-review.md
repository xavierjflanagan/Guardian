I'll scan the four documents to assess consistency and feasibility across identity policy, deduplication, and temporal conflict logic, then report issues and recommendations.

[4 tools called]

I opened and read all four docs end-to-end. I’ll report feasibility, inconsistencies, and concrete fixes before implementation for Exora [[memory:6400632]].

### Cross-document assessment
- Overall design is strong: identity-first grouping, deterministic supersession, and clear temporal precedence.
- Biggest risks: a few code/typing bugs, field name drifts, and minor policy inconsistencies that would break an initial build.

### Critical defects to fix
- Non-async function uses await
```621:664:/Users/xflanagan/Documents/GitHub/Guardian-Cursor/shared/docs/architecture/database-foundation-v3/V3_Features_and_Concepts/temporal-data-management/clinical-identity-policies.md
function validateClinicalIdentity(
  entity: ClinicalEntity,
  proposedIdentityKey: string
): IdentityValidation {

  // Safety check 1: Ensure medical code confidence meets threshold
  if (entity.medical_code_confidence < 0.7) {
...
  const existingIdentities = await getExistingIdentitiesForPatient(
```
Make the function async and unify the confidence field name (see below).

- Unreachable fallback return in condition identity
```316:323:.../clinical-identity-policies.md
// Priority 4: Normalized condition name (when codes unavailable)
const normalizedName = normalizeConditionName(condition.condition_name);
return `normalized:${normalizedName}`;

// Priority 5: Conservative fallback
return `fallback:${condition.id}:${condition.extracted_text_hash}`;
```
The final return is unreachable. Decide: either conditionally return fallback when normalization is too low-confidence, or remove.

- Function name/type drifts (will cause runtime errors)
```95:116:/.../deduplication-framework.md
export async function normalizeClinicaTakientities(
...
```
```378:383:/.../deduplication-framework.md
await normalizeClinicaEntities(null, [userGeneratedEvent]);
```
Two different names. Pick one and use consistently. Also `loadPatientEntities(patientId)` is called but `patientId` isn’t in scope in `normalizeClinicaTakientities`.

- Date resolution uses out-of-scope variable
```177:186:/.../temporal-conflict-resolution.md
// Priority 4: Upload timestamp (fallback)
return {
  selectedDate: { 
    date_value: shellFileContext.upload_timestamp,  // not in scope here
```
Either pass `shellFileContext` into `applyDateHierarchy` or move fallback into the caller. Also, the types for “date entries” are conflated (see next point).

- Conflicting types in date logic
  - You define `DateExtraction` as an object holding an array `extracted_dates[]`, but functions later treat inputs as arrays of individual date entries. Resolve type: pass arrays of single “date entries” to the hierarchy functions or rename the wrapper.

- Field naming inconsistencies (identity and temporal)
  - Confidence fields are referenced as `code_confidence`, `medical_code_confidence`, and `medical_codes.confidence` across docs. Standardize one shape (e.g., `code_confidence: number` on the entity/code record).
  - Temporal comparison uses `date_confidence_score` in one place; elsewhere `date_confidence` is a string enum. Align on either numeric+enum mapping or just enum.

### Identity policy issues
- Medication composite identity omits route in SQL (but includes it in TS)
```562:572:/.../clinical-identity-policies.md
WHEN ingredient_name IS NOT NULL AND strength IS NOT NULL 
  THEN 'composite:' || LOWER(ingredient_name) || ':' || strength || ':' || COALESCE(LOWER(dose_form), 'unknown')
```
Add route to match the TS logic to avoid merging across routes.

- Ingredient-only fallback is risky
```124:132:/.../clinical-identity-policies.md
// Composite comparison when codes match but attributes differ
if (existingEntity.ingredient_name === newEntity.ingredient_name) {
  return { identity_match: true, identity_key: `ingredient:${...}` ... }
}
```
This can over-merge forms/routes. Either remove or add strict guards (require same route/form, or only use when SCD/SBD are present).

- `MedicationIdentityInput` used in fallback references `medication.id` but interface lacks `id`
```89:92:/.../clinical-identity-policies.md
return `fallback:${medication.id}:${medication.extracted_text_hash}`;
```
Add `id` to the interface or change fallback key to not require it.

### Deduplication framework gaps
- EXACT_DUPLICATE should also compare dose_form (and route if not already canonicalized in SCD)
```49:52:/.../deduplication-framework.md
AND old.dose_amount = new.dose_amount
AND old.frequency = new.frequency
AND old.route = new.route
```
Add `dose_form` (and any other clinically material fields).

- Schema time type choice
```150:158:/.../deduplication-framework.md
valid_from TIMESTAMP ...,
valid_to TIMESTAMP ...,
clinical_effective_date DATE,
```
You mix TIMESTAMP and DATE. If precise clinical times matter (hospital encounters), consider `TIMESTAMPTZ` or keep DATE consistently but document timezone assumptions. Pick one and stick to it.

### Temporal conflict resolution details
- Good hierarchy and tie-breakers; fix scope/type bugs noted.
- The “user correction” path is sound and aligns with dedupe’s user-edit flow.

### Consistency and naming
- Supersession taxonomy is consistent across these docs (EXACT_DUPLICATE, PARAMETER_CHANGE, STATUS_CHANGE, TEMPORAL_ONLY). Keep reason strings aligned with taxonomy (e.g., `parameter_change:dose_10mg_to_20mg`).
- Ensure table naming alignment: some parts use `patient_clinical_events`, others entity-specific tables. If both exist (Bronze vs Silver), clarify which these scripts target.

### Feasibility verdict
- The architecture will work with the above fixes. The remaining issues are mostly naming/typing/scope bugs and a few identity safety edges. Once corrected, the deterministic pipeline is implementable and auditable.

### Recommended minimal edits (summary)
- Make `validateClinicalIdentity` async; standardize confidence field names everywhere.
- Fix unreachable fallback in condition identity; clarify policy for low-confidence normalization.
- Unify function names (`normalizeClinicaEntities`) and pass required variables (e.g., `patientId`).
- Pass `shellFileContext` into `applyDateHierarchy` or move fallback to caller; align date entry types.
- Include `route` in medication composite SQL; avoid ingredient-only identity merges.
- Add `dose_form` to EXACT_DUPLICATE comparison; align time types (DATE vs TIMESTAMPTZ) consistently.

- I reviewed all four docs and identified precise defects and policy mismatches that would block a clean build. With the listed small code and policy corrections, the design is sound and ready to implement.