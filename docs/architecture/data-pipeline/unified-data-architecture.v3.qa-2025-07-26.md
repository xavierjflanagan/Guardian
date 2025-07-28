# Guardian Unified Data Architecture v3 - Q&A Session
**Date:** July 26, 2025  
**Context:** Comprehensive review of v3 architecture addressing implementation concerns and real-world scenarios

---

## Summary of Questions Asked

1. **Clinically-Aware Lifecycle Concerns** - Worried about editing previous rows and data not showing in document explorer due to superseded status
2. **Database ID Pattern** - Confusion about why tables have both `id` and `document_id` columns
3. **Database Index Purpose** - What does the document_representations index accomplish
4. **Page Numbering Logic** - How page numbers are assigned and handling multi-format uploads including API ingestion
5. **Patient ID Usage** - Why patient_id exists in medication table and population health implications
6. **Data Presentation Strategy** - Should users see original vs normalized data on dashboard
7. **Valid From Precision** - Hierarchy for displaying date precision on dashboard
8. **Superseded By Relationship** - Use case scenarios and audit trail functionality
9. **International Healthcare Standards** - Handling country-specific codes (Australia focus) and AI extrapolation for severity/category
10. **Patient Identifiers** - Whether patient_id comes from app vs documents, and storing provider-specific patient IDs
11. **Allergies Evidence & Healthcare Touchpoints** - Need for evidence field and comprehensive healthcare encounter logging
12. **Polymorphic Relationships** - Understanding NOT NULL constraints in medical_data_relationships
13. **Relationship Types Controlled Vocabulary** - Purpose and use cases for standardized relationship terminology
14. **Rule Engine Framework** - How the clinically-aware lifecycle management actually works
15. **Materialized Views** - What they are and why they're needed for performance

---

## Q1: Clinically-Aware Lifecycle Concerns
*Concerned about editing previous rows from previous document uploads and data not appearing in document explorer view due to superseded status*

**We NEVER edit previous rows.** The lifecycle management is **append-only**:

**Example Scenario:**
```
Document 1 (Jan 2023): "Patient taking Lipitor 20mg daily"
→ Creates: patient_medications row with status='active', valid_from='2023-01-15'

Document 2 (Jun 2024): "Stopped Lipitor due to side effects, started Crestor"
→ Creates: NEW row for Lipitor with status='ceased', valid_to='2024-06-01'  
→ Creates: NEW row for Crestor with status='active', valid_from='2024-06-01'
→ Original Lipitor row remains UNCHANGED
```

**Document Explorer View:** Shows ALL extractions from that specific document, regardless of current status. If Document 1 extracted "Lipitor 20mg daily", that's exactly what shows in Document 1's view.

**Dashboard View:** Shows current clinical picture - active medications only.

---

## Q2: Database ID Pattern
*Why do tables have both `id` UUID and `document_id` UUID - knowledge gap about this pattern*

**Database Design Pattern:**
- `id` = Primary key for THIS specific row (unique identifier for this representation)
- `document_id` = Foreign key pointing to which document this belongs to

**Example:**
```
Document: "Lab_Report_March.pdf" (id: doc-123)
├── Representation 1: Original PDF (id: rep-456, document_id: doc-123)
├── Representation 2: OCR Text (id: rep-789, document_id: doc-123)  
└── Representation 3: AI JSON (id: rep-999, document_id: doc-123)
```

Each representation needs its own ID, but they all reference the same parent document.

---

## Q3: Database Index Purpose
*What does the CREATE INDEX idx_document_representations_document_type accomplish*

```sql
CREATE INDEX idx_document_representations_document_type 
ON document_representations(document_id, representation_type);
```

**This creates a "lookup table" for fast queries like:**
- "Show me all OCR representations for document X"
- "Find the AI JSON for document Y"

**Without index:** Database scans entire table (slow)
**With index:** Database jumps directly to the right rows (fast)

---

## Q4: Page Numbering Logic
*How page numbers are assigned by AI vs document pages, handling different upload methods, and schema flexibility for API ingestion*

**Page numbers are assigned by the AI model** during extraction. Here's how different scenarios work:

**Upload Scenarios:**
1. **Single Image (phone photo):** `page_number = 1`
2. **Multi-page PDF:** `page_number = 1, 2, 3...` (AI identifies each page)
3. **Multiple single images:** Each gets `page_number = 1` but different `document_id`

**API Ingestion Flexibility:**
```json
// API payload can handle messy data:
{
  "patient_id": "user-123",
  "source_type": "api_import",
  "raw_data": {
    "medications": ["Lipitor 20mg", "Aspirin"],
    "conditions": "diabetes, hypertension",
    "provider": "Dr. Smith"
  }
}
```

