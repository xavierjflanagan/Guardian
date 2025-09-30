# healthcare_timeline_events Bridge Specification

**Database Table:** `healthcare_timeline_events`  
**AI Component:** timeline-generator  
**Purpose:** Bridge document for generating patient-friendly timeline metadata from clinical events  
**Reference:** [007_healthcare_journey.sql](../../../../database-foundation/implementation/sql/007_healthcare_journey.sql)

---

## Table Overview

The `healthcare_timeline_events` table transforms clinical data into patient-friendly timeline entries that power Guardian's healthcare journey visualization. Every clinical event must generate corresponding timeline metadata for the user experience.

**Critical Requirement:** This table provides the main interface between clinical data and patient experience - every `patient_clinical_events` record must generate at least one timeline event.

---

## Schema Reference

```sql
CREATE TABLE healthcare_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Display Categorization (AI Generated)
    display_category TEXT NOT NULL, -- 'visit', 'test_result', 'treatment', 'vaccination', 'screening'
    display_subcategory TEXT, -- 'annual_physical', 'blood_test', 'minor_procedure'
    
    -- User Interface Content (AI Generated)
    title TEXT NOT NULL, -- "Blood Pressure Check", "Flu Vaccination"
    summary TEXT, -- Brief patient-friendly description
    icon TEXT, -- UI icon identifier: 'stethoscope', 'flask', 'pill'
    
    -- Temporal Information
    event_date DATE NOT NULL,
    date_precision TEXT DEFAULT 'day' CHECK (date_precision IN ('year', 'month', 'day', 'hour')),
    
    -- Clinical Data Links (CRITICAL)
    clinical_event_ids UUID[] NOT NULL, -- Links to patient_clinical_events
    
    -- Search & Discovery (AI Generated)
    searchable_content TEXT, -- For AI chatbot and search
    event_tags TEXT[], -- For filtering: ['routine', 'urgent', 'followup']
    
    -- Timeline Visualization
    timeline_group TEXT, -- Group related events: 'diabetes_management', 'annual_checkup'
    display_order INTEGER DEFAULT 0, -- Order within same date
    
    -- User Interaction
    user_notes TEXT, -- Patient can add personal notes
    bookmarked BOOLEAN DEFAULT FALSE,
    hidden BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## AI Timeline Generation Model

### Display Category Classification

```yaml
display_category_rules:
  visit:
    triggers:
      - Physical exam events
      - Doctor consultations
      - Multiple events same date/provider
    subcategories: ['annual_physical', 'followup_visit', 'urgent_care', 'specialist_consult']
    icon_default: 'stethoscope'
    
  test_result:
    triggers:
      - Laboratory observations
      - Imaging studies
      - Diagnostic procedures
    subcategories: ['blood_test', 'imaging', 'cardiac_test', 'cancer_screening']
    icon_default: 'flask'
    
  treatment:
    triggers:
      - Medication interventions
      - Therapeutic procedures
      - Surgery events
    subcategories: ['medication', 'minor_procedure', 'major_surgery', 'therapy']
    icon_default: 'pill'
    
  vaccination:
    triggers:
      - Preventive interventions with vaccines
      - Immunization records
    subcategories: ['routine_vaccine', 'travel_vaccine', 'flu_shot']
    icon_default: 'syringe'
    
  screening:
    triggers:
      - Preventive observations
      - Health maintenance activities
    subcategories: ['cancer_screening', 'wellness_check', 'health_assessment']
    icon_default: 'search'
```

### AI Output Format

```typescript
interface TimelineEventGeneration {
  // Display Classification (REQUIRED)
  display_category: 'visit' | 'test_result' | 'treatment' | 'vaccination' | 'screening';
  display_subcategory?: string;
  
  // User Interface Content (REQUIRED)
  title: string; // Patient-friendly title
  summary?: string; // Brief description
  icon: string; // UI icon identifier
  
  // Event Grouping (OPTIONAL)
  timeline_group?: string; // Group related events
  display_order?: number; // Order within date
  
  // Search & Discovery (REQUIRED)
  searchable_content: string; // For AI search
  event_tags: string[]; // For filtering
  
  // Clinical Links (REQUIRED)
  clinical_event_ids: string[]; // Source clinical events
  
