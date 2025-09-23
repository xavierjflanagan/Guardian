# Allergy Coding Framework

**Date Created**: 17 September 2025
**Status**: Phase 1 Implementation File
**Dependencies**: simple-database-schema.md for regional code systems reference

## Overview

Comprehensive allergy and adverse reaction coding strategy for V3 medical code resolution, handling drug allergies, environmental sensitivities, and food allergies with clinical safety priority.

## Code System Hierarchy

### **Level 1: Universal Codes**

**SNOMED-CT Allergy Concepts**
- **Primary choice** for allergy documentation
- Substance codes with reaction type specification
- Example: `387517004 | Allergy to penicillin (disorder)`
- Severity and manifestation coding capability
- International standard with local extensions

**RxNorm for Drug Allergies**
- **Substance-level coding** for medication allergies
- Ingredient-based rather than brand-specific
- Example: `7980 | Penicillin` (ingredient level)
- Cross-reactivity group identification
- Integration with medication coding systems

### **Level 2: Country-Specific Codes**

**Australia - TGA Allergy Classifications**
- Therapeutic Goods Administration substance categories
- Australian Adverse Drug Reactions Advisory Committee (ADRAC) classifications
- Integration with PBS substance warnings

**Future Country Support (Feature Flagged)**
- **US**: FDA adverse reaction classifications
- **UK**: MHRA Yellow Card substance codes
- **EU**: EMA adverse reaction terminology

## Allergy Classification Complexity

### **Drug vs Environmental vs Food Allergies**

**Allergy Categories**:
```
Drug Allergy: 387517004 | Allergy to penicillin (disorder)
Environmental: 232346004 | Allergy to pollen (disorder)
Food Allergy: 91935009 | Allergy to peanuts (disorder)
Contact: 95894004 | Contact allergy (disorder)
```

**Clinical Safety Implications**:
- Drug allergies prevent medication administration
- Environmental allergies affect lifestyle recommendations
- Food allergies require dietary restrictions
- Contact allergies influence product recommendations

### **Severity Classification**

**Clinical Severity Levels**:
- **Mild**: Skin rash, mild discomfort
- **Moderate**: Systemic symptoms, significant discomfort
- **Severe**: Anaphylaxis, life-threatening reactions
- **Unknown**: Severity not documented or unclear

**SNOMED-CT Severity Coding**:
```
Mild: 255604002 | Mild (qualifier value)
Moderate: 6736007 | Moderate (qualifier value)
Severe: 24484000 | Severe (qualifier value)
```

### **Reaction Type and Manifestation**

**Clinical Reaction Patterns**:
- Immediate hypersensitivity (Type I)
- Delayed hypersensitivity (Type IV)
- Idiosyncratic reactions
- Pseudo-allergic reactions

**Manifestation Documentation**:
```
Skin: 271807003 | Eruption of skin (disorder)
Respiratory: 23924001 | Tight chest (finding)
Gastrointestinal: 422587007 | Nausea (finding)
Systemic: 39579001 | Anaphylaxis (disorder)
```

### **Cross-Reactivity and Allergy Families**

**Drug Class Cross-Reactivity**:
- Penicillin family allergies
- Sulfonamide cross-reactions
- NSAIDs sensitivity patterns
- Beta-lactam antibiotic families

**Implementation Strategy**:
```sql
allergy_cross_reactivity (
    primary_allergen_code VARCHAR(18),
    cross_reactive_code VARCHAR(18),
    cross_reaction_probability DECIMAL(3,2),
    clinical_significance TEXT
);
```

## Embedding and Matching Strategy

### **Allergy-Specific Embeddings**

**Clinical Context Integration**:
- Substance chemical structure relationships
- Reaction pattern similarities
- Cross-reactivity group associations
- Severity level semantic clustering

### **Drug Allergy Substance Resolution**

**RxNorm Integration Strategy**:
- Map to ingredient level (not brand names)
- Include therapeutic class context
- Chemical structure relationship preservation
- Cross-reactivity family identification

### **Confidence Scoring for Allergies**

**Safety-First Confidence Model**:
```
allergy_confidence = (
    exact_substance_match * 0.45 +
    reaction_pattern_match * 0.25 +
    severity_context_match * 0.20 +
    cross_reactivity_validation * 0.10
)
```

**Conservative Threshold Rules** (Safety Critical):
- `≥0.90`: Auto-assign with clinical alerts
- `0.70-0.89`: Flag for clinical verification
- `<0.70`: Create custom_allergy, require manual review

## Clinical Safety Patterns

### **Drug Allergy Documentation**

**Critical Safety Information**:
```
"Allergic to penicillin - rash"
Resolution:
- Substance: RxNorm 7980 (Penicillin)
- Reaction: SNOMED 271807003 (Eruption of skin)
- Severity: SNOMED 255604002 (Mild)
- Cross-reactivity: Flag all beta-lactam antibiotics
```

### **Anaphylaxis and Life-Threatening Reactions**

**Emergency Alert Integration**:
- Immediate medication contraindication flags
- Emergency medical information prioritization
- Healthcare provider alert systems
- Medical bracelet/alert device integration

### **Unknown vs No Known Allergies**

**Documentation Precision**:
```
"No known allergies" ≠ "No allergies documented"
"Unknown allergies" = Insufficient information for safety assessment
```

**Safety Protocols**:
- Clear documentation status tracking
- Healthcare provider information gaps
- Patient education requirements
- Periodic allergy history updates

## Country-Specific Implementation

### **Australian TGA Integration**

**Regulatory Compliance**:
- TGA adverse reaction reporting requirements
- ADRAC substance classification alignment
- PBS medication warning integration
- Medical device allergy considerations

**Database Design**:
```sql
allergy_codes_au (
    snomed_allergy_code VARCHAR(18),
    tga_substance_code VARCHAR(20),
    allergen_name TEXT,
    reaction_severity TEXT,
    cross_reactivity_groups TEXT[],
    pbs_contraindications TEXT[],
    embedding_vector vector(1536)
);
```

### **Healthcare Provider Workflow**

**Clinical Decision Support**:
- Real-time medication allergy checking
- Cross-reactivity warnings during prescribing
- Allergy history verification prompts
- Emergency medical information access

## Integration with Pass 1/Pass 2 Pipeline

### **Pass 1 Output Requirements**

**Structured Allergy Data**:
```json
{
  "allergen_name": "penicillin",
  "allergy_type": "drug",
  "reaction_description": "skin rash",
  "severity": "mild",
  "onset_timing": "immediate",
  "last_reaction_date": "2023-05-12",
  "certainty": "confirmed"
}
```

### **Pass 2 Enhancement Process**

**Allergy Code Resolution Workflow**:
1. Identify allergen type (drug/food/environmental)
2. Query appropriate code system (RxNorm for drugs, SNOMED for others)
3. Retrieve substance codes with cross-reactivity data
4. Apply clinical safety validation rules
5. Generate medication contraindication alerts

**Critical Safety Rules**:
- Never ignore documented allergies during coding
- Always include cross-reactivity warnings
- Escalate unclear allergy descriptions for review
- Maintain complete allergy audit trails

## Complex Allergy Scenarios

### **Multiple Drug Allergies**

**Polypharmacy Allergy Management**:
```
Patient allergic to:
- Penicillin (rash)
- Sulfonamides (GI upset)
- NSAIDs (asthma exacerbation)
```

**Clinical Impact**:
- Severely limited medication options
- Requires specialist consultation
- Alternative therapy identification
- Emergency medication planning

### **Food-Drug Cross-Reactivity**

**Complex Cross-Reactions**:
- Shellfish allergy and iodine contrast
- Banana allergy and latex sensitivity
- Celery allergy and medication excipients
- Red meat allergy and gelatin capsules

### **Environmental Allergy Clinical Impact**

**Healthcare Implications**:
- Latex allergy in medical settings
- Hospital cleaning product sensitivities
- Medical device material allergies
- Facility accommodation requirements

## Quality Assurance and Validation

### **Clinical Safety Validation**

**Automated Safety Checks**:
- Cross-reactivity database validation
- Medication contraindication verification
- Allergy severity appropriateness
- Emergency protocol trigger validation

### **Clinical Review Requirements**

**Mandatory Review Triggers**:
- Multiple severe drug allergies
- Unusual allergen-reaction combinations
- Cross-reactivity pattern inconsistencies
- Life-threatening reaction histories
- Pediatric allergy documentation

### **Patient Safety Monitoring**

**Ongoing Safety Surveillance**:
- Medication administration incident tracking
- Allergy documentation accuracy assessment
- Cross-reactivity prediction validation
- Emergency response effectiveness analysis

## Emergency Medical Information

### **Critical Allergy Information Export**

**Emergency Medical Summary**:
- Life-threatening allergies prioritized
- Cross-reactivity warnings included
- Emergency medication contraindications
- Alternative emergency medication options

**Medical Alert Integration**:
```json
{
  "critical_allergies": [
    {
      "allergen": "Penicillin",
      "severity": "Anaphylaxis",
      "cross_reactive_drugs": ["Amoxicillin", "Ampicillin"],
      "emergency_alternatives": ["Cephalexin", "Azithromycin"]
    }
  ]
}
```

## International Travel Considerations

### **Cross-Border Allergy Communication**

**Universal Allergy Documentation**:
- SNOMED-CT international compatibility
- Multi-language allergy descriptions
- Emergency medical translation
- Cultural allergy consideration differences

**Travel Medicine Integration**:
- Destination-specific allergen warnings
- Travel medication allergy checking
- Foreign healthcare system compatibility
- Emergency medical kit customization

## Error Handling and Edge Cases

### **Ambiguous Allergy Descriptions**

**Example**: "Allergic to antibiotics"
**Resolution Strategy**:
1. Flag as insufficient specificity
2. Request specific antibiotic identification
3. Never assume specific antibiotic class
4. Document as "unspecified antibiotic allergy"

### **Historical vs Current Allergies**

**Temporal Allergy Considerations**:
- Childhood allergies that may be outgrown
- Drug tolerance testing results
- Allergy desensitization outcomes
- Age-related allergy pattern changes

### **Unconfirmed Allergy Reports**

**Patient-Reported vs Clinically Confirmed**:
- Family history of allergies
- Suspected but unconfirmed reactions
- Medication intolerance vs true allergy
- Cultural or dietary preference vs allergy

## Performance and Monitoring

### **Patient Safety Metrics**

**Critical Safety Indicators**:
- Missed allergy detection rate
- False positive allergy alerts
- Cross-reactivity prediction accuracy
- Emergency allergy response times

**Clinical Quality Measures**:
- Allergy documentation completeness
- Healthcare provider allergy review compliance
- Patient allergy education effectiveness
- Medication safety improvement metrics

## Future Enhancements

### **Pharmacogenomics Integration**

**Genetic Allergy Prediction**:
- HLA-B*5701 and abacavir hypersensitivity
- CYP450 enzyme variation effects
- Genetic predisposition screening
- Personalized allergy risk assessment

### **AI-Powered Allergy Prediction**

**Advanced Clinical Decision Support**:
- New allergy risk prediction based on existing allergies
- Drug development allergy screening
- Population allergy trend analysis
- Precision allergy management

## Implementation Checklist

- [ ] SNOMED-CT allergy codes import and indexing
- [ ] RxNorm substance codes integration
- [ ] Cross-reactivity database construction
- [ ] Clinical severity classification system
- [ ] Emergency alert integration framework
- [ ] Healthcare provider decision support tools
- [ ] Patient allergy education materials
- [ ] International allergy translation tables
- [ ] Safety monitoring and reporting systems
- [ ] Clinical validation and quality assurance

## Success Criteria

**Phase 1 Success**:
- 95%+ accuracy for drug allergy substance identification
- Complete cross-reactivity warning system
- Zero missed critical allergy documentation
- Real-time medication safety checking operational

**Phase 2 Success**:
- Integrated emergency medical information system
- International healthcare compatibility
- Pharmacogenomics allergy prediction capability
- Population allergy surveillance and reporting