# Procedure Coding Framework

**Date Created**: 17 September 2025
**Status**: Phase 1 Implementation File
**Dependencies**: simple-database-schema.md for regional code systems reference

## Overview

Comprehensive medical procedure coding strategy for V3 medical code resolution, handling surgical, diagnostic, and therapeutic interventions across multiple classification systems with clinical accuracy.

## Code System Hierarchy

### **Level 1: Universal Codes**

**SNOMED-CT Procedure Codes**
- **Primary choice** for clinical procedure documentation
- Granular procedural concepts with anatomical relationships
- Example: `80146002 | Appendectomy (procedure)`
- Method, approach, and anatomical site specification
- International standard with country extensions

### **Level 2: Country-Specific Codes**

**Australia - MBS (Medicare Benefits Schedule)**
- Required for Medicare billing and healthcare provider payments
- Item numbers with fee schedule integration
- Example: `30443 | Appendicectomy`
- Private health insurance compatibility

**Australia - ACHI (Australian Classification of Health Interventions)**
- Hospital procedure classification
- ICD-10-AM procedure volume integration
- Example: `30443-00 | Appendicectomy, unspecified`

**Future Country Support (Feature Flagged)**
- **US**: CPT (Current Procedural Terminology)
- **UK**: OPCS-4 (Office of Population Censuses and Surveys)
- **Canada**: CCI (Canadian Classification of Health Interventions)

## Procedure Classification Complexity

### **Surgical vs Diagnostic vs Therapeutic**

**Procedure Categories**:
```
Surgical: 80146002 | Appendectomy (procedure)
Diagnostic: 73761001 | Colonoscopy (procedure)
Therapeutic: 302497006 | Hemodialysis (procedure)
Preventive: 33879002 | Immunization (procedure)
```

**Billing and Clinical Context**:
- Surgical procedures require facility coding
- Diagnostic procedures may include interpretation
- Therapeutic procedures often recurring
- Preventive procedures tied to health maintenance

### **Anatomical Site Specificity**

**Location-Dependent Procedures**:
- Left vs right anatomical distinction
- Bilateral procedure coding
- Multiple site procedures
- Revision and repeat procedures

**Examples**:
```
General: 34068001 | Heart valve replacement (procedure)
Specific: 175096002 | Aortic valve replacement (procedure)
Bilateral: 287934005 | Bilateral knee replacement (procedure)
```

### **Approach and Method Coding**

**Surgical Technique Specificity**:
- Open vs laparoscopic vs robotic approaches
- Minimally invasive techniques
- Emergency vs elective procedures
- Revision procedures

**Clinical Documentation**:
```
Open: 80146002 | Appendectomy (procedure)
Laparoscopic: 174041007 | Laparoscopic appendectomy (procedure)
Emergency: Combined with urgency qualifiers
```

### **Complexity and Staging**

**Procedure Complexity Levels**:
- Simple vs complex procedure variations
- Multi-stage surgical procedures
- Combination procedures in single session
- Complexity scoring for resource allocation

## Embedding and Matching Strategy

### **Procedure-Specific Embeddings**

**Clinical Context Enrichment**:
- Anatomical site context
- Surgical approach methodology
- Emergency vs elective context
- Complexity and duration indicators

### **Procedural Hierarchy Utilization**

**SNOMED Relationship Mapping**:
- Procedure-to-anatomy relationships
- Method-to-procedure associations
- Device-to-procedure linkages
- Indication-to-procedure connections

### **Confidence Scoring for Procedures**

**Multi-Factor Confidence Calculation**:
```
procedure_confidence = (
    exact_procedure_match * 0.35 +
    anatomical_site_match * 0.25 +
    approach_method_match * 0.20 +
    clinical_context_match * 0.20
)
```

**Threshold Rules**:
- `≥0.85`: Auto-assign with audit trail
- `0.65-0.84`: Flag for clinical review
- `<0.65`: Create custom_procedure, no code assignment

## Clinical Documentation Patterns

### **Procedure Name Variations**

