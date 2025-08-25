# Entity Classification Taxonomy for AI Processing

## Document Status
- **Created**: 25 August 2025
- **Purpose**: Define entity classification system for AI Pass 1 processing and schema mapping
- **Status**: Taxonomy specification for implementation  
- **Related**: Feeds into `04-ai-processing-architecture.md` Pass 1 entity detection

## Executive Summary
This document defines a processing-requirements-based taxonomy for classifying document entities during AI Pass 1 processing. Rather than using vague clinical/non-clinical distinctions, entities are organized by their AI processing requirements and downstream schema needs, enabling efficient and accurate entity detection and schema assignment.

## Vision for Classification and Labelling
The classification system is designed to support a multi-layered contextual approach where every entity identified by AI Pass 1 needs to be classified like a Russian babushka doll with multiple shell labelling. Pass 1 should only do the essential shells, but most of the shells will be added by Pass 2. 

**The Ultimate Vision**: Every data point must have all context you could ever need. For example, the use case for this app would be that the user or doctor goes onto the patient's app digital dashboard and clicks on a past BP recording and sees quite a few on a graph display. They then click on one that is very high, and upon clicking they are served with the ability to see the context of that particular BP recording which happens to be the recording that was taken when they last presented to hospital and were being worked up in ED. They can then click through to the overall hospital encounter and either read the source document or read the dashboard's deconstructed re-structured version of it showing an AI summary, what happened, the other BP recordings, etc.

This contextual layering ensures that individual clinical data points are not isolated measurements but are understood within their complete healthcare narrative, enabling meaningful clinical interpretation and comprehensive patient care coordination.

## Processing Requirements Framework

The taxonomy is organized around three core processing approaches based on what the AI system needs to do with each type of entity:

```yaml
Processing Categories:
  1. Clinical Events: Full medical analysis + schema enrichment + timeline integration
  2. Healthcare Context: Profile matching + contextual schemas + compliance tracking  
  3. Document Structure: Identification + logging only (no medical enrichment)
```

## Entity Classification System

### Category 1: Clinical Events
**Processing Requirements**: Full medical analysis, schema enrichment, clinical coding, timeline integration
**Definition**: Any medical observations, interventions, diagnoses, clinical findings, healthcare encounters, or care activities that contribute to the patient's healthcare knowledge base and clinical timeline.
**AI Processing Approach**:
- Pass 1: Identify and classify with high precision
- Pass 2: Full schema enrichment with medical coding (SNOMED-CT, LOINC, CPT)
- Database: Insert into clinical tables with full provenance tracking

#### Clinical Event Subtypes

```typescript
const CLINICAL_EVENT_SUBTYPES = {
  // Observational Data
  vital_sign: {
    description: 'Physiological measurements',
    examples: ['blood pressure: 140/90', 'temperature: 98.6°F', 'pulse: 72 bpm'],
    schemas: ['patient_observations', 'patient_vitals'],
    timeline_relevance: 'high'
  },

  lab_result: {
    description: 'Laboratory test results and values',
    examples: ['glucose: 95 mg/dL', 'CBC: WBC 7.2', 'HbA1c: 6.1%'],
    schemas: ['patient_observations', 'patient_lab_results'],
    timeline_relevance: 'high'
  },

  physical_finding: {
    description: 'Clinical examination findings',
    examples: ['heart murmur grade 2/6', 'bilateral breath sounds clear', 'abdomen soft, non-tender'],
    schemas: ['patient_observations', 'patient_clinical_events'],
    timeline_relevance: 'high'
  },

  symptom: {
    description: 'Patient-reported symptoms and complaints',
    examples: ['chest pain', 'shortness of breath', 'headache for 3 days'],
    schemas: ['patient_observations', 'patient_clinical_events'],
    timeline_relevance: 'high'
  },

  // Interventional Data
  medication: {
    description: 'Prescribed or administered medications',
    examples: ['Lisinopril 10mg daily', 'Tylenol 500mg PRN', 'Insulin 20 units BID'],
    schemas: ['patient_interventions', 'patient_medications'],
    timeline_relevance: 'high'
  },

  procedure: {
    description: 'Medical procedures and treatments performed',
    examples: ['colonoscopy', 'chest X-ray', 'physical therapy session'],
    schemas: ['patient_interventions', 'patient_clinical_events'],
    timeline_relevance: 'high'
  },

  immunization: {
    description: 'Vaccines and immunizations administered',
    examples: ['COVID-19 vaccine', 'flu shot 2024', 'Tdap booster'],
    schemas: ['patient_interventions', 'patient_immunizations'],
    timeline_relevance: 'high'
  },

  // Diagnostic Data
  diagnosis: {
    description: 'Medical diagnoses and conditions',
    examples: ['Type 2 Diabetes', 'Hypertension', 'Acute bronchitis'],
    schemas: ['patient_conditions', 'patient_clinical_events'],
    timeline_relevance: 'high'
  },

  allergy: {
    description: 'Known allergies and adverse reactions',
    examples: ['penicillin allergy', 'shellfish intolerance', 'latex sensitivity'],
    schemas: ['patient_allergies', 'patient_clinical_events'],
    timeline_relevance: 'high'
  },

  // Healthcare Encounters
  healthcare_encounter: {
    description: 'Clinical appointments, visits, and care encounters',
    examples: ['Follow-up visit 3/15/2024', 'Emergency room visit', 'Cardiology consultation'],
    schemas: ['healthcare_encounters', 'patient_clinical_events', 'healthcare_timeline_events'],
    timeline_relevance: 'high'
  },

  // Failsafe
  clinical_other: {
    description: 'Clinical information that does not fit other subtypes but contributes to healthcare timeline',
    examples: ['Unclear medical reference', 'Complex clinical narrative', 'Ambiguous clinical finding'],
    schemas: ['patient_clinical_events'],
    timeline_relevance: 'high',
    requires_manual_review: true
  }
};
```