The schema handles this through `unclassified_data` table for anything that doesn't fit standard patterns.

---

## Q5: Patient ID Usage
*Why patient_id exists in medication table when data should be sandboxed, wondering if it's for population health analysis*

**You're exactly right about population health!**

- `id`: Unique identifier for this specific medication record
- `patient_id`: Which user this belongs to (enables population analysis)  
- `medication_id`: Links to canonical medication in `medications_master`

**Population Health Use Cases:**
- "How many users take statins?" 
- "What's the most common diabetes medication?"
- "Drug safety alerts for users taking specific medications"

**RLS ensures users only see their own data**, but admins can run aggregate queries.

---

## Q6: Data Presentation Strategy
*Should dashboard show normalized data vs original extracted values that users are familiar with from their doctors*

**You're absolutely right!** Frontend should show:

**Dashboard Display:**
```
"Lipitor 20mg daily" (Atorvastatin - Statin)
└── Original: "Lipitor 20mg daily" 
└── Normalized: 20mg Atorvastatin, once daily
```

**This is frontend logic**, but the database stores both to enable either presentation style.

---

## Q7: Valid From Precision
*Need proper hierarchy for displaying date precision when multiple parameters exist*

**Hierarchy for Frontend Display:**
1. **Explicit Date:** Show exact date with high confidence
2. **Document Date:** Show "Since at least [Document Date]" with medium confidence  
3. **Upload Date:** Show "Since at least [Upload Date]" with low confidence

The `valid_from_precision` field tells the frontend which scenario applies, enabling appropriate user messaging about data certainty.

---

## Q8: Superseded By Relationship
*Explain the superseded_by UUID reference and use cases*

**Scenario:** Patient has multiple doctor visits with conflicting medication info:

```
Document A (March): "Patient taking Metformin 500mg twice daily"
Document B (June): "Increased Metformin to 1000mg twice daily"

Result:
Row 1: Metformin 500mg, valid_from=March, valid_to=June, superseded_by=Row2_ID
Row 2: Metformin 1000mg, valid_from=June, valid_to=NULL (current)
```

**Dashboard shows:** Current 1000mg dose
**History shows:** Full progression 500mg→1000mg

This creates an **audit trail**:
```sql
superseded_by UUID REFERENCES patient_medications(id)
```

**Enables queries like:**
- "Show me the progression of this patient's diabetes medications"
- "What was the dosage before the current one?"
- "Why was this medication changed?"

---

## Q9: International Healthcare Standards
*Handling country-specific codes (Australia), AI extrapolation for severity/category, and conditions master table*

**Great catch!** We need country-specific handling:

**Australia-specific additions needed:**
```sql
ALTER TABLE patient_conditions ADD COLUMN aus_snomed_code TEXT;
ALTER TABLE medications_master ADD COLUMN pbs_code TEXT; -- Pharmaceutical Benefits Scheme
ALTER TABLE medications_master ADD COLUMN country_codes TEXT[] DEFAULT '{"AU"}';
```

**For severity/category:**
- **Severity:** Only filled if explicitly mentioned in text (no AI extrapolation)
- **Category:** Can be deterministically looked up from conditions master table (like medications)

We'll need a `conditions_master` table similar to `medications_master`.

---

## Q10: Patient Identifiers
*Whether patient_id comes from app vs documents, and storing provider-specific patient identifiers*

**`patient_id` comes from our app** (the authenticated user uploading the document).

**But you're right - we need to capture provider IDs too!**

**Enhanced schema needed:**
```sql
ALTER TABLE patient_lab_results ADD COLUMN provider_patient_ids JSONB DEFAULT '{}';
-- Example: {"hospital_a": "MRN-12345", "clinic_b": "PT-67890"}
```

**This enables:**
- Matching records across different uploads from same provider
- Understanding patient's healthcare network
- Data validation and duplicate detection

---

## Q11: Allergies Evidence & Healthcare Touchpoints
*Need evidence field for allergies and comprehensive healthcare encounter logging system*

**Brilliant insight!** We need both:

**Enhanced Allergies Table:**
```sql
ALTER TABLE patient_allergies ADD COLUMN evidence_summary TEXT;
ALTER TABLE patient_allergies ADD COLUMN healthcare_encounter_id UUID REFERENCES healthcare_encounters(id);
```

