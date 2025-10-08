# Pass 1 Column Audit - Detailed Answers

**Date:** 2025-10-08
**Context:** Analyzing entity_processing_audit table columns for redundancy and optimization

---

## 1. Visual/Spatial Columns - Are They Overlapping?

### The Five Columns:

| Column | Purpose | Example | Verdict |
|--------|---------|---------|---------|
| `original_text` | Clean extracted text | `"D.O.B.: 25/04/1994"` | ✅ KEEP |
| `ai_visual_interpretation` | What AI sees (with context) | `"D.O.B.: 25/04/1994"` or `"Xavier (footer name)"` | ✅ KEEP |
| `visual_formatting_context` | How text appears | `"bold header with indented values"` | ✅ KEEP |
| `location_context` | Human-readable location | `"page 1, vital signs section"` | ✅ KEEP |
| `unique_marker` | Semantic field identifier | `"dob"` or `"patient_name"` | ✅ KEEP |

### Analysis:

**`original_text`** (Primary data field)
- Clean, structured text for Pass 2 enrichment
- Used in manual review descriptions
- Consistent format, no annotations
- **Verdict:** ✅ KEEP

**`ai_visual_interpretation`** (Quality assurance field)
- What AI actually saw in raw image
- 95% identical to `original_text`
- 5% includes helpful context: `"Xavier (footer name)"`, `"Work Phone: (blank)"`
- Cross-validation with OCR
- **Verdict:** ✅ KEEP (contextual notes valuable for QA)

**`visual_formatting_context`** (Semantic context)
- How text appears: `"bold header"`, `"handwritten note"`, `"indented values"`
- Helps Pass 2 understand importance (header vs value)
- Critical for medical interpretation
- **Verdict:** ✅ KEEP

**`location_context`** (Human-readable spatial)
- WHERE entity is on page: `"page 1, vital signs section"`
- Human-facing (manual review, debugging)
- Complements pixel coordinates
- **Verdict:** ✅ KEEP

**`unique_marker`** (Semantic identifier)
- **Database check:** 50% match `original_text`, 50% are semantic labels
- Examples: `"dob"`, `"patient_name"`, `"home_phone"`, `"header"`
- Purpose: Cross-document field matching (find DOB across any format)
- **Verdict:** ✅ KEEP (provides normalized field identifiers)

**Examples showing all 5 columns:**

**Example 1: Footer signature (shows context differences)**
```
original_text:               "Xavier"
ai_visual_interpretation:    "Xavier (footer name)"           ← Adds location context
visual_formatting_context:   "small text at bottom"           ← How it appears
location_context:            "page 1, bottom-right footer"    ← Human-readable location
unique_marker:               "signature_name"                 ← Semantic identifier
```

**Example 2: Immunization with disambiguation**
```
original_text:               "Fluvax (Influenza)"
ai_visual_interpretation:    "Fluvax (Influenza) second instance"  ← Disambiguates duplicate
visual_formatting_context:   "table row, standard text"            ← How it appears
location_context:            "page 1, immunization table row 6"    ← Human-readable location
unique_marker:               "influenza_immunization_2024"         ← Semantic identifier
```

### Summary:
**All 5 columns serve distinct purposes - NO REDUNDANCY**

---

## 2. `processing_priority` - AI Generated or Code Inferred?

### How It's Generated:

**BACKEND COMPUTED** - NOT AI-generated

```typescript
// pass1-translation.ts lines 46-49
const priority = determineProcessingPriority(
  entity.classification.entity_category,  // From AI
  entity.classification.entity_subtype    // From AI
);
// Backend function computes priority from AI's classification
```

