# Pass 2 Clinical Enrichment - Architectural Overview

**Date:** 2025-10-14
**Status:** Planning Phase
**Dependencies:** Pass 1 Entity Detection (operational), Pass 1.5 Medical Code Resolution (in design)

---

## Purpose

**Convert Pass 1 detected entities into structured clinical data following V3 hub-and-spoke database architecture.**

Pass 2 takes the entity detection results from Pass 1 (entity_processing_audit table) and extracts structured clinical information using AI-powered analysis combined with bridge schema guidance. The output populates Pass 2 database tables with healthcare-grade structured data.

---

## Key Architecture Principles

### 1. Encounter-First Processing

**All clinical events reference pre-created healthcare_encounters from Pass 0.5.**

```
Step 0: Load shell_file_manifest → encounter_id (pre-created by Pass 0.5)
  ↓
For each clinical entity:
  Step N.1: Create patient_clinical_events hub (with encounter_id)
  Step N.2: Create spoke record (observations/interventions/vitals)
  Step N.3: Assign medical code via Pass 1.5 vector embedding
```

### 2. Hub-and-Spoke Database Architecture (Migration 08)

**"Every clinical entity is a child of a patient_clinical_events hub record"**

- **Hub:** `patient_clinical_events` (central event with O3 classification, shell_file_id, encounter_id)
- **Spokes:** 7 clinical detail tables (observations, interventions, vitals, conditions, allergies, medications, immunizations)
- **Enforcement:** Composite foreign keys ensure patient_id consistency across hub and spokes

**Database Constraint Example:**
```sql
-- All 7 spoke tables enforce hub relationship
FOREIGN KEY (event_id, patient_id)
  REFERENCES patient_clinical_events(id, patient_id)
```

### 3. Two-Tier Bridge Schema System

**Dynamic schema loading based on document complexity:**

- **Detailed schemas (~1,500 tokens/schema):** For simple documents (1-3 clinical events)
- **Minimal schemas (~200 tokens/schema):** For complex documents (10+ clinical events)
- **Token savings:** 85-90% reduction when using minimal vs detailed
- **Total schemas:** 75 (25 tables × 3 tiers each)

**Location:** `shared/docs/architecture/database-foundation-v3/ai-processing-v3/bridge-schema-architecture/bridge-schemas/`

---

## Input and Output

### Input

**From Pass 0.5 (shell_file_manifest):**
- Pre-created healthcare_encounters with UUIDs
- Encounter metadata (type, dates, provider, facility, page ranges)

**From Pass 1 (entity_processing_audit):**
```sql
WHERE pass2_status = 'pending'
  AND entity_category IN ('clinical_event', 'healthcare_context')
```
- Entity text and classification
- Spatial information (bounding boxes, page numbers)
- Confidence scores and required schema mappings

### Output (to V3 Database)

**18 Pass 2 Tables:**

**Hub Table:**
- `patient_clinical_events` (central event record)

**Spoke Tables (7):**
- `patient_observations` (clinical measurements)
- `patient_interventions` (procedures, treatments)
- `patient_vitals` (BP, HR, temp, etc.)
- `patient_conditions` (diagnoses, problems)
- `patient_allergies` (allergic reactions, sensitivities)
- `patient_medications` (prescriptions, OTC)
- `patient_immunizations` (vaccines)

**Context Tables:**
- `healthcare_encounters` (visit-level grouping)

**Coding Tables:**
- `medical_code_assignments` (LOINC, SNOMED, RxNorm, PBS codes via Step 1.5)

**Additional Tables (10):**
- Various support tables for relationships, metadata, and audit trails

---

## Pass 1.5 Integration (Batch Preparation)

**Pass 1.5 medical code candidates are prepared BEFORE the Pass 2 AI call, similar to bridge schema loading.**

### Batch Processing Flow with Pass 1.5

```
┌─────────────────────────────────────────────────────────────┐
│ Pass 2 Worker Starts                                        │
│ 1. Fetch pending entities (40 entities from Pass 1)        │
│ 2. Group by required schemas (e.g., 20 vital sign entities)│
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ For Each Batch Group (e.g., 20 vital sign entities):       │
│                                                             │
│ Step A: Prepare Bridge Schemas                             │
│   - Load patient_vitals bridge schema (detailed/minimal)   │
│   - Load patient_observations bridge schema                │
│                                                             │
│ Step B: Prepare Medical Code Candidates (PASS 1.5) ⭐      │
│   FOR EACH entity in batch (parallel processing):          │
│     1. Read entity from entity_processing_audit            │
│     2. Select embedding text (Smart Entity-Type Strategy)  │
│     3. Generate embedding via OpenAI API                   │
│     4. Search universal_medical_codes (pgvector)           │
│     5. Search regional_medical_codes (pgvector, AUS)       │
│     6. Combine + rank + filter (5-20 candidates)           │
│                                                             │
│   RESULT: Map<entity_id, CodeCandidate[]>                  │
│   {                                                         │
│     entity1_id: [15 LOINC codes with similarity scores],  │
│     entity2_id: [12 LOINC codes with similarity scores],  │
│     ...                                                     │
│   }                                                         │
│                                                             │
│   OPTIONALLY: Store in pass15_code_candidates table        │
│   (for audit trail, debugging, AI training data)           │
│                                                             │
│ Step C: Single AI Call to Pass 2                           │
│   INPUT: {                                                  │
│     entities: [20 vital sign entities],                    │
│     bridgeSchemas: {vitals, observations},                 │
│     codeCandidates: {entity_id → [code candidates]}        │
│   }                                                         │
│   OUTPUT: {                                                 │
│     entity1: {                                              │
│       selected_code: "LOINC:85354-9",                      │
│       structured_data: {...}                               │
│     },                                                      │
│     entity2: {...},                                         │
│     ...                                                     │
│   }                                                         │
│                                                             │
│ Step D: Write Results                                      │
│   - Insert into patient_vitals (20 rows)                   │
│   - Insert into medical_code_assignments (20 rows)         │
│   - Update entity_processing_audit.pass2_status            │
└─────────────────────────────────────────────────────────────┘
```

