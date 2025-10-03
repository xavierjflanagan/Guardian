## Pass 1 Code Review and Readiness Assessment

**Project:** Exora Health — AI Processing V3 / Pass 1 (Entity Detection)

**Date (UTC):** 2025-10-03T03:23:42Z

**Scope:** Review of the new Pass 1 implementation in `apps/render-worker/src/pass1`:
- `index.ts`
- `Pass1EntityDetector.ts`
- `pass1-types.ts`
- `pass1-prompts.ts`
- `pass1-schema-mapping.ts`
- `pass1-translation.ts`
- `pass1-database-builder.ts`
- `README.md`

---

### Executive summary

- **Overall approach:** Sound. Dual-input (vision + OCR) entity detection with a pure-code translation layer and explicit schema mapping is a strong foundation. The seven-table record build is coherent and lines up with the bridge-schema strategy.
- **Primary risks (fix before testing):**
  - Schema mismatch between the prompt “response format” and `Pass1AIResponse` types.
  - Missing strict validation for AI response (risk of runtime crashes during translation).
  - Prompt bloat (full OCR spatial JSON inlined) leading to cost/timeouts.
  - No retry/backoff for transient AI failures; only classification of retryable errors.
  - Startup schema-mapping validation function exists but is not invoked.
  - Multi-page handling not explicit for PDFs (risk of under-coverage).
  - PII/logging and DB payload size considerations not enforced.

My recommendation is to address the items in “Critical fixes” below prior to the first full run. With these guards, the Pass 1 plan is viable and low-risk.

---

### Critical fixes before first testing

1) **Align prompt output schema with `Pass1AIResponse`**
- Update `pass1-prompts.ts` RESPONSE FORMAT to match your TypeScript types (e.g., `processing_metadata.confidence_metrics.overall_confidence` rather than flat `overall_confidence`).
- Alternatively, normalize both old/new shapes at parse time, but alignment is cleaner and reduces brittle defaults.

2) **Add strict response validation and normalization**
- Introduce a zod (or equivalent) validator for `Pass1AIResponse` (including nested structures) before translation. Coerce/guard optional fields and supply safe defaults.
- Benefit: prevents null/undefined dereferences when flattening nested fields.

3) **Control prompt size**
- Use provided helpers to truncate:
  - `truncateOCRText(input.ocr_spatial_data.extracted_text)`
  - `formatSpatialMapping(input.ocr_spatial_data.spatial_mapping, maxElements)`
- Avoid embedding full spatial arrays; include a truncated sample and an explicit instruction that full mapping is available contextually.

4) **Invoke startup schema-map validation**
- Call `validateSchemaMapping()` at module load or in `Pass1EntityDetector` constructor and throw on error to fail fast.

5) **Retry with exponential backoff for transient AI errors**
- Wrap the OpenAI call with a simple retry strategy for 429, timeouts, and 5xx. Cap retries (e.g., 3 attempts) with jitter.

6) **Defensive translation guards**
- Use optional chaining and defaults in `pass1-translation.ts` to avoid throwing when an entity is partially populated.
- Validate enums for `entity_category` and `entity_subtype` against known sets; reject or coerce unknowns prior to DB write.

7) **Use `confidence_threshold`**
- The `Pass1Config.confidence_threshold` is currently unused. Apply it to:
  - flip `manual_review_required` if confidence below threshold,
  - route entries into `ai_confidence_scoring`.

8) **Integrate the error-recovery prompt**
- On batch validation failure, re-run `generateErrorRecoveryPrompt()` for the affected segments and merge results.

9) **PII-safe logging and DB payload limits**
- Redact `original_text`, OCR snippets, and base64 sizes from logs in production.
- Consider storing large `extracted_text` in object storage, persisting only a pointer/preview in the row.

10) **Multipage documents**
- For PDFs, pre-render images per page and iterate; otherwise, classification coverage will miss later pages.

11) **Observability**
- Add minimal metrics around OpenAI latency, attempts, failures, and validation outcomes.

---

### File-by-file notes and suggested edits

#### `pass1-prompts.ts`
- Issue: RESPONSE FORMAT does not match `Pass1AIResponse` nesting for `confidence_metrics`.
- Issue: Full `spatial_mapping` JSON is embedded.
- Action:
  - Align schema; replace flat `overall_confidence` with nested `confidence_metrics` block.
  - Replace inline `JSON.stringify(spatial_mapping)` with `formatSpatialMapping(spatial_mapping, 100)` and use `truncateOCRText()` for long OCR text.

Example revision (illustrative):

```ts
// In generatePass1ClassificationPrompt()
OCR Text: "${truncateOCRText(input.ocr_spatial_data.extracted_text, 2000)}"
OCR Spatial Coordinates (sample):
${formatSpatialMapping(input.ocr_spatial_data.spatial_mapping, 100)}

// RESPONSE FORMAT → processing_metadata.confidence_metrics
"processing_metadata": {
  "model_used": "gpt-4o",
  "vision_processing": true,
  "processing_time_seconds": <number>,
  "token_usage": { ... },
  "confidence_metrics": {
    "overall_confidence": <0.0-1.0>,
    "visual_interpretation_confidence": <0.0-1.0>,
    "category_confidence": { ... }
  }
}
```

#### `pass1-translation.ts`
- Issue: Direct dereferencing of nested fields can throw (e.g., `entity.spatial_information.unique_marker`).
- Action: Guard nested structures and provide defaults; validate enums; apply `confidence_threshold` where appropriate.

Example safeguards (illustrative):

```ts
const spatial = entity.spatial_information ?? {
  page_number: 1,
  bounding_box: null,
  unique_marker: '',
  location_context: '',
  spatial_source: 'none',
};
const ocr = entity.ocr_cross_reference ?? {
  ocr_text: null,
  ocr_confidence: null,
  ai_ocr_agreement: 0,
  discrepancy_type: null,
  discrepancy_notes: null,
};
```

#### `pass1-schema-mapping.ts`
- Action: Call `validateSchemaMapping()` once on startup and throw if invalid. This prevents silent omissions and keeps Pass 2 routing accurate.

#### `Pass1EntityDetector.ts`
- Issue: No retry/backoff around OpenAI call; JSON parsing assumes presence of content.
- Action:
  - Wrap chat call in retry with exponential backoff (max 3 attempts, jitter). 
  - Guard `response.choices[0].message.content` before `JSON.parse` and fail gracefully with structured error.
  - Apply `confidence_threshold` post-parse to mark manual review and drive confidence scoring.

#### `pass1-database-builder.ts`
- Note: Good composition. Consider computing `profile_classification_audit.recommended_profile_type` via a future light-weight heuristic if available (optional).
- Action: Ensure any large strings (OCR text) remain bounded before writes.

#### `index.ts`
- Action: Export a `validatePass1Startup()` function or run mapping validation at import time; ensure side effects are safe for tests.

---

### Testing plan (prioritized)

1) **Unit**
- Schema mapping: every subtype mapped; `getUniqueSchemas()` correctness.
- Translation: malformed entity samples do not throw; validation catches missing fields.
- Prompts: schema alignment snapshot tests; truncation behavior for OCR/spatial.

2) **Integration**
- Mock OpenAI response → translation → database record build for a realistic sample (vitals + medications + document structure).
- Retry/backoff path with simulated 429/timeout.

3) **E2E (staging)**
- Real PDF (multi-page) through worker job → verify `entity_processing_audit` rows; confirm `pass2_status` routing; confirm `shell_files` updated and that payloads are within limits.

**Success looks like:**
- No runtime exceptions during translation.
- Average confidence/AI-OCR agreement populated; manual review counts reflect threshold.
- Pass 2 queue (`pending`) set only for non-document-structure entities.

---

### Next steps checklist

- [ ] Align prompt schema and truncate OCR/spatial data
- [ ] Add zod validators and normalize parse path
- [ ] Invoke `validateSchemaMapping()` at startup
- [ ] Add retry/backoff (+ jitter) for OpenAI calls
- [ ] Harden translation with defaults and enum validation
- [ ] Wire `confidence_threshold` into manual review and scoring routing
- [ ] Add minimal metrics and PII-safe logging
- [ ] Validate multi-page PDF handling in the worker

---

### Notes on cost assumptions

- Current cost math is reasonable for first-pass estimates. Keep an eye on image token estimation; calibrate with real usage once sample docs run in staging.

---

This review focuses on readiness and guardrails so Pass 1 testing yields stable, interpretable results while protecting costs and data integrity. With the fixes above, the implementation is well positioned to proceed.