  // Context Metadata
  generation_confidence: number; // 0.0 - 1.0
  content_source: string; // What text generated this
}
```

---

## Timeline Generation Examples

### Example 1: Lab Result → Timeline Event

**Source Clinical Event:**
```json
{
  "id": "clinical-event-123",
  "activity_type": "observation",
  "clinical_purposes": ["diagnostic", "monitoring"],
  "event_name": "Complete Blood Count",
  "method": "laboratory",
  "event_date": "2024-07-15"
}
```

**Generated Timeline Event:**
```json
{
  "display_category": "test_result",
  "display_subcategory": "blood_test",
  "title": "Complete Blood Count Results",
  "summary": "Routine blood work to check overall health",
  "icon": "flask",
  "event_date": "2024-07-15",
  "clinical_event_ids": ["clinical-event-123"],
  "searchable_content": "CBC complete blood count hemoglobin white blood cells red blood cells platelets",
  "event_tags": ["laboratory", "routine", "monitoring"],
  "timeline_group": null,
  "display_order": 0
}
```

### Example 2: Multiple Clinical Events → Grouped Timeline Event

**Source Clinical Events:**
```json
[
  {
    "id": "clinical-event-456", 
    "event_name": "Blood Pressure Measurement",
    "activity_type": "observation"
  },
  {
    "id": "clinical-event-457",
    "event_name": "Physical Examination", 
    "activity_type": "observation"
  },
  {
    "id": "clinical-event-458",
    "event_name": "Influenza Vaccination",
    "activity_type": "intervention"
  }
]
```

**Generated Timeline Event:**
```json
{
  "display_category": "visit",
  "display_subcategory": "annual_physical",
  "title": "Annual Physical Exam",
  "summary": "Routine checkup including vitals, exam, and flu shot",
  "icon": "stethoscope",
  "event_date": "2024-09-20",
  "clinical_event_ids": ["clinical-event-456", "clinical-event-457", "clinical-event-458"],
  "searchable_content": "annual physical exam checkup blood pressure flu shot vaccination",
  "event_tags": ["routine", "annual", "preventive"],
  "timeline_group": "annual_wellness",
  "display_order": 0
}
```

### Example 3: Prescription → Timeline Event

**Source Clinical Event:**
```json
{
  "id": "clinical-event-789",
  "activity_type": "intervention",
  "clinical_purposes": ["therapeutic"],
  "event_name": "Antibiotic Prescription",
  "substance_name": "Amoxicillin 500mg"
}
```

**Generated Timeline Event:**
```json
{
  "display_category": "treatment",
  "display_subcategory": "medication",
  "title": "Antibiotic Prescription",
  "summary": "Amoxicillin prescribed for bacterial infection",
  "icon": "pill",
  "clinical_event_ids": ["clinical-event-789"],
  "searchable_content": "antibiotic prescription amoxicillin bacterial infection treatment",
  "event_tags": ["medication", "therapeutic", "antibiotic"],
  "timeline_group": "infection_treatment"
}
```

---

## Database Population Patterns

### Standard Timeline Event Creation

```sql
INSERT INTO healthcare_timeline_events (
    patient_id,
    display_category,
    display_subcategory,
    title,
    summary,
    icon,
    event_date,
    date_precision,
    clinical_event_ids,
    searchable_content,
    event_tags,
    timeline_group,
    display_order
) VALUES (
    $1::UUID,                    -- patient_id from clinical event
    $2::TEXT,                    -- display_category from AI
    $3::TEXT,                    -- display_subcategory from AI
    $4::TEXT,                    -- title from AI
    $5::TEXT,                    -- summary from AI
    $6::TEXT,                    -- icon from AI
    $7::DATE,                    -- event_date from clinical event
    $8::TEXT,                    -- date_precision (default 'day')
    $9::UUID[],                  -- clinical_event_ids array
    $10::TEXT,                   -- searchable_content from AI
    $11::TEXT[],                 -- event_tags array from AI
    $12::TEXT,                   -- timeline_group from AI (nullable)
    $13::INTEGER                 -- display_order from AI
) RETURNING id;
```

### Batch Timeline Generation

```sql
-- Generate timeline events for multiple clinical events
WITH clinical_events AS (
  SELECT id, patient_id, event_date, activity_type, clinical_purposes, event_name
  FROM patient_clinical_events
  WHERE source_document_id = $1::UUID
),
timeline_metadata AS (
  -- AI-generated timeline data would be provided as JSON parameter
  SELECT * FROM jsonb_to_recordset($2::JSONB) AS t(
    clinical_event_id UUID,
    display_category TEXT,
    title TEXT,
    summary TEXT,
    icon TEXT,
    searchable_content TEXT,
    event_tags TEXT[]
  )
)
INSERT INTO healthcare_timeline_events (
  patient_id, display_category, title, summary, icon, event_date,
  clinical_event_ids, searchable_content, event_tags
)
SELECT 
  ce.patient_id,
  tm.display_category,
  tm.title,
  tm.summary,
  tm.icon,
  ce.event_date,
  ARRAY[ce.id],
  tm.searchable_content,
  tm.event_tags
FROM clinical_events ce
JOIN timeline_metadata tm ON ce.id = tm.clinical_event_id;
```

---

## Content Generation Rules

### Title Generation

```yaml
title_generation_rules:
  observations:
    lab_results: "{test_name} Results"  # "Complete Blood Count Results"
    vital_signs: "{measurement} Check"  # "Blood Pressure Check"
    imaging: "{scan_type} Scan"        # "Chest X-Ray Scan"
    
  interventions:
    medications: "{medication_type}"    # "Antibiotic Prescription"
    procedures: "{procedure_type}"      # "Minor Surgery"
    vaccinations: "{vaccine_name}"      # "Influenza Vaccination"
    
  visits:
    routine: "{visit_type}"            # "Annual Physical Exam"
    specialty: "{specialist} Visit"     # "Cardiologist Consultation"
    urgent: "{urgency} Care Visit"      # "Urgent Care Visit"
```

### Summary Generation

```yaml
summary_generation_rules:
  purpose: "Brief, patient-friendly explanation"
  length: "10-25 words ideal"
  tone: "Reassuring and informative"
  
  examples:
    routine_test: "Regular blood work to monitor overall health"
    abnormal_result: "Blood test showed values outside normal range"
    medication: "{drug_name} prescribed for {condition}"
    vaccination: "Preventive shot to protect against {disease}"
    procedure: "{procedure_type} performed to {purpose}"
```

### Searchable Content Generation

```yaml
searchable_content_strategy:
  include:
    - Technical medical terms
    - Common patient language
    - Synonyms and variations  
    - Related conditions
    - Body parts and systems
    
  examples:
    blood_pressure: "blood pressure BP systolic diastolic hypertension heart cardiovascular"
    diabetes: "diabetes blood sugar glucose A1C hemoglobin insulin diabetic"
    vaccination: "vaccine shot immunization protection {disease_name}"