**AI Prompt Check:** ❌ NOT in prompt (AI doesn't generate this)

### Priority Levels:

| Priority | Entity Types | Pass 2 Handling |
|----------|--------------|-----------------|
| `highest` | vital_sign, diagnosis, allergy | Process first (safety critical) |
| `high` | medication, procedure, lab_result | Process second |
| `medium` | patient_identifier, provider_identifier | Process third |
| `low` | header, footer, logo | Skip Pass 2 |

### Will It Be Used?

**YES - CRITICAL FOR PASS 2**

Used for:
- Queue prioritization (critical entities first)
- Resource allocation (high-priority → expensive AI models)
- Safety routing (`highest` → safety review queue)
- Timeout management (defer low-priority if queue full)

### Verdict:
✅ **KEEP** - Essential for Pass 2 routing (but code-inferred, not AI-generated)

---

## 3. Green Chain Link Symbol - What Does It Mean?

**Answer: FOREIGN KEY RELATIONSHIP**

The green chain link icon (🔗) indicates a **foreign key** to another table.

**Examples:**
- `final_event_id` 🔗 `healthcare_events.id`
- `final_encounter_id` 🔗 `healthcare_encounters.id`

**Current State:** NULL in Pass 1 (populated by Pass 2)

**Purpose:**
- Data integrity (can't link to non-existent records)
- Tracing entity → final enriched record
- Visual navigation in Supabase (click chain to jump to record)

---

## 4. `pass1_model_used` & `pass1_vision_processing` - AI or Code?

### Current Implementation:

**CODE INJECTED** - NOT AI-generated

```typescript
// pass1-translation.ts lines 94-95
pass1_model_used: sessionMetadata.model_used,              // 'gpt-5-mini'
pass1_vision_processing: sessionMetadata.vision_processing, // true

// Copied to EVERY entity (40 entities × 2 columns = 80 redundant fields)
```

### The Problem:

**MASSIVE REDUNDANCY**
- All 40 entities have same `pass1_model_used = 'gpt-5-mini'`
- All 40 entities have same `pass1_vision_processing = true`
- Already stored in `pass1_entity_metrics` table (single source of truth)

### Recommendation:

❌ **REMOVE BOTH COLUMNS** from `entity_processing_audit`

**Use JOIN when needed:**
```sql
SELECT m.model_used, m.vision_processing
FROM entity_processing_audit e
JOIN pass1_entity_metrics m ON m.shell_file_id = e.shell_file_id
WHERE e.id = '...';
```

**Impact:** Saves 80 DB fields per 40-entity document

---

## 5. `validation_flags` & `compliance_flags` - Why Empty?

### What They Are:

**ARRAY COLUMNS** for quality/compliance issues

```sql
validation_flags TEXT[]    -- ["low_confidence", "high_discrepancy"]
compliance_flags TEXT[]    -- ["pii_detected", "age_mismatch"]
```

**Current State:** Empty arrays `[]`

### Why Empty:

**MAPPING GAP** - AI outputs flags, translation code doesn't capture them

```typescript
// AI Response (from prompt lines 221, 227):
{
  "quality_assessment": { "quality_flags": ["low_confidence"] },
  "profile_safety": { "safety_flags": ["identity_uncertainty"] }
}

// Translation code (pass1-translation.ts):
// ❌ MISSING: No code to extract these arrays
```

### Recommendation:

✅ **FIX THE MAPPING** - Add to `pass1-translation.ts`:

```typescript
validation_flags: aiResponse.quality_assessment?.quality_flags || [],
compliance_flags: aiResponse.profile_safety?.safety_flags || [],
```

**Why Fix:**
- Healthcare compliance requires flagging (HIPAA, age verification)
- Quality assurance needs issue tracking
- AI already generates these (just not captured)

**Alternative:** Remove columns + prompt instructions if not needed

---

## Summary Table - Column Recommendations

| Column | Source | Verdict | Reason |
|--------|--------|---------|--------|
| `original_text` | AI | ✅ KEEP | Primary data for Pass 2 |
| `ai_visual_interpretation` | AI | ✅ KEEP | QA field with 5% helpful context |
| `visual_formatting_context` | AI | ✅ KEEP | Semantic context (bold, indented, etc.) |
| `location_context` | AI | ✅ KEEP | Human-readable spatial context |
| `unique_marker` | AI | ✅ KEEP | Semantic field identifier (50% normalized labels) |
| `processing_priority` | Backend | ✅ KEEP | Essential for Pass 2 routing |
| `pass1_model_used` | Backend | ❌ REMOVE | Duplicated session data (use JOIN) |
| `pass1_vision_processing` | Backend | ❌ REMOVE | Duplicated session data (use JOIN) |
| `validation_flags` | AI (unmapped) | ⚠️ FIX | Add extraction code |
| `compliance_flags` | AI (unmapped) | ⚠️ FIX | Add extraction code |

---

## Next Steps

### Immediate Actions:

1. **Remove Redundant Columns:**
   ```sql
   ALTER TABLE entity_processing_audit
     DROP COLUMN pass1_model_used,
     DROP COLUMN pass1_vision_processing;
   ```

2. **Fix Flag Mapping:**
   ```typescript
   // Add to pass1-translation.ts around line 125:
   validation_flags: aiResponse.quality_assessment?.quality_flags || [],
   compliance_flags: aiResponse.profile_safety?.safety_flags || [],
   ```

3. **Update Queries:**
   - Replace `pass1_model_used` queries with JOIN to `pass1_entity_metrics`

### Impact:

- **Database:** Save 80 fields per 40-entity document
- **Code:** Cleaner architecture (single source of truth)
- **Compliance:** Capture quality/safety flags for healthcare workflows

---

**Last Updated:** 2025-10-08