### Category 2: Healthcare Context
**Processing Requirements**: Profile matching, contextual schema assignment, compliance tracking
**Definition**: Healthcare-related information that provides context, identifies stakeholders, or supports healthcare operations but does not directly contribute to the clinical timeline (though it may be referenced for profile matching and care coordination).
**AI Processing Approach**:
- Pass 1: Identify and classify for profile matching
- Pass 2: Limited enrichment for context and compliance
- Database: Insert into contextual tables with profile association

#### Healthcare Context Subtypes

```typescript
const HEALTHCARE_CONTEXT_SUBTYPES = {
  // Identity Information
  patient_identifier: {
    description: 'Patient identification information',
    examples: ['John Smith', 'DOB: 01/15/1980', 'MRN: 12345678'],
    schemas: ['patient_demographics', 'healthcare_encounters'],
    profile_matching: 'critical',
    pii_sensitivity: 'high'
  },

  provider_identifier: {
    description: 'Healthcare provider information',
    examples: ['Dr. Sarah Johnson, MD', 'Cardiology Associates', 'NPI: 1234567890'],
    schemas: ['provider_registry', 'healthcare_encounters'],
    profile_matching: 'medium',
    pii_sensitivity: 'medium'
  },

  facility_identifier: {
    description: 'Healthcare facility information',
    examples: ['Memorial Hospital', 'Radiology Department', 'Room 204'],
    schemas: ['healthcare_encounters', 'healthcare_timeline_events'],
    profile_matching: 'low',
    pii_sensitivity: 'low'
  },

  // Healthcare Journey
  appointment: {
    description: 'Scheduled or completed appointments',
    examples: ['Follow-up visit 3/15/2024', 'Annual physical scheduled', 'Cancelled due to weather'],
    schemas: ['healthcare_timeline_events', 'healthcare_encounters'],
    profile_matching: 'medium',
    timeline_relevance: 'medium'
  },

  referral: {
    description: 'Referrals to other providers or specialists',
    examples: ['Refer to orthopedics', 'Cardiology consultation requested', 'PT evaluation ordered'],
    schemas: ['healthcare_timeline_events', 'patient_clinical_events'],
    profile_matching: 'medium',
    timeline_relevance: 'medium'
  },

  care_coordination: {
    description: 'Care plans and coordination activities',
    examples: ['Discharge plan', 'Care transition summary', 'Follow-up instructions'],
    schemas: ['healthcare_timeline_events', 'patient_clinical_events'],
    profile_matching: 'medium',
    timeline_relevance: 'high'
  },

  // Administrative Healthcare
  insurance_information: {
    description: 'Insurance and coverage details',
    examples: ['Blue Cross Blue Shield', 'Policy #: ABC123', 'Copay: $25'],
    schemas: ['healthcare_encounters', 'administrative_data'],
    profile_matching: 'high',
    compliance_relevance: 'high'
  },

  billing_code: {
    description: 'Medical billing and procedure codes',
    examples: ['CPT 99213', 'ICD-10 E11.9', 'HCPCS G0439'],
    schemas: ['healthcare_encounters', 'administrative_data'],
    profile_matching: 'low',
    compliance_relevance: 'high'
  },

  authorization: {
    description: 'Prior authorizations and approvals',
    examples: ['Prior auth approved', 'Insurance verification', 'Coverage determination'],
    schemas: ['administrative_data', 'healthcare_encounters'],
    profile_matching: 'medium',
    compliance_relevance: 'high'
  },

  // Failsafe
  healthcare_context_other: {
    description: 'Healthcare-related information that does not fit other subtypes',
    examples: ['Unclear healthcare reference', 'Ambiguous administrative content', 'Unknown healthcare identifier'],
    schemas: ['administrative_data'],
    profile_matching: 'low',
    requires_manual_review: true
  }
};
```