**New Table for Healthcare Touchpoints:**
```sql
CREATE TABLE healthcare_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    encounter_type TEXT NOT NULL, -- 'emergency', 'outpatient', 'specialist', 'diagnostic'
    encounter_date TIMESTAMPTZ,
    provider_name TEXT,
    facility_name TEXT,
    chief_complaint TEXT,
    summary TEXT,
    outcome TEXT,
    
    -- Links to source documents
    primary_document_id UUID REFERENCES documents(id),
    related_document_ids UUID[] DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Frontend Flow:**
"Anaphylactic reaction to peanuts (Hospital admission 2023-03-15) [View Full Encounter]"

---

## Q12: Polymorphic Relationships
*Understanding NOT NULL constraints in medical_data_relationships table*

**Polymorphic Relationships** mean one table can reference different types of records:

**Example Scenario:**
```sql
-- Lipitor treats High Cholesterol
source_table: 'patient_medications'
source_id: 'lipitor-record-uuid'
target_table: 'patient_conditions'  
target_id: 'cholesterol-record-uuid'
relationship_type: 'treats'
```

**The NOT NULL constraint** ensures every relationship has both endpoints defined - you can't have a relationship without knowing what it connects.

---

## Q13: Relationship Types Controlled Vocabulary
*Purpose and use cases for the relationship_types table and controlled vocabulary*

**Controlled Vocabulary Use Case:**
```sql
-- Instead of free-form text like "helps with"
-- We use standardized terms: 'treats', 'monitors', 'caused_by'

relationship_types table enforces:
- 'treats' can only link medications → conditions
- 'monitors' can only link lab_results → conditions/medications  
- 'caused_by' can only link conditions → medications (side effects)
```

**Benefits:**
- Consistent relationship terminology across all data
- Prevents invalid relationships (can't say allergy "treats" condition)
- Enables powerful queries: "Show all conditions treated by this medication"
- Supports clinical decision support and drug interaction checking

**Real-world Example:**
Instead of chaotic free-form relationships like "helps", "fixes", "good for", we have:
- "Metformin **treats** Type 2 Diabetes"
- "HbA1c test **monitors** Type 2 Diabetes" 
- "Muscle pain **caused_by** Lipitor"

---

## Q14: Rule Engine Framework
*How the clinically-aware lifecycle management system actually works*

**The Rule Engine manages temporal data logic:**

**Example Rules:**
```yaml
medication_cessation_rule:
  trigger: "new document mentions medication stopped"
  action: "set valid_to date, status=ceased"
  
medication_continuation_rule:  
  trigger: "medication mentioned again after gap"
  action: "create new active record"
  
medication_dosage_change_rule:
  trigger: "same medication with different dosage"
  action: "supersede previous record, create new active record"
```

**Implementation:** PostgreSQL triggers that fire when new data is inserted, applying these rules automatically.

**Database Table:**
```sql
CREATE TABLE lifecycle_rules (
    id UUID PRIMARY KEY,
    table_name TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    rule_definition JSONB NOT NULL, -- YAML rules stored as JSON
    priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true
);
```

**Benefits:**
- Automated clinical logic without manual intervention
- Consistent handling of temporal data across all clinical tables
- Extensible rule system for new scenarios
- Audit trail of all automated decisions

---

## Q15: Materialized Views
*What materialized views are and why they're needed*

**Materialized Views = Pre-calculated Summary Tables**

**Problem:** Complex queries are slow:
```sql
-- This query is expensive to run every time:
SELECT patient_id, 
       COUNT(*) as active_medications,
       COUNT(*) as active_conditions
FROM patient_medications m, patient_conditions c 
WHERE m.status='active' AND c.status='active'...
```

**Solution:** Pre-calculate and store the result:

**Materialized View:**
```sql
-- Creates a physical table with pre-computed results
CREATE MATERIALIZED VIEW patient_active_summary AS [complex query]

-- Dashboard queries become instant:
SELECT * FROM patient_active_summary WHERE patient_id = 'user-123';
```

**Trade-off:**
- **Benefit:** Lightning-fast dashboard loads (milliseconds vs seconds)
- **Cost:** Needs periodic refresh when underlying data changes

**Use Case:** Dashboard summary cards showing "5 active medications, 3 conditions" load instantly instead of taking seconds to calculate.

**Real-world Impact:**
- User opens dashboard: < 100ms load time
- Without materialized views: 2-5 second load time
- Critical for user experience at scale

---

## Key Architectural Insights from Q&A

### Critical Design Gaps Identified:
1. **Healthcare touchpoints table** needed for comprehensive encounter tracking
2. **Country-specific medical coding** requires planning for international expansion
3. **Provider patient ID tracking** essential for data correlation
4. **Evidence fields** add significant clinical value to allergies/conditions
5. **Original vs normalized presentation** strategy crucial for user experience

### Design Principles Reinforced:
- **Append-only architecture** preserves complete audit trail
- **Polymorphic relationships** enable flexible medical data connections
- **Performance optimization** through indexes and materialized views
- **Clinical safety** through controlled vocabularies and validation
- **International compatibility** through extensible coding systems

**These questions revealed several critical design considerations that strengthen the overall architecture for real-world healthcare data management.**