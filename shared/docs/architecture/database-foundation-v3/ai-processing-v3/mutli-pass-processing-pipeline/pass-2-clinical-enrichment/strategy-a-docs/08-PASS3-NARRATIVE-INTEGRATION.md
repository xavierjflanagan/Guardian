# 08 - Pass 3 Narrative Integration

**Created:** 2025-12-04
**Status:** Reference Document
**Owner:** Xavier
**Purpose:** Explain how Pass 3 narratives integrate with Pass 2 extracted entities

---

## Executive Summary

Pass 2 extracts clinical entities to database tables. Pass 3 creates semantic relationships between those entities through clinical narratives. This document explains the integration points and clarifies why Pass 2 does NOT handle inter-entity relationships.

**Key Principle:** Pass 2 extracts. Pass 3 connects.

---

## The Pass 2 / Pass 3 Boundary

### Pass 2: Clinical Extraction (Single API Call)

Pass 2 receives OCR text with encounter context and outputs structured clinical data:

**Input:**
- OCR text for encounter batch
- Relevant bridge schemas
- Encounter metadata

**Processing (within single API call):**
- Discovers all clinical entities in the text
- Classifies each entity (activity_type, clinical_purposes[])
- Extracts structured data per bridge schema

**Output:**
- Database rows in hub table (patient_clinical_events)
- Database rows in spoke tables (medications, conditions, vitals, symptoms, etc.)

**What Pass 2 Does NOT Do:**
- Create relationships between entities
- Link symptoms to conditions
- Build narrative structures
- Populate `primary_narrative_id` on entity records

### Pass 3: Narrative Generation (Single API Call)

Pass 3 receives extracted entities and creates semantic narratives:

**Input:**
- Extracted entities from Pass 2 (database query)
- Patient context (relevant history from other encounters)
- Encounter metadata

**Processing (within single API call):**
- Identifies clinical storylines (narratives)
- Determines which entities belong to which narratives
- Creates parent-child narrative relationships
- Links entities to narratives

**Output:**
- Narrative records (clinical_narratives table)
- Narrative relationships (narrative_relationships table)
- Entity-to-narrative links (narrative_event_links table)
- Updated `primary_narrative_id` on entity records

---

## The Linking Mechanism

### How Symptoms Link to Conditions

The common question: "How does a symptom record know it's related to a condition?"

**Answer:** Pass 3 creates the link via narrative_event_links.

**Example Flow:**

```
Document contains:
  "Chief complaint: chest pain, worse with exertion"
  "Assessment: coronary artery disease"
  "Plan: aspirin 81mg daily"

Pass 2 extracts (no relationships):
  patient_symptoms: { symptom_description_verbatim: "chest pain, worse with exertion" }
  patient_conditions: { condition_name: "coronary artery disease" }
  patient_medications: { medication_name: "aspirin 81mg" }

Pass 3 creates:
  clinical_narratives: {
    id: "narrative-123",
    narrative_purpose: "cardiac_workup",
    ai_narrative_summary: "Evaluation and treatment of coronary artery disease"
  }

  narrative_event_links:
    { narrative_id: "narrative-123", event_id: "symptom-uuid", relationship_type: "triggered_by" }
    { narrative_id: "narrative-123", event_id: "condition-uuid", relationship_type: "diagnosis" }
    { narrative_id: "narrative-123", event_id: "medication-uuid", relationship_type: "treatment" }

Pass 3 also updates:
  patient_symptoms.primary_narrative_id = "narrative-123"
  patient_conditions.primary_narrative_id = "narrative-123"
  patient_medications.primary_narrative_id = "narrative-123"
```

### The primary_narrative_id Column

Every spoke table includes a `primary_narrative_id` column (nullable).

**Purpose:** Quick UX lookup for "what narrative does this entity belong to?"

**Populated by:** Pass 3 (NOT Pass 2)

**When multiple narratives:** Entity can appear in multiple narratives via narrative_event_links, but primary_narrative_id points to the most relevant one.

---

## Why Pass 2 Doesn't Handle Relationships