**Common Terminology Variations**:
```
"Colonoscopy" = "Colonic endoscopy" = "Lower GI endoscopy"
"Appendectomy" = "Appendicectomy" = "Removal of appendix"
"Hip replacement" = "Total hip arthroplasty" = "Hip joint replacement"
```

**Normalization Strategy**:
- Standardize terminology before embedding search
- Include common synonyms in vector training
- Flag archaic or deprecated procedure names

### **Procedure Indication Context**

**Clinical Reasoning Integration**:
- Diagnostic procedures with suspected conditions
- Therapeutic procedures with treatment goals
- Preventive procedures with risk factors
- Emergency procedures with urgent indications

### **Outcome and Complications**

**Post-Procedure Documentation**:
- Successful completion vs complications
- Conversion procedures (laparoscopic to open)
- Incomplete procedures due to technical factors
- Revision procedures for complications

## Country-Specific Implementation

### **Australian MBS Integration**

**Medicare Benefits Schedule Structure**:
- 5-digit item numbers
- Professional fee scheduling
- Bulk billing eligibility
- Specialist vs GP procedure categories

**Database Design**:
```sql
procedure_codes_mbs (
    mbs_item_number VARCHAR(5),
    procedure_description TEXT,
    snomed_ct_mapping VARCHAR(18),
    specialist_category TEXT,
    fee_schedule_amount DECIMAL(8,2),
    bulk_billing_eligible BOOLEAN,
    embedding_vector vector(1536)
);
```

### **Private Health Insurance Integration**

**Insurance Procedure Categories**:
- Prostheses List item numbers
- Hospital vs extras cover procedures
- Waiting period requirements
- Pre-authorization procedures

### **Healthcare Provider Workflow**

**Clinical Documentation Requirements**:
- Procedure notes with SNOMED-CT codes
- MBS item number selection for billing
- Clinical indication documentation
- Informed consent procedure tracking

## Integration with Pass 1/Pass 2 Pipeline

### **Pass 1 Output Requirements**

**Structured Procedure Data**:
```json
{
  "procedure_name": "Laparoscopic appendectomy",
  "anatomical_site": "appendix",
  "approach": "laparoscopic",
  "urgency": "emergency",
  "indication": "acute appendicitis",
  "complications": null,
  "outcome": "successful"
}
```

### **Pass 2 Enhancement Process**

**Procedure Code Resolution Workflow**:
1. Parse procedure context and clinical indication
2. Query SNOMED-CT procedure embeddings
3. Retrieve anatomically-appropriate candidates
4. Apply clinical appropriateness validation
5. Generate MBS/ACHI mappings for Australian context

**Safety Constraints for Procedures**:
- Never assign codes for incomplete procedure descriptions
- Require anatomical site specification for site-specific procedures
- Flag unusual procedure-indication combinations
- Validate against standard practice guidelines

## Complex Procedural Scenarios

### **Multi-Stage and Combination Procedures**

**Surgical Session Management**:
```
Primary: 32506005 | Coronary artery bypass grafting (procedure)
Concurrent: 399021000 | Replacement of heart valve (procedure)
```

**Relationship Tracking**:
- Primary procedure identification
- Concurrent procedure documentation
- Staged procedure planning
- Revision procedure linkage

### **Device and Implant Integration**

**Medical Device Procedures**:
- Implant insertion with device specification
- Device revision and replacement procedures
- Device malfunction and removal procedures
- Compatibility and sizing considerations

**Prostheses List Integration**:
- Australian Government Prostheses List items
- Device coding with procedure coding
- Supplier and product specification
- Cost and insurance coverage integration

### **Emergency and Trauma Procedures**

**Urgent Procedure Documentation**:
- Emergency department procedures
- Trauma surgery coding
- Life-saving intervention priorities
- Resource allocation considerations

## Quality Assurance and Validation

### **Clinical Appropriateness Validation**

**Automated Safety Checks**:
- Age-appropriate procedure validation
- Gender-specific procedure checking
- Anatomical possibility verification
- Contraindication screening

