# Phase 3: Pass 2 Clinical Enrichment - Planning

**Date:** 30 September 2025
**Status:** Planning Phase
**Dependencies:** Phase 2 (Pass 1 Entity Detection) completion
**Purpose:** Extract structured clinical data using three-tier bridge schemas with hub-and-spoke architecture

---

## 🎯 **PASS 2 OVERVIEW**

### **Purpose: Structured Clinical Data Extraction**
**Goal:** Convert classified entities into structured clinical data following the V3 database hub-and-spoke architecture
**AI Model:** GPT-5-mini (accuracy-optimized for medical precision) same as pass 1 for now..

### **Input (from Pass 1)**
Pass 1 provides entity detection results with three categories:
- `clinical_event`: Medical observations, interventions requiring full enrichment
- `healthcare_context`: Encounter details, provider info, demographics
- `document_structure`: Non-clinical formatting elements (skipped in Pass 2)

### **Output (to V3 Database)**
Structured clinical data across hub-and-spoke tables:
- **Hub:** `patient_clinical_events` (central event record with O3 classification)
- **Spokes:** `patient_observations`, `patient_interventions`, `patient_vitals`, etc.
- **Context:** `healthcare_encounters` (visit-level grouping)
- **Coding:** `medical_code_assignments` (LOINC/SNOMED/RxNorm/PBS codes via Step 1.5 vector embedding)

---

## 🏗️ **THREE-TIER BRIDGE SCHEMA ARCHITECTURE**

### **Schema Complexity Tiers**
Pass 2 uses dynamic schema loading based on document complexity and token budget:

**Location:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/bridge-schema-architecture/bridge-schemas/`

```
bridge-schemas/
├── source/pass-2/           # Human reference (Markdown) - NOT sent to AI
│   └── [table_name].md      # Complete SQL + TypeScript + validation notes
├── detailed/pass-2/         # Default AI processing (JSON)
│   └── [table_name].json    # Rich medical context, multiple examples (~1,500 tokens/schema)
└── minimal/pass-2/          # Token-optimized fallback (JSON)
    └── [table_name].json    # Condensed format, single example (~200 tokens/schema)
```

**Schema Selection Strategy:**
- **Simple documents (1-3 clinical events):** Use detailed schemas (~27K tokens for all 18 tables)
- **Complex documents (10+ clinical events):** Use minimal schemas (~3.6K tokens for all 18 tables)
- **Token savings:** 85-90% reduction (minimal vs detailed)

**Reference:** See `bridge-schema-architecture/BRIDGE_SCHEMA_BUILD_PROCESS.md` for schema creation assembly line

---

## 🎯 **HUB-AND-SPOKE ARCHITECTURE (Migration 08)**

### **Architectural Principle**
**"Every clinical entity is a child of a patient_clinical_events hub record"**

All clinical detail tables MUST reference a parent `patient_clinical_events` via `event_id`:
- **Hub:** `patient_clinical_events` (central event with O3 classification, shell_file_id, encounter_id)
- **Spokes:** 7 clinical detail tables (observations, interventions, vitals, conditions, allergies, medications, immunizations)

### **Key Database Constraints (from Migration 08)**
- All 7 spoke tables have `event_id UUID NOT NULL` referencing `patient_clinical_events(id)`
- Composite FKs enforce patient_id consistency: `FOREIGN KEY (event_id, patient_id) REFERENCES patient_clinical_events(id, patient_id)`
- patient_id denormalized on spoke tables for RLS performance (but validated via composite FK)

**Migration Reference:** `migration_history/2025-09-30_08_enforce_hub_spoke_architecture.sql`
**Source of Truth:** `current_schema/03_clinical_core.sql` (lines 280-835)

---

## 🏥 **ENCOUNTER-FIRST EXTRACTION PRIORITY**

### **Critical Discovery (30 Sept 2025)**
All clinical events within a single healthcare visit should reference the SAME `healthcare_encounters` record.

### **New Extraction Order:**

**Step 0: healthcare_encounters (FIRST - Sets Visit Context)**
- Extract broad clinical encounter details
- Returns `encounter_id`
- All subsequent clinical events reference this encounter via `patient_clinical_events.encounter_id`

**Then for each clinical detail (BP, HR, Temp, Medication, etc.):**
- Step N.1: Create `patient_clinical_events` hub (with `encounter_id` from Step 0)
- Step N.2: Create spoke record (observations/interventions/vitals)
- Step N.3: Assign medical code via `medical_code_assignments` (Step 1.5 vector embedding)

### **Example Flow: BP Document with 3 Vitals + 1 Medication**

```
Step 0: healthcare_encounters
  └─> encounter_id = "enc-123"