### Category 3: Document Structure
**Processing Requirements**: Identification and logging only (no medical enrichment)

**Definition**: Document formatting elements, non-healthcare content, and structural components that provide no clinical value but need to be tracked for completeness.

**AI Processing Approach**:
- Pass 1: Identify and log for completeness
- Pass 2: Skip enrichment (no schemas assigned)
- Database: Log in document metadata only

#### Document Structure Subtypes

```typescript
const DOCUMENT_STRUCTURE_SUBTYPES = {
  // Formatting Elements
  header: {
    description: 'Document headers and letterheads',
    examples: ['Memorial Hospital Letterhead', 'Patient Report', 'Confidential'],
    processing: 'log_only',
    schemas: []
  },

  footer: {
    description: 'Document footers and disclaimers',
    examples: ['Page 1 of 3', 'Printed on 01/15/2024', 'This is a legal document'],
    processing: 'log_only',
    schemas: []
  },

  logo: {
    description: 'Institutional logos and graphics',
    examples: ['Hospital logo', 'Medical group emblem', 'Certification badges'],
    processing: 'log_only',
    schemas: []
  },

  page_marker: {
    description: 'Page numbers and document navigation',
    examples: ['Page 2', 'Continued on next page', 'End of report'],
    processing: 'log_only',
    schemas: []
  },

  // Legal/Administrative Structure
  signature_line: {
    description: 'Signature areas and authorization fields',
    examples: ['Physician signature:', '_______________', 'Electronically signed'],
    processing: 'log_only',
    schemas: []
  },

  watermark: {
    description: 'Document watermarks and security features',
    examples: ['COPY', 'CONFIDENTIAL', 'DRAFT'],
    processing: 'log_only',
    schemas: []
  },

  form_structure: {
    description: 'Form fields and layout elements',
    examples: ['Name: _____', 'Date: □/□/□', 'Check all that apply:'],
    processing: 'log_only',
    schemas: []
  },

  // Failsafe
  document_structure_other: {
    description: 'Document elements that do not fit other structural categories',
    examples: ['Unclear formatting element', 'Unknown document artifact', 'Ambiguous layout component'],
    processing: 'log_only',
    schemas: [],
    requires_manual_review: true
  }
};
```

## Relevance Classifications Explained

### Timeline Relevance
**Purpose**: Determines if entity appears on user's healthcare timeline dashboard
- **High**: Always appears on timeline (all clinical events should be 'high')
- **Medium**: May appear depending on user preferences (deprecated - all clinical events are 'high')
- **Low**: Does not appear on timeline (healthcare context and document structure)

### Compliance Relevance  
**Purpose**: Determines audit/regulatory tracking requirements (HIPAA, billing compliance)
- **High**: Requires full audit trail and compliance logging
- **Medium**: Standard compliance tracking
- **Low**: Minimal compliance requirements

### Profile Matching
**Purpose**: Determines how important this entity is for identifying the correct patient profile
- **Critical**: Essential for profile identification (patient identifiers)
- **High**: Important for profile validation (insurance info)
- **Medium**: Helpful for profile context (provider names, appointments)
- **Low**: Minimal profile relevance (billing codes, facility names)

## Schema Mapping System

### Automated Schema Assignment Rules

```typescript
const SCHEMA_MAPPING = {
  // Clinical Events - Full Medical Schemas
  vital_sign: ['patient_observations', 'patient_vitals'],
  lab_result: ['patient_observations', 'patient_lab_results'],
  physical_finding: ['patient_observations', 'patient_clinical_events'],
  symptom: ['patient_observations', 'patient_clinical_events'],
  medication: ['patient_interventions', 'patient_medications'],
  procedure: ['patient_interventions', 'patient_clinical_events'],
  immunization: ['patient_interventions', 'patient_immunizations'],
  diagnosis: ['patient_conditions', 'patient_clinical_events'],
  allergy: ['patient_allergies', 'patient_clinical_events'],
  healthcare_encounter: ['healthcare_encounters', 'patient_clinical_events', 'healthcare_timeline_events'],
  clinical_other: ['patient_clinical_events'],

  // Healthcare Context - Contextual Schemas
  patient_identifier: ['patient_demographics', 'healthcare_encounters'],
  provider_identifier: ['provider_registry', 'healthcare_encounters'],
  facility_identifier: ['healthcare_encounters', 'healthcare_timeline_events'],
  appointment: ['healthcare_timeline_events', 'healthcare_encounters'],
  referral: ['healthcare_timeline_events', 'patient_clinical_events'],
  care_coordination: ['healthcare_timeline_events', 'patient_clinical_events'],
  insurance_information: ['healthcare_encounters', 'administrative_data'],
  billing_code: ['healthcare_encounters', 'administrative_data'],
  authorization: ['administrative_data', 'healthcare_encounters'],
  healthcare_context_other: ['administrative_data'],

  // Document Structure - No Schemas
  header: [],
  footer: [],
  logo: [],
  page_marker: [],
  signature_line: [],
  watermark: [],
  form_structure: [],
  document_structure_other: []
};
```

### Priority-Based Processing

```typescript
const PROCESSING_PRIORITY = {
  highest: ['vital_sign', 'lab_result', 'medication', 'diagnosis'],
  high: ['physical_finding', 'symptom', 'procedure', 'allergy'],
  medium: ['patient_identifier', 'appointment', 'care_coordination'],
  low: ['provider_identifier', 'billing_code', 'insurance_information'],
  logging_only: ['header', 'footer', 'logo', 'page_marker', 'signature_line']
};
```

## Implementation for AI Pass 1

### Prompt Integration

This taxonomy will be embedded in Pass 1 prompts as classification instructions:

```python
ENTITY_CLASSIFICATION_PROMPT = f"""
Identify EVERY piece of information in this document as an entity using this taxonomy:

CLINICAL EVENTS (require full medical analysis):
{format_subtypes(CLINICAL_EVENT_SUBTYPES)}

HEALTHCARE CONTEXT (require profile matching):
{format_subtypes(HEALTHCARE_CONTEXT_SUBTYPES)}

DOCUMENT STRUCTURE (logging only):
{format_subtypes(DOCUMENT_STRUCTURE_SUBTYPES)}

For each entity, provide:
1. entity_id: Unique identifier
2. text: Exact text from document
3. entity_category: clinical_event | healthcare_context | document_structure
4. entity_subtype: Specific classification from above
5. confidence: 0.0-1.0 confidence score
6. requires_schemas: Auto-assigned based on subtype (see mapping table)

Schema assignment is automatic based on entity subtype.
"""
```

### Token Usage Optimization

```typescript
const TAXONOMY_TOKEN_COUNT = {
  entity_categories: 15,        // 3 main categories with descriptions
  clinical_subtypes: 120,       // 9 subtypes with examples
  healthcare_subtypes: 140,     // 9 subtypes with examples  
  document_subtypes: 80,        // 7 subtypes with examples
  schema_mapping: 60,           // Mapping rules
  total_estimated: 415          // <500 tokens - very manageable
};
```

## Quality Assurance and Edge Cases

### Entity Disambiguation Rules

```typescript
const DISAMBIGUATION_RULES = {
  // When entity could fit multiple categories
  medication_vs_diagnosis: 'If substance name with dosage → medication, if condition → diagnosis',
  appointment_vs_procedure: 'If scheduled/future → appointment, if performed → procedure',
  provider_name_vs_signature: 'If with credentials → provider_identifier, if signature line → signature_line',
  
  // Complex entities spanning multiple categories
  prescription_with_diagnosis: 'Split into medication entity + diagnosis entity',
  lab_result_with_interpretation: 'Single lab_result entity with full interpretation text'
};
```