### Pass 1.5 Worker Module

```typescript
// apps/render-worker/src/pass15/index.ts (isolated module)
export async function retrieveCodeCandidatesForBatch(
  entities: Entity[]
): Promise<Map<UUID, CodeCandidate[]>> {
  // All Pass 1.5 logic isolated in this module
}

// apps/render-worker/src/pass2/Pass2ClinicalEnricher.ts
import { retrieveCodeCandidatesForBatch } from '../pass15';

async function processPass2Batch(entities: Entity[]) {
  const bridgeSchemas = loadBridgeSchemasForBatch(entities);
  const codeCandidates = await retrieveCodeCandidatesForBatch(entities);  // Pass 1.5

  const result = await pass2AI(entities, bridgeSchemas, codeCandidates);
}
```

**See:** `../pass-1.5-medical-code-embedding/PASS-1.5-OVERVIEW.md` for complete Pass 1.5 architecture.

---

## Processing Flow

### Stage 0: Load Manifest (FIRST)

**Purpose:** Retrieve pre-created encounters from Pass 0.5

```typescript
// Load manifest created by Pass 0.5
const { data: manifest } = await supabase
  .from('shell_file_manifests')
  .select('manifest_data')
  .eq('shell_file_id', shellFileId)
  .single();

// Use pre-created encounter IDs
const encounterId = manifest.manifest_data.encounters[0].encounterId;
```

### Stage 1: Clinical Event Detection (Loop)

**For each Pass 1 clinical entity:**

**Stage 1.1: Create Hub Record**
```typescript
const eventHub = await createPatientClinicalEvent({
  entity_text: entity.entity_text,
  encounter_id: encounterId, // Link to Step 0 encounter
  patient_id: entity.patient_id,
  shell_file_id: entity.shell_file_id,
  activity_type: 'observation' | 'intervention', // O3 classification
  clinical_purposes: [...], // O3 classification
});
```

**Stage 1.2: Create Spoke Record**
```typescript
// Conditional based on activity_type
if (eventHub.activity_type === 'observation') {
  await createPatientObservation({
    event_id: eventHub.id,
    patient_id: entity.patient_id,
    // ... observation-specific fields
  });

  // If vital sign, also create patient_vitals record
  if (isVitalSign) {
    await createPatientVital({
      event_id: eventHub.id,
      patient_id: entity.patient_id,
      // ... vital-specific fields
    });
  }
}
```

**Stage 1.3: Assign Medical Code (Pass 1.5)**
```typescript
// Get code candidates from Pass 1.5 vector embedding
const codeCandidates = await getCodeCandidates({
  entity_text: entity.entity_text,
  entity_type: 'observation',
  top_k: 10
});

// AI selects best match with confidence
const codeAssignment = await assignMedicalCode({
  entity_id: spoke.id,
  entity_type: 'observation',
  code_candidates: codeCandidates,
  confidence_threshold: 0.80
});
```

### Stage 2: Audit Trail

**Metadata tracking:**
- Processing session details → `ai_processing_sessions`
- Confidence scores → `ai_confidence_scoring`
- Manual review flagging → `manual_review_queue`

---

## AI Model and Prompt Structure

### Model Selection

**Primary:** GPT-5-mini (gpt-5-mini-2025-08-07)
- Medical accuracy optimized
- Cost effective (~$0.003-0.006 per document)
- Fast processing (~3-5 seconds)

### Prompt Components

**System Prompt:**
- Role definition (clinical data extraction specialist)
- Hub-and-spoke architecture enforcement
- Encounter-first extraction priority
- Medical coding guidance (use Pass 1.5 candidates only)

**Document-Specific Prompt:**
- OCR text and spatial coordinates
- Pass 1 entity detection results
- Dynamically selected bridge schemas (detailed or minimal tier)
- Medical code candidates from Pass 1.5

**Response Format:**
- Structured JSON matching bridge schemas
- Confidence scores for each extraction
- Manual review flags when uncertain

---

## Success Metrics