Event #1: Blood Pressure
  Step 1.1: patient_clinical_events (encounter_id: "enc-123") → event_id_bp
  Step 1.2: patient_observations (event_id: event_id_bp)
  Step 1.3: patient_vitals (event_id: event_id_bp)
  Step 1.4: medical_code_assignments (entity: observations, code: LOINC 85354-9)

Event #2: Heart Rate
  Step 2.1: patient_clinical_events (encounter_id: "enc-123") → event_id_hr
  Step 2.2: patient_observations (event_id: event_id_hr)
  Step 2.3: patient_vitals (event_id: event_id_hr)
  Step 2.4: medical_code_assignments (entity: observations, code: LOINC 8867-4)

Event #3: Temperature
  Step 3.1: patient_clinical_events (encounter_id: "enc-123") → event_id_temp
  Step 3.2: patient_observations (event_id: event_id_temp)
  Step 3.3: patient_vitals (event_id: event_id_temp)
  Step 3.4: medical_code_assignments (entity: observations, code: LOINC 8310-5)

Event #4: Lisinopril Continuation
  Step 4.1: patient_clinical_events (encounter_id: "enc-123") → event_id_med
  Step 4.2: patient_interventions (event_id: event_id_med)
  Step 4.3: medical_code_assignments (entity: interventions, code: RxNorm 314076 + PBS 8254K)