### Validation Checks

```typescript
const VALIDATION_RULES = {
  clinical_events: {
    must_have_schemas: true,
    min_confidence: 0.7,
    require_medical_context: true
  },
  
  healthcare_context: {
    profile_matching_required: true,
    pii_handling: 'flag_for_sanitization',
    min_confidence: 0.8
  },
  
  document_structure: {
    schemas_must_be_empty: true,
    processing_flag: 'log_only',
    min_confidence: 0.9  // Should be obvious
  }
};
```

## Examples and Use Cases

### Example Document Fragment Analysis

```typescript
const EXAMPLE_ANALYSIS = {
  input_text: `
    Memorial Hospital
    Patient: John Smith DOB: 01/15/1980
    
    Chief Complaint: Chest pain
    
    Vital Signs:
    BP: 140/90 mmHg
    Pulse: 72 bpm
    
    Assessment: Hypertension
    Plan: Start Lisinopril 10mg daily
    
    Dr. Sarah Johnson, MD
    [Signature]
  `,
  
  expected_entities: [
    {
      entity_id: 'ent_001',
      text: 'Memorial Hospital',
      entity_category: 'healthcare_context',
      entity_subtype: 'facility_identifier',
      requires_schemas: ['healthcare_encounters', 'healthcare_timeline_events']
    },
    {
      entity_id: 'ent_002', 
      text: 'John Smith DOB: 01/15/1980',
      entity_category: 'healthcare_context',
      entity_subtype: 'patient_identifier',
      requires_schemas: ['patient_demographics', 'healthcare_encounters']
    },
    {
      entity_id: 'ent_003',
      text: 'Chest pain',
      entity_category: 'clinical_event',
      entity_subtype: 'symptom',
      requires_schemas: ['patient_observations', 'patient_clinical_events']
    },
    {
      entity_id: 'ent_004',
      text: 'BP: 140/90 mmHg',
      entity_category: 'clinical_event', 
      entity_subtype: 'vital_sign',
      requires_schemas: ['patient_observations', 'patient_vitals']
    },
    {
      entity_id: 'ent_005',
      text: 'Hypertension',
      entity_category: 'clinical_event',
      entity_subtype: 'diagnosis', 
      requires_schemas: ['patient_conditions', 'patient_clinical_events']
    },
    {
      entity_id: 'ent_006',
      text: 'Lisinopril 10mg daily',
      entity_category: 'clinical_event',
      entity_subtype: 'medication',
      requires_schemas: ['patient_interventions', 'patient_medications']
    },
    {
      entity_id: 'ent_007',
      text: 'Dr. Sarah Johnson, MD',
      entity_category: 'healthcare_context',
      entity_subtype: 'provider_identifier',
      requires_schemas: ['provider_registry', 'healthcare_encounters']
    },
    {
      entity_id: 'ent_008',
      text: '[Signature]',
      entity_category: 'document_structure',
      entity_subtype: 'signature_line',
      requires_schemas: []
    }
  ]
};
```

## Success Metrics

### Classification Accuracy Targets

```typescript
const ACCURACY_TARGETS = {
  clinical_events: {
    target_accuracy: 0.95,
    critical_threshold: 0.90,
    reason: 'Direct impact on patient care and clinical timeline'
  },
  
  healthcare_context: {
    target_accuracy: 0.92,
    critical_threshold: 0.85,
    reason: 'Important for profile matching and compliance'
  },
  
  document_structure: {
    target_accuracy: 0.98,
    critical_threshold: 0.95,
    reason: 'Should be obvious formatting elements'
  }
};
```

### Implementation Success Criteria

- **Completeness**: 100% of document content classified (no unidentified text)
- **Schema Assignment Accuracy**: >95% correct schema mapping based on entity subtype
- **Processing Efficiency**: <500 tokens for complete taxonomy in Pass 1 prompts
- **Profile Safety**: 100% accuracy in identifying PII-sensitive entities
- **Cost Optimization**: Enable 70%+ AI cost reduction through targeted Pass 2 processing

---

*This entity classification taxonomy provides a structured, processing-requirements-based approach to document entity identification, enabling efficient AI processing while maintaining healthcare-grade accuracy and comprehensive coverage of medical document content.*