### **Professional Review Requirements**

**Clinical Review Triggers**:
- Experimental or novel procedures
- High-risk surgical procedures
- Pediatric specialized procedures
- Revision procedures within short timeframes
- Procedures requiring special authorization

### **Outcome Correlation Analysis**

**Quality Metrics**:
- Procedure success rate tracking
- Complication rate monitoring
- Resource utilization analysis
- Cost-effectiveness evaluation

## International Travel and Emergency Care

### **Emergency Medical Procedures Abroad**

**Cross-Border Healthcare**:
- Universal SNOMED-CT procedure codes
- Emergency procedure translation
- Insurance claim processing internationally
- Medical tourism procedure documentation

**Implementation Strategy**:
```sql
procedure_international_mappings (
    snomed_procedure_code VARCHAR(18),
    country_code VARCHAR(3),
    local_procedure_code VARCHAR(20),
    local_description TEXT,
    emergency_translation TEXT
);
```

## Specialized Procedure Categories

### **Imaging and Radiology Procedures**

**Diagnostic Imaging Complexity**:
- Modality specification (CT, MRI, X-ray, ultrasound)
- Anatomical region coverage
- Contrast agent administration
- Image-guided intervention procedures

### **Laboratory and Pathology Procedures**

**Diagnostic Testing Procedures**:
- Specimen collection procedures
- Laboratory analysis methods
- Pathology examination techniques
- Molecular diagnostic procedures

### **Mental Health and Therapy Procedures**

**Therapeutic Intervention Coding**:
- Psychotherapy session types
- Psychiatric assessment procedures
- Behavioral therapy techniques
- Mental health crisis interventions

## Error Handling and Edge Cases

### **Ambiguous Procedure Descriptions**

**Example**: "Heart surgery" without specificity
**Resolution Strategy**:
1. Request additional clinical context
2. Query for cardiac procedure categories
3. Flag for clinical clarification
4. Never assume specific surgical approach

### **Obsolete Surgical Techniques**

**Historical Procedure Documentation**:
- Deprecated surgical approaches
- Superseded medical techniques
- Historical medical equipment procedures
- Legacy documentation preservation

### **Novel and Experimental Procedures**

**Cutting-Edge Medical Procedures**:
- Research protocol procedures
- Clinical trial interventions
- Innovative surgical techniques
- Custom medical device procedures

## Performance and Monitoring

### **Clinical Accuracy Metrics**

**Validation Measures**:
- Procedure coding accuracy vs surgical reports
- MBS item assignment correctness
- Clinical reviewer agreement rates
- Patient outcome correlation analysis

**System Performance Targets**:
- Code resolution latency <120ms p95
- Clinical review queue processing <24 hours
- Cross-system mapping accuracy >95%
- Emergency procedure coding <60 seconds

## Future Enhancements

### **AI-Assisted Surgical Planning**

**Advanced Clinical Integration**:
- Pre-operative planning assistance
- Surgical approach optimization
- Complication risk assessment
- Resource requirement prediction

### **Real-Time Operating Theater Integration**

**Live Procedure Documentation**:
- Intraoperative procedure modification
- Real-time complication documentation
- Device integration and tracking
- Surgical workflow optimization

## Implementation Checklist

- [ ] SNOMED-CT procedure codes import and indexing
- [ ] MBS item number integration with fee schedules
- [ ] ACHI classification mapping
- [ ] Anatomical site relationship mapping
- [ ] Surgical approach taxonomy
- [ ] Clinical indication validation rules
- [ ] Emergency procedure prioritization
- [ ] International mapping tables
- [ ] Quality assurance metrics
- [ ] Clinical review workflow

## Success Criteria

**Phase 1 Success**:
- 85%+ accurate procedure coding for common interventions
- Complete MBS integration for Australian billing
- Real-time procedure documentation capability
- Clinical safety validation operational

**Phase 2 Success**:
- Surgical specialist validation agreement >90%
- International emergency procedure exchange
- Integrated medical device tracking
- Population health procedure analytics