```

**Result:** 1 encounter + 4 events + 7 spoke records + 4 code assignments = 16 database records

---

## 🤖 **AI PROMPT STRUCTURE**

### **Overall Pass 2 Prompt Architecture**

The Pass 2 prompt will explain:
1. **Your role:** Extract structured clinical data from medical documents
2. **Extraction priority:** Always create `healthcare_encounters` FIRST
3. **Hub-and-spoke flow:** Create parent event before detail records
4. **Schema guidance:** How to use the provided bridge schemas
5. **Medical coding:** Use Step 1.5 vector embedding shortlists (never generate codes freely)
6. **Confidence scoring:** When to flag records for manual review
7. **Error handling:** What to do with ambiguous or missing data

**Prompt File:** See `PASS-2-PROMPTS.md` (to be created)

### **Schema Provision Strategy**

**For each document, Pass 2 will receive:**
- Context: `patient_id`, `shell_file_id`, Pass 1 entity detection results
- Document text: Full OCR text + spatial bounding boxes
- Bridge schemas: Dynamic selection based on Pass 1 results
  - Always include: `healthcare_encounters`, `patient_clinical_events`
  - Conditionally include: `patient_observations`, `patient_interventions`, `patient_vitals`, etc.
  - Tier: `detailed` (default) or `minimal` (token budget mode)

**Medical coding shortlists provided via Step 1.5:**
- Pre-computed vector embeddings for entity text
- Top 10-20 candidate codes from `universal_medical_codes` and `regional_medical_codes`
- AI selects best match, provides confidence score

---

## 📊 **PASS 2 PROCESSING STAGES**

### **Stage 1: healthcare_encounters Extraction**
- **Input:** Full document text, Pass 1 `healthcare_context` entities
- **Schema:** `healthcare_encounters.json` (detailed or minimal)
- **Output:** `encounter_id` for use in all subsequent events
- **Database:** Single INSERT to `healthcare_encounters`

### **Stage 2: Clinical Events Extraction (Loop)**
For each clinical entity detected in Pass 1:

**Stage 2.1: patient_clinical_events (Hub)**
- **Input:** Entity text, encounter_id from Stage 1
- **Schema:** `patient_clinical_events.json`
- **Output:** `event_id`, `activity_type`, `clinical_purposes` (O3 classification)
- **Database:** INSERT to `patient_clinical_events`

**Stage 2.2: Clinical Detail (Spoke)**
- **Input:** Entity text, event_id from Stage 2.1
- **Schema:** Conditional based on `activity_type`:
  - `activity_type: observation` → `patient_observations.json` (and `patient_vitals.json` if applicable)
  - `activity_type: intervention` → `patient_interventions.json`
- **Output:** Structured clinical data
- **Database:** INSERT to spoke table

**Stage 2.3: Medical Coding (Step 1.5)**
- **Input:** Spoke entity_id, entity text, vector embedding shortlist
- **Schema:** `medical_code_assignments.json`
- **Output:** Universal code (LOINC/SNOMED/RxNorm) + Regional code (PBS/MBS) + confidence
- **Database:** INSERT to `medical_code_assignments`

### **Stage 3: Audit Trail**
- Log processing metadata to `ai_processing_sessions`
- Track confidence scores to `ai_confidence_scoring`
- Flag low-confidence records to `manual_review_queue`

---

## 📐 **SUCCESS METRICS**

### **Clinical Data Extraction**
- **Extraction Completeness:** >95% of clinical entities successfully extracted
- **Database Write Success:** >99% successful writes to V3 tables
- **Referential Integrity:** 100% (hub-and-spoke FK constraints enforced)

### **Performance Targets**
- **Processing Time:** 3-5 seconds per document
- **Cost per Document:** $0.003-0.006 (GPT-4 with targeted schemas)
- **Token Efficiency:** 70% reduction vs single comprehensive AI call

### **Medical Coding Accuracy**
- **Code Assignment Rate:** >80% auto-accepted (confidence ≥ 0.80)
- **Manual Review Rate:** 10-20% (confidence 0.60-0.79)
- **Fallback Rate:** <10% (confidence < 0.60)

### **System Functionality**
- **Pass 2 Completion:** System fully functional with clinical data extraction
- **Timeline Integration:** Clinical events appear in UI timeline immediately
- **Audit Trail:** Complete processing provenance captured

---

## 🔗 **DEPENDENCIES**

**Phase 1: Bridge Schema System**
- All 18 Pass 2 bridge schemas completed (source + detailed + minimal)
- Schema loader implemented for dynamic tier selection

**Phase 2: Pass 1 Entity Detection**
- Entity classification provides targeted schema loading strategy
- Reduces Pass 2 token usage by skipping `document_structure` entities

**Database: V3 Schema (Migration 08 Applied)**
- Hub-and-spoke architecture enforced with composite FKs
- All 7 spoke tables have NOT NULL event_id
- healthcare_encounters supports encounter-first extraction flow

**Step 1.5: Medical Code Resolution**
- Vector embedding system operational for code candidate retrieval
- `universal_medical_codes` and `regional_medical_codes` tables populated

---

## 📁 **RELATED DOCUMENTATION**

**Bridge Schema Architecture:**
- `bridge-schema-architecture/BRIDGE_SCHEMA_BUILD_PROCESS.md` - Schema creation workflow
- `bridge-schema-architecture/README.md` - Three-tier architecture overview

**Database Schema:**
- `current_schema/03_clinical_core.sql` - Hub-and-spoke table definitions
- `migration_history/2025-09-30_08_enforce_hub_spoke_architecture.sql` - Migration 08 details

**Implementation Planning (this folder):**
- `01-planning.md` - This file (overview and architecture)
- `PASS-2-ARCHITECTURE.md` - Detailed technical architecture (to be created)
- `PASS-2-PROMPTS.md` - AI prompt engineering (to be created)
- `PASS-2-WORKER-IMPLEMENTATION.md` - Render.com worker code (to be created)

---

## 🎯 **NEXT STEPS**

1. **Complete bridge schema build** - Finish remaining 12 Pass 2 tables (assembly line process)
2. **Draft Pass 2 AI prompt** - Create comprehensive extraction prompt with encounter-first flow
3. **Design database write strategy** - Transaction patterns for hub-and-spoke atomic writes
4. **Implement schema loader** - Dynamic tier selection based on token budget
5. **Build Step 1.5 integration** - Vector embedding code resolution between Pass 1 and Pass 2

**Critical Success Factor:** After Pass 2 completion, the system is fully functional with clinical data extraction, database storage, and UI display operational.