### Extraction Quality
- **Extraction Completeness:** >95% of clinical entities successfully extracted
- **Database Write Success:** >99% successful writes to V3 tables
- **Referential Integrity:** 100% (hub-and-spoke FK constraints enforced)

### Performance Targets
- **Processing Time:** 3-5 seconds per document
- **Cost per Document:** $0.003-0.006 (GPT-5-mini with targeted schemas)
- **Token Efficiency:** 70% reduction vs single comprehensive AI call

### Medical Coding Accuracy
- **Code Assignment Rate:** >80% auto-accepted (confidence >= 0.80)
- **Manual Review Rate:** 10-20% (confidence 0.60-0.79)
- **Fallback Rate:** <10% (confidence < 0.60)

---

## Critical Dependencies

### Completed
1. **Pass 0.5 Encounter Discovery** - Operational on Render.com (creates healthcare_encounters + manifest)
2. **Pass 1 Entity Detection** - Operational on Render.com
3. **Bridge Schema System** - 75 schemas complete (source + detailed + minimal)
4. **Database Schema** - Migration 08 applied (hub-and-spoke architecture)

### In Progress
1. **Pass 1.5 Medical Code Resolution** - Vector embedding system for code candidate retrieval

### Pending
1. **Pass 2 Worker Implementation** - Render.com service for clinical enrichment
2. **Healthcare Encounter Definition** - Clear AI instructions for encounter identification
3. **Hypothesis Test Suite** - Production validation tests
4. **Database Audits** - Post-implementation table analysis

---

## Integration Points

### Upstream
**Pass 0.5:** shell_file_manifests table (pre-created encounters + metadata)
**Pass 1:** entity_processing_audit (WHERE pass2_status = 'pending', clinical/context entities only)

### Downstream (Pass 3)
- **Output tables:** 18 Pass 2 tables with structured clinical data
- **Handoff:** Structured JSON for narrative generation
- **Optimization:** Pass 3 processes structured data (not raw text) for cost savings

### Lateral (Pass 1.5)
- **Medical code candidates:** Top 10-20 matches from vector embedding
- **Code types:** LOINC, SNOMED, RxNorm (universal) + PBS, MBS (regional)
- **Integration point:** Between Pass 1 entity detection and Pass 2 enrichment

---

## File Locations

### Worker Implementation
- **Location:** `apps/render-worker/src/pass2/` (when created)
- **Structure:**
  - `Pass2ClinicalEnricher.ts` - Main enrichment class
  - `pass2-prompts.ts` - AI prompt templates
  - `pass2-types.ts` - TypeScript interfaces
  - `pass2-translation.ts` - AI response → database translation
  - `pass2-schema-mapping.ts` - Dynamic schema loading
  - `pass2-database-builder.ts` - Hub-and-spoke record builder

### Bridge Schemas
- **Source:** `bridge-schema-architecture/bridge-schemas/source/pass-2/` (25 .md files)
- **Detailed:** `bridge-schema-architecture/bridge-schemas/detailed/pass-2/` (25 .json files)
- **Minimal:** `bridge-schema-architecture/bridge-schemas/minimal/pass-2/` (25 .json files)

### Database Schema
- **Clinical core:** `current_schema/03_clinical_core.sql` (lines 280-835)
- **Job coordination:** `current_schema/08_job_coordination.sql`
- **Migration:** `migration_history/2025-09-30_08_enforce_hub_spoke_architecture.sql`

---

## Next Steps

1. **Complete Pass 1.5 design** - Medical code vector embedding system
2. **Define healthcare encounter concept** - Clear AI instructions and user value
3. **Design Pass 2 worker architecture** - Technical implementation plan
4. **Build schema loader** - Dynamic tier selection based on token budget
5. **Implement worker code** - Render.com service deployment
6. **Create hypothesis tests** - Production validation suite
7. **Deploy to production** - Monitoring and metrics collection

---

## Related Documentation

**Planning:**
- [01-planning.md](./archive/01-planning.md) - Original Pass 2 planning document
- [PASS-2-PROMPTS.md](./PASS-2-PROMPTS.md) - AI prompt templates

**Implementation:**
- [PASS-2-ARCHITECTURE.md](./archive/PASS-2-ARCHITECTURE.md) - Detailed technical architecture (PLACEHOLDER)
- [PASS-2-WORKER-IMPLEMENTATION.md](./archive/PASS-2-WORKER-IMPLEMENTATION.md) - Worker code spec (PLACEHOLDER)

**Bridge Schemas:**
- `../../bridge-schema-architecture/README.md` - Three-tier system overview
- `../../bridge-schema-architecture/BRIDGE_SCHEMA_BUILD_PROCESS.md` - Assembly line process

**Database:**
- `../../../current_schema/03_clinical_core.sql` - Clinical tables
- `../../../migration_history/2025-09-30_08_enforce_hub_spoke_architecture.sql` - Migration 08

**Pass 1 Reference:**
- `../pass-1-entity-detection/PASS-1-OVERVIEW.md` - Reference architecture

---

**Last Updated:** 2025-10-14
**Status:** Planning Phase - Folder structure creation in progress
