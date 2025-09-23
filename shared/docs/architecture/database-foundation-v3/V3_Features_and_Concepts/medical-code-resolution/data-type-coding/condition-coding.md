# Condition Coding Framework

**Date Created**: 17 September 2025
**Status**: Phase 1 Implementation File
**Dependencies**: simple-database-schema.md for regional code systems reference

## Overview

Comprehensive medical condition coding strategy for V3 medical code resolution, handling diagnostic terminology across multiple classification systems with clinical context preservation.

## Code System Hierarchy

### **Level 1: Universal Codes**

**SNOMED-CT (Clinical Terms)**
- **Primary choice** for clinical documentation
- Granular clinical concepts with semantic relationships
- Example: `233604007 | Pneumonia (disorder)`
- Post-coordination for complex conditions
- International standard with country-specific extensions

**WHO ICD-11 (International Classification of Diseases)**
- **Secondary universal** standard
- Foundation URI-based coding system
- Example: `CA40.0 | Pneumonia, organism unspecified`
- Better granularity than ICD-10

### **Level 2: Country-Specific Codes**

**Australia - ICD-10-AM (Australian Modification)**
- Required for Medicare billing and reporting
- Maps from SNOMED-CT primary codes
- Example: `J18.9 | Pneumonia, unspecified organism`
- Hospital discharge coding standard

**Future Country Support (Feature Flagged)**
- **US**: ICD-10-CM (Clinical Modification)
- **UK**: ICD-10 with NHS extensions
- **Canada**: ICD-10-CA

## Clinical Condition Complexity

### **Acute vs Chronic Distinction**

**Critical for Healthcare Planning**:
```
Input: "Diabetes"
Resolution Priority:
1. SNOMED: 44054006 | Diabetes mellitus type 2 (disorder)
2. ICD-10-AM: E11.9 | Type 2 diabetes mellitus without complications
3. Temporal context from document influences specificity
```

**Temporal Indicators**:
- Acute: sudden onset, short duration
- Chronic: long-term, ongoing management
- Historical: resolved, past medical history

### **Severity and Stage Coding**

**Clinical Progression Tracking**:
- SNOMED provides severity qualifiers
- ICD-10 includes staging for cancers
- Functional impact assessment codes

**Examples**:
```
Mild asthma: 426656000 | Mild asthma (disorder)
Severe asthma: 370218001 | Mild persistent asthma (disorder)
```

### **Anatomical Specificity**

**Location-Dependent Conditions**:
- SNOMED supports anatomical site specifications
- Left vs right distinction where clinically relevant
- Multiple site involvement coding

**Examples**:
```
General: 116223007 | Complication of diabetes mellitus (disorder)
Specific: 4855003 | Retinopathy due to diabetes mellitus (disorder)
```

### **Condition Status Tracking**

**Active vs Historical vs Suspected**:
- Active: Currently being treated
- Historical: Past condition, resolved
- Suspected: Under investigation, not confirmed
- Family history: Genetic risk factors

## Embedding and Matching Strategy

### **Condition-Specific Embeddings**

**Medical Context Enrichment**:
- Include anatomical context
- Severity qualifiers in vector space
- Temporal aspects (acute/chronic)
- Exclude patient-specific identifiers

### **Semantic Relationship Preservation**

**SNOMED Hierarchy Utilization**:
- Parent-child relationships in embeddings
- "Is-a" relationship scoring
- Laterality and severity as semantic dimensions

### **Confidence Scoring for Conditions**

**Multi-Dimensional Confidence**:
```
condition_confidence = (
    exact_term_match * 0.40 +
    anatomical_specificity * 0.25 +
    severity_context_match * 0.20 +
    temporal_context_match * 0.15
)
```

**Threshold Rules**:
- `≥0.80`: Auto-assign with clinical context
- `0.55-0.79`: Flag for medical review
- `<0.55`: Create custom_condition, no code assignment

## Clinical Documentation Patterns

### **Diagnostic Certainty Levels**

**Medical Language Nuances**:
```
"Pneumonia" → Definitive diagnosis
"Possible pneumonia" → Suspected condition
"Rule out pneumonia" → Differential diagnosis
"History of pneumonia" → Past medical history
```

**Coding Strategy**:
- Parse certainty qualifiers from text
- Apply appropriate SNOMED situation codes
- Flag uncertain diagnoses for clinical review

### **Differential Diagnosis Handling**

**Multiple Condition Mentions**:
- Primary diagnosis vs rule-out conditions
- Comorbidity identification
- Condition relationship mapping

### **Symptom vs Diagnosis Distinction**

**Clinical Hierarchy**:
```
Symptom: "Chest pain" → 29857009 | Chest pain (finding)
Diagnosis: "Myocardial infarction" → 22298006 | Myocardial infarction (disorder)
```

## Country-Specific Implementation

### **Australian ICD-10-AM Integration**

**Mapping Strategy**:
- SNOMED-CT primary with ICD-10-AM secondary
- Australian Institute of Health and Welfare mappings
- Private health insurance coding requirements

**Database Structure**:
```sql
condition_codes_snomed_au (
    snomed_code VARCHAR(18),
    preferred_term TEXT,
    icd10_am_mapping VARCHAR(8),
    clinical_finding_type TEXT,
    body_system TEXT,
    embedding_vector vector(1536)
);
```

### **Healthcare System Integration**

