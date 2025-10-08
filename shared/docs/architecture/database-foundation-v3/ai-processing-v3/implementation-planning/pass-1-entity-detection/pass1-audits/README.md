# Pass 1 Table Audits

**Purpose:** Column-by-column analysis of Pass 1 database tables for optimization, redundancy, and accuracy.

---

## Audit Files

### [entity_processing_audit-COLUMN-AUDIT-ANSWERS.md](./entity_processing_audit-COLUMN-AUDIT-ANSWERS.md)
**Table:** `entity_processing_audit` (main entity records)

**Questions Answered:**
1. Visual/spatial columns - Are they overlapping?
2. `processing_priority` - AI generated or code inferred?
3. Green chain link symbols - What do they mean?
4. `pass1_model_used` & `pass1_vision_processing` - AI output or code injection?
5. `validation_flags` & `compliance_flags` - Why empty?
6. `original_text` vs `ai_visual_interpretation` - How do they differ?

**Key Findings:**
- ✅ All 5 visual/spatial columns serve distinct purposes (no redundancy)
- ❌ Remove `pass1_model_used` and `pass1_vision_processing` (duplicated session data)
- ⚠️ Fix mapping for `validation_flags` and `compliance_flags` (AI outputs them but code doesn't capture)

---

### [pass1_entity_metrics-COLUMN-AUDIT-ANSWERS.md](./pass1_entity_metrics-COLUMN-AUDIT-ANSWERS.md)
**Table:** `pass1_entity_metrics` (session-level metrics)

**Questions Answered:**
1. `processing_time_ms` - Why always 0?
2. `confidence_distribution` - Purpose and value?
3. `cost_usd` - Source and dynamic pricing options?
4. `user_agent` & `ip_address` - Why NULL and original purpose?

**Key Findings:**
- ❌ `processing_time_ms` timing bug (measures database building, not AI processing)
- ✅ `confidence_distribution` valuable quality metric
- ❌ Remove `cost_usd` (hardcoded pricing, calculate on-demand from tokens)
- ✅ Keep `user_agent`/`ip_address` (healthcare compliance design, document NULL behavior)

---

## Summary of Recommended Actions

### Immediate Fixes:

1. **Remove Redundant Columns:**
   ```sql
   ALTER TABLE entity_processing_audit
     DROP COLUMN pass1_model_used,
     DROP COLUMN pass1_vision_processing;

   ALTER TABLE pass1_entity_metrics
     DROP COLUMN cost_usd;
   ```

2. **Fix Timing Bug:**
   ```typescript
   // Move startTime to before AI call in Pass1EntityDetector
   const startTime = Date.now();
   const aiResponse = await this.callAI(...);
   const processingTime = Date.now() - startTime;
   ```

3. **Fix Flag Mapping:**
   ```typescript
   // Add to pass1-translation.ts around line 125:
   validation_flags: aiResponse.quality_assessment?.quality_flags || [],
   compliance_flags: aiResponse.profile_safety?.safety_flags || [],
   ```

4. **Document NULL Fields:**
   ```sql
   COMMENT ON COLUMN pass1_entity_metrics.user_agent IS
     'User agent of client that initiated processing (NULL for background jobs)';
   COMMENT ON COLUMN pass1_entity_metrics.ip_address IS
     'IP address of client that initiated processing (NULL for background jobs)';
   ```

### Optimization Impact:

- **Database:** Save 80+ redundant fields per document
- **Accuracy:** Fix timing to measure actual AI processing time
- **Maintainability:** Remove hardcoded pricing (calculate from tokens on-demand)
- **Compliance:** Document healthcare audit trail design intent

---

**Last Updated:** 2025-10-08