### 1. Separation of Concerns

Pass 2's job is accurate extraction. Adding relationship logic would:
- Increase prompt complexity
- Increase token usage
- Increase error surface
- Conflate two distinct cognitive tasks

### 2. Context Limitations

Pass 2 operates on a single encounter batch. Proper narrative creation often requires:
- Patient history from other encounters
- Understanding of chronic vs acute conditions
- Temporal context spanning multiple documents

Pass 3 has access to this broader context.

### 3. Relationship Complexity

Inter-entity relationships are not simple 1:1 mappings:
- One symptom can relate to multiple conditions
- One condition can have multiple treatments
- Relationships have types (triggered_by, treatment_for, monitored_by)
- Narratives can be nested (parent-child)

This complexity belongs in a dedicated pass.

### 4. Y-Zone Auto-Linking Rejected

We considered having Pass 2 output y-coordinate zones to auto-link spatially proximate entities. This was rejected because:
- Too many output tokens
- High false positive risk (proximity != relationship)
- Pass 3 narratives solve the problem more elegantly

---

## Database Tables Involved

### Pass 2 Target Tables

Hub:
- `patient_clinical_events` - Every entity gets a hub record

Spokes (existing):
- `patient_medications`
- `patient_conditions`
- `patient_allergies`
- `patient_vitals`
- `patient_observations`
- `patient_interventions`
- `patient_immunizations`

Spokes (Tier 1 new):
- `patient_symptoms` (blob approach)
- `patient_family_history`
- `patient_social_history`
- `patient_travel_history`
- `patient_lab_results` (split from observations)
- `patient_procedures` (split from interventions)

### Pass 3 Target Tables

- `clinical_narratives` - The narrative records
- `narrative_relationships` - Parent-child narrative connections
- `narrative_event_links` - Entity-to-narrative connections

### Integration Column

All spoke tables include:
```sql
primary_narrative_id UUID REFERENCES clinical_narratives(id)
```

This column is:
- Nullable (Pass 2 leaves it NULL)
- Populated by Pass 3 after narrative creation
- Used for UX display ("View related narrative")

---

## Processing Flow

```
Document Upload
     |
     v
Pass 0.5: Encounter Discovery
     |
     v
Pass 1: Schema Routing (identifies needed bridge schemas)
     |
     v
Pass 2: Clinical Extraction
     |  - Single API call
     |  - Extracts entities to hub + spokes
     |  - Leaves primary_narrative_id NULL
     |
     v
Pass 3: Narrative Generation
     |  - Single API call
     |  - Creates narratives from extracted entities
     |  - Creates narrative_event_links
     |  - Updates primary_narrative_id on entities
     |
     v
Frontend Display
     - Timeline shows entities
     - "View Narrative" button uses primary_narrative_id
     - Narrative view shows all linked entities
```

---

## Related Documentation

### Pass 2 Architecture
- **Master Document:** `PASS2-STRATEGY-A-MASTER.md`
- **Hub-and-Spoke Pattern:** `04-HUB-AND-SPOKE-DATABASE-PATTERN.md`
- **Spoke Evolution:** `07-SPOKE-TABLE-EVOLUTION-ROADMAP.md`

### Narrative Architecture (Full Details)
- **Draft Vision:** `V3_Features_and_Concepts/narrative-architecture/NARRATIVE-ARCHITECTURE-DRAFT-VISION.md`
- **Relationship Model:** `V3_Features_and_Concepts/narrative-architecture/narrative-relationship-model.md`
- **Timeline Integration:** `V3_Features_and_Concepts/narrative-architecture/timeline-narrative-integration.md`
- **Proposed Updates:** `V3_Features_and_Concepts/narrative-architecture/PROPOSED-UPDATES-2025-09-18.md`

### Semantic Document Architecture
- **Shell Files and Clinical Narratives:** `v3-pipeline-planning/07-semantic-document-architecture.md`
- **Clinical Journeys:** `v3-pipeline-planning/08-clinical-journeys-architecture.md`

---

**Last Updated:** 2025-12-04