**Medicare Benefits Schedule (MBS)**:
- Diagnostic procedure codes
- Specialist referral requirements
- Bulk billing item numbers

**Public vs Private Healthcare**:
- Different coding requirements
- Insurance claim specifications
- Government reporting obligations

## Integration with Pass 1/Pass 2 Pipeline

### **Pass 1 Output Requirements**

**Structured Condition Data**:
```json
{
  "condition_name": "Type 2 diabetes",
  "severity": "mild",
  "anatomical_site": null,
  "temporal_status": "chronic",
  "certainty": "confirmed",
  "onset_date": "2023-03-15",
  "treatment_status": "active"
}
```

### **Pass 2 Enhancement Process**

**Condition Code Resolution Workflow**:
1. Parse clinical context and certainty
2. Query SNOMED-CT embeddings with enriched context
3. Retrieve hierarchically-related candidate codes
4. Apply clinical appropriateness rules
5. Generate ICD-10-AM mapping if required

**Clinical Safety Rules**:
- Never assign codes for uncertain diagnoses
- Flag cancer staging for oncology review
- Require high confidence for medication-requiring conditions

## Complex Clinical Scenarios

### **Comorbidity and Multiple Conditions**

**Diabetes with Complications**:
```
Primary: 44054006 | Diabetes mellitus type 2 (disorder)
Complications:
- 4855003 | Retinopathy due to diabetes mellitus (disorder)
- 127013003 | Diabetic nephropathy (disorder)
```

**Relationship Preservation**:
- Link causally related conditions
- Maintain complication hierarchies
- Track condition progression over time

### **Mental Health Conditions**

**Sensitive Clinical Areas**:
- Strict confidence thresholds (≥0.90)
- Professional diagnosis requirement flags
- Privacy protection considerations
- Stigma-aware terminology selection

### **Genetic and Hereditary Conditions**

**Family History Integration**:
- Personal vs family history distinction
- Genetic risk factor coding
- Screening recommendation triggers

## Validation and Quality Assurance

### **Clinical Appropriateness Checks**

**Automated Validation**:
- Age-appropriate condition validation
- Gender-specific condition checking
- Anatomical possibility verification
- Condition severity progression logic

### **Medical Professional Review**

**Clinical Review Triggers**:
- Rare disease coding (prevalence <1:10000)
- Cancer staging and grading
- Mental health diagnoses
- Genetic conditions
- Uncertain diagnostic language

### **Cross-Reference Validation**

**Multi-System Consistency**:
- SNOMED-CT to ICD-10-AM mapping verification
- Clinical guideline adherence checking
- Medication-condition compatibility

## International Travel and Conversion

### **Healthcare System Interoperability**

**Travel Scenario Requirements**:
- SNOMED-CT as universal exchange format
- Country-specific translation tables
- Clinical summary generation for foreign providers
- Emergency medical information formatting

**Implementation Strategy**:
```sql
condition_translations (
    snomed_code VARCHAR(18),
    target_country VARCHAR(3),
    local_code VARCHAR(20),
    local_display_name TEXT,
    clinical_notes TEXT
);
```

## Error Handling and Edge Cases

### **Ambiguous Condition Names**

**Example**: "Depression" without clinical context
**Resolution Process**:
1. Query for all depression-related SNOMED codes
2. Present options ranked by clinical prevalence
3. Flag for clinical review if context insufficient
4. Never assume specific depression type

### **Obsolete or Deprecated Conditions**

**Legacy Medical Terminology**:
- Historical condition names no longer used
- Updated clinical understanding
- Terminology evolution tracking

### **Cultural and Linguistic Variations**

**International Medical Terminology**:
- British vs American spelling variations
- Cultural condition descriptions
- Traditional medicine integration

## Performance and Monitoring

### **Key Performance Indicators**

**Clinical Accuracy Metrics**:
- Condition coding accuracy vs clinical validation
- Diagnostic confidence correlation with clinical certainty
- Specialist review agreement rates
- Patient outcome correlation tracking

**System Performance**:
- Code resolution latency (<100ms p95)
- Embedding query response time
- Clinical review queue processing time
- Cross-system mapping success rates

## Future Enhancements

### **AI-Assisted Clinical Validation**

**Advanced Features (Phase 4+)**:
- Clinical decision support integration
- Treatment pathway suggestions
- Condition progression prediction
- Drug-condition interaction checking

### **Research and Population Health**

**Epidemiological Applications**:
- Population health trend analysis
- Clinical research data standardization
- Public health reporting automation
- Healthcare quality metrics

## Implementation Checklist

- [ ] SNOMED-CT AU edition import and indexing
- [ ] ICD-10-AM mapping table creation
- [ ] Clinical context parsing algorithms
- [ ] Condition hierarchy relationship mapping
- [ ] Confidence scoring calibration
- [ ] Clinical review workflow implementation
- [ ] Cross-country translation tables
- [ ] Healthcare system integration endpoints
- [ ] Clinical validation testing
- [ ] Medical professional training documentation

## Success Criteria

**Phase 1 Success**:
- 80%+ accurate condition coding for common diagnoses
- Complete clinical context preservation
- Zero inappropriate code assignments for sensitive conditions
- Successful SNOMED-CT to ICD-10-AM mapping

**Phase 2 Success**:
- Clinical specialist validation agreement >90%
- International healthcare data exchange capability
- Real-time clinical decision support integration
- Population health analytics enablement