```

---

## Event Grouping Logic

### Timeline Group Detection

```typescript
function detectTimelineGroup(clinicalEvents: ClinicalEvent[]): string | null {
  // Group events by common themes
  const groupingRules = {
    'annual_wellness': ['annual', 'routine', 'preventive', 'screening'],
    'diabetes_management': ['glucose', 'insulin', 'A1C', 'diabetic'],
    'cardiac_care': ['heart', 'cardiac', 'blood pressure', 'EKG'],
    'infection_treatment': ['antibiotic', 'bacterial', 'viral', 'infection'],
    'pregnancy_care': ['prenatal', 'obstetric', 'pregnancy', 'fetal'],
    'cancer_screening': ['mammogram', 'colonoscopy', 'biopsy', 'tumor']
  };
  
  for (const [group, keywords] of Object.entries(groupingRules)) {
    const matchCount = clinicalEvents.filter(event => 
      keywords.some(keyword => 
        event.event_name.toLowerCase().includes(keyword) ||
        event.searchable_content?.toLowerCase().includes(keyword)
      )
    ).length;
    
    if (matchCount >= 2) return group;
  }
  
  return null;
}
```

### Display Order Calculation

```sql
-- Calculate display order for events on same date
WITH same_date_events AS (
  SELECT id, display_category, clinical_event_ids, event_date
  FROM healthcare_timeline_events
  WHERE patient_id = $1::UUID AND event_date = $2::DATE
),
priority_order AS (
  SELECT 
    id,
    CASE display_category
      WHEN 'visit' THEN 1        -- Visits first (context)
      WHEN 'test_result' THEN 2  -- Then results
      WHEN 'treatment' THEN 3    -- Then treatments
      WHEN 'vaccination' THEN 4  -- Then preventive
      WHEN 'screening' THEN 5    -- Then screening
      ELSE 6
    END as category_priority,
    array_length(clinical_event_ids, 1) as event_count -- More events = higher priority
  FROM same_date_events
)
UPDATE healthcare_timeline_events
SET display_order = (
  SELECT ROW_NUMBER() OVER (
    ORDER BY category_priority, event_count DESC, created_at
  )
  FROM priority_order po
  WHERE po.id = healthcare_timeline_events.id
);
```

---

## Quality & Validation

### Content Quality Checks

```typescript
function validateTimelineContent(event: TimelineEventGeneration): ValidationResult {
  const errors: string[] = [];
  
  // Title validation
  if (!event.title || event.title.length < 5) {
    errors.push("title must be descriptive (min 5 characters)");
  }
  
  if (event.title.toLowerCase().includes('unknown') || event.title.toLowerCase().includes('n/a')) {
    errors.push("title cannot be generic or placeholder");
  }
  
  // Category validation
  const validCategories = ['visit', 'test_result', 'treatment', 'vaccination', 'screening'];
  if (!validCategories.includes(event.display_category)) {
    errors.push("display_category must be valid");
  }
  
  // Clinical event links
  if (!event.clinical_event_ids || event.clinical_event_ids.length === 0) {
    errors.push("must link to at least one clinical event");
  }
  
  // Searchable content
  if (!event.searchable_content || event.searchable_content.length < 10) {
    errors.push("searchable_content must be meaningful for AI search");
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}
```

### Timeline Completeness Validation

```sql
-- Ensure every clinical event has timeline representation
SELECT 
  ce.id,
  ce.event_name,
  te.title IS NOT NULL as has_timeline_event
FROM patient_clinical_events ce
LEFT JOIN healthcare_timeline_events te ON ce.id = ANY(te.clinical_event_ids)
WHERE 
  ce.patient_id = $1::UUID 
  AND ce.created_at >= NOW() - INTERVAL '30 days'
  AND te.id IS NULL; -- Clinical events missing timeline events
```

---

## Performance Optimization

### Timeline Query Optimization

```sql
-- Optimized timeline query for UI display
SELECT 
  id,
  display_category,
  display_subcategory,
  title,
  summary,
  icon,
  event_date,
  event_tags,
  bookmarked
FROM healthcare_timeline_events
WHERE 
  patient_id = $1::UUID
  AND hidden = FALSE
  AND event_date BETWEEN $2::DATE AND $3::DATE
ORDER BY 
  event_date DESC,
  display_order ASC
LIMIT 50;

-- Uses composite index: (patient_id, event_date, display_order)
```

### Batch Timeline Updates

```sql
-- Update searchable content for existing timeline events
UPDATE healthcare_timeline_events
SET 
  searchable_content = updated_content.content,
  updated_at = NOW()
FROM (
  SELECT 
    id,
    regenerated_searchable_content as content
  FROM jsonb_to_recordset($1::JSONB) AS updates(
    id UUID,
    regenerated_searchable_content TEXT
  )
) AS updated_content
WHERE healthcare_timeline_events.id = updated_content.id;
```

---

## Integration Patterns

### Automatic Timeline Generation Trigger

```sql
-- Function to auto-generate timeline events when clinical events are created
CREATE OR REPLACE FUNCTION generate_timeline_for_clinical_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Queue timeline generation for the new clinical event
  INSERT INTO timeline_generation_queue (clinical_event_id, priority)
  VALUES (NEW.id, 'normal');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on clinical events table
CREATE TRIGGER trigger_timeline_generation
  AFTER INSERT ON patient_clinical_events
  FOR EACH ROW
  EXECUTE FUNCTION generate_timeline_for_clinical_event();
```

### AI Chatbot Integration

```sql
-- Query for AI chatbot to find relevant timeline events
SELECT 
  te.title,
  te.summary,
  te.event_date,
  te.searchable_content,
  te.event_tags,
  array_agg(ce.event_name) as clinical_event_details
FROM healthcare_timeline_events te
JOIN patient_clinical_events ce ON ce.id = ANY(te.clinical_event_ids)
WHERE 
  te.patient_id = $1::UUID
  AND (
    te.searchable_content ILIKE '%' || $2::TEXT || '%' OR
    $2::TEXT = ANY(te.event_tags)
  )
ORDER BY te.event_date DESC
LIMIT 10;
```

---

## Testing Requirements

### Unit Tests

```typescript
describe('TimelineGeneration', () => {
  test('should generate timeline event for clinical observation', async () => {
    const clinicalEvent = {
      activity_type: 'observation',
      event_name: 'Blood Pressure Measurement',
      method: 'physical_exam'
    };
    
    const timeline = await generateTimelineEvent(clinicalEvent);
    
    expect(timeline.display_category).toBe('visit');
    expect(timeline.title).toContain('Blood Pressure');
    expect(timeline.icon).toBe('stethoscope');
    expect(timeline.searchable_content).toContain('blood pressure');
  });
  
  test('should group related clinical events into single timeline event', async () => {
    const clinicalEvents = [
      { event_name: 'Physical Examination' },
      { event_name: 'Blood Pressure Check' },
      { event_name: 'Flu Shot' }
    ];
    
    const timeline = await generateGroupedTimelineEvent(clinicalEvents);
    
    expect(timeline.display_category).toBe('visit');
    expect(timeline.title).toBe('Annual Physical Exam');
    expect(timeline.clinical_event_ids).toHaveLength(3);
  });
});
```

---

*This bridge specification ensures that every clinical event generates appropriate timeline metadata, enabling Guardian's patient-friendly healthcare journey visualization while maintaining links to the underlying clinical data.*