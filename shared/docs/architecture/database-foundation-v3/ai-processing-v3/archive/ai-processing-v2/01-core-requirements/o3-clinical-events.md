# O3's Clinical Events Classification Model

**Purpose:** Define how AI processing maps extracted medical facts to the `patient_clinical_events` table  
**Database Table:** `patient_clinical_events`  
**Reference:** [database-foundation/implementation/sql/005_clinical_events_core.sql](../../database-foundation/implementation/sql/005_clinical_events_core.sql)

---

## Overview

O3's two-axis classification model is the foundation of Guardian's clinical data architecture. Every medical fact extracted by AI must be classified along two axes:

1. **Activity Type**: What kind of clinical activity (observation vs intervention)
2. **Clinical Purposes**: Why it was done (can be multiple purposes)

This classification determines how data flows into the normalized clinical tables.

---

## The Two-Axis Model

### Axis 1: Activity Type

Every clinical event is either gathering information (observation) or taking action (intervention):

```sql
activity_type TEXT NOT NULL CHECK (activity_type IN ('observation', 'intervention'))
```

| Activity Type | Definition | Examples |
|--------------|------------|----------|
| **observation** | Information gathering without changing patient state | Blood pressure measurement, lab test, physical exam finding, X-ray, |
| **intervention** | Actions that change or intend to change patient state | Medication administration, vaccination, surgery, therapy session |

### Axis 2: Clinical Purposes

Each event can serve multiple clinical purposes:

```sql
clinical_purposes TEXT[] NOT NULL -- Array allows multiple purposes
```

| Purpose | Definition | Examples |
|---------|------------|----------|
| **screening** | Looking for disease in asymptomatic patients | Mammogram, colonoscopy, depression screening |
| **diagnostic** | Determining the cause of symptoms | Blood test for infection, MRI for headache |
| **therapeutic** | Treatment intended to cure or manage | Antibiotics, chemotherapy, physical therapy |
| **monitoring** | Tracking known conditions over time | HbA1c for diabetes, INR for warfarin |
| **preventive** | Preventing disease before it occurs | Vaccines, prophylactic medications |

---

## AI Classification Examples

### Example 1: Blood Pressure Reading

**Document Text:** "BP: 120/80 mmHg"

**AI Classification:**
```json
{
  "activity_type": "observation",
  "clinical_purposes": ["monitoring"],
  "event_name": "Blood Pressure Measurement",
  "method": "physical_exam",
  "snomed_code": "75367002"
}
```

### Example 2: Flu Vaccination

**Document Text:** "Administered influenza vaccine, 0.5ml IM"

**AI Classification:**
```json
{
  "activity_type": "intervention",
  "clinical_purposes": ["preventive"],
  "event_name": "Influenza Vaccination",
  "method": "injection",
  "body_site": "left_deltoid",
  "snomed_code": "86198006"
}
```

### Example 3: Mammogram for Screening

**Document Text:** "Bilateral mammogram performed for routine screening"

**AI Classification:**
```json
{
  "activity_type": "observation",
  "clinical_purposes": ["screening", "preventive"],
  "event_name": "Bilateral Mammogram",
  "method": "imaging",
  "snomed_code": "24623002"
}
```

### Example 4: Blood Glucose Test (Multiple Purposes)

**Document Text:** "Fasting glucose 250 mg/dL (high) - checking for diabetes, monitoring metformin response"

**AI Classification:**
```json
{
  "activity_type": "observation",
  "clinical_purposes": ["diagnostic", "monitoring"],
  "event_name": "Fasting Blood Glucose Test",
  "method": "laboratory",
  "loinc_code": "1558-6"
}
```

---

## Classification Decision Tree

```
Extract Medical Fact
    ↓
Is it gathering information or taking action?
    ↓
┌─────────────────────┬──────────────────────┐
│    OBSERVATION      │    INTERVENTION      │
│ (gathering info)    │   (taking action)    │
└─────────────────────┴──────────────────────┘
           ↓                      ↓
    What is the purpose? (can be multiple)
           ↓                      ↓
    ┌──────────────────────────────────┐
    │ □ screening - looking for disease │
    │ □ diagnostic - finding cause      │
    │ □ therapeutic - treatment         │
    │ □ monitoring - tracking over time │
    │ □ preventive - preventing disease │
    └──────────────────────────────────┘
           ↓                      ↓
    Extract Additional Fields:
    - event_name (specific, descriptive)
    - method (how it was done)
    - body_site (where applicable)
    - clinical codes (SNOMED/LOINC/CPT)
```

---

## Database Population

### Primary Table: `patient_clinical_events`

Every classified event creates a record:

```sql
INSERT INTO patient_clinical_events (
    patient_id,
    activity_type,
    clinical_purposes,
    event_name,
    method,
    body_site,
    snomed_code,
    loinc_code,
    cpt_code,
    event_date,
    confidence_score
) VALUES (
    '{{user_id}}',
    'observation',                      -- or 'intervention'
    ARRAY['diagnostic', 'monitoring'],  -- can be multiple
    'Complete Blood Count',
    'laboratory',
    NULL,                               -- not applicable for blood test
    '26604007',                         -- SNOMED code for CBC
    '58410-2',                          -- LOINC code for CBC
    '85025',                            -- CPT code for CBC
    '2024-07-15',
    0.95
);
```

### Detail Tables Based on Activity Type

**For Observations → `patient_observations`:**
```sql
INSERT INTO patient_observations (
    event_id,
    observation_type,
    value_numeric,
    unit,
    reference_range_low,
    reference_range_high,
    interpretation
) VALUES (
    '{{event_id}}',
    'lab_result',
    7.2,
    'g/dL',
    12.0,
    16.0,
    'low'
);
```

**For Interventions → `patient_interventions`:**
```sql
INSERT INTO patient_interventions (
    event_id,
    intervention_type,
    substance_name,
    dose_amount,
    dose_unit,
    route
) VALUES (
    '{{event_id}}',
    'medication_admin',
    'Amoxicillin',
    500,
    'mg',
    'oral'
);
```

---

## AI Prompt Engineering for O3 Classification

### Effective Prompt Structure

```
You are classifying medical events using O3's two-axis model.

For each medical fact:
1. Determine activity_type:
   - "observation" if gathering information (tests, exams, measurements)
   - "intervention" if taking action (medications, procedures, treatments)

2. Determine clinical_purposes (select ALL that apply):
   - "screening": Looking for disease in patients without symptoms
   - "diagnostic": Finding the cause of symptoms or problems
   - "therapeutic": Treatment to cure or manage conditions
   - "monitoring": Tracking known conditions over time
   - "preventive": Preventing disease before it occurs

3. Generate a specific event_name that clearly describes what happened

4. Identify the method (how it was done):
   - physical_exam, laboratory, imaging, injection, surgery, etc.

5. Include body_site if applicable

6. Add appropriate clinical codes (SNOMED-CT, LOINC, CPT)

Example Input: "Patient received flu shot in left arm"
Example Output:
{
  "activity_type": "intervention",
  "clinical_purposes": ["preventive"],
  "event_name": "Influenza Vaccination",
  "method": "injection",
  "body_site": "left_deltoid",
  "snomed_code": "86198006"
}
```

---

## Common Classification Patterns

### Laboratory Tests
- **Activity Type:** Always `observation`
- **Clinical Purposes:** Usually `diagnostic` and/or `monitoring`
- **Method:** Always `laboratory`
- **Codes:** Prefer LOINC codes

### Medications
- **Activity Type:** Always `intervention`
- **Clinical Purposes:** Usually `therapeutic`, sometimes `preventive`
- **Method:** Route of administration (oral, injection, topical)
- **Codes:** RxNorm for medications, CPT for administration

### Imaging Studies
- **Activity Type:** Always `observation`
- **Clinical Purposes:** Can be `screening`, `diagnostic`, or `monitoring`
- **Method:** Always `imaging`
- **Body Site:** Usually specified

### Vital Signs
- **Activity Type:** Always `observation`
- **Clinical Purposes:** Usually `monitoring`, sometimes `screening`
- **Method:** Usually `physical_exam`
- **Codes:** LOINC codes for vital signs

### Vaccinations
- **Activity Type:** Always `intervention`
- **Clinical Purposes:** Always includes `preventive`
- **Method:** Usually `injection`
- **Codes:** CVX codes for vaccines

---

## Validation Rules

The AI extraction must ensure:

1. **Every event has exactly one activity_type**
2. **Every event has at least one clinical_purpose**
3. **Every event has a descriptive event_name**
4. **Observation events should populate patient_observations**
5. **Intervention events should populate patient_interventions**
6. **At least one clinical code (SNOMED/LOINC/CPT) when possible**

---

## Integration with Timeline

Every clinical event also generates timeline metadata:

```json
{
  "display_category": "test_result",        // Based on event type
  "display_subcategory": "blood_test",      // More specific
  "title": "Complete Blood Count",          // User-friendly title
  "summary": "Routine blood work",          // Brief description
  "icon": "flask",                          // UI icon
  "searchable_content": "CBC blood count hemoglobin",  // For search
  "event_tags": ["routine", "laboratory"]   // For filtering
}
```

---

*This classification model ensures that every piece of medical information extracted by AI is properly categorized and stored in Guardian's normalized clinical database structure, enabling powerful clinical decision support and healthcare journey visualization.*