# Medication Coding Framework

**Date Created**: 17 September 2025
**Status**: Phase 1 Implementation File
**Dependencies**: simple-database-schema.md for regional code systems reference

## Overview

Comprehensive medication coding strategy for V3 medical code resolution, handling the complexity of pharmaceutical nomenclature across multiple code systems with country-specific variations.

## Code System Hierarchy

### **Level 1: Universal Codes**
**RxNorm (US FDA Standard)**
- **SCD (Specific Clinical Drug)**: Preferred level - includes strength, dosage form
  - Example: `Lisinopril 10 MG Oral Tablet [Prinivil]`
- **SBD (Specific Branded Drug)**: When brand name is clinically relevant
  - Example: `Tylenol 325 MG Oral Tablet`
- **IN (Ingredient)**: Fallback only for unspecified preparations
  - Example: `Lisinopril` (avoid when possible)

### **Level 2: Country-Specific Codes**
**Australia - PBS (Pharmaceutical Benefits Scheme)**
- PBS item codes for subsidized medications
- Integration with TGA (Therapeutic Goods Administration) identifiers
- AUST L/R numbers for regulatory compliance

**Future Country Support (Feature Flagged)**
- **UK**: BNF (British National Formulary) codes
- **Canada**: DIN (Drug Identification Number)
- **EU**: EMA reference numbers

## Complex Medication Scenarios

### **Brand Name vs Generic Resolution**

**Strategy**: Always attempt generic-first resolution
```
Input: "Tylenol 500mg"
Resolution Priority:
1. RxNorm SCD: acetaminophen 500 MG Oral Tablet
2. RxNorm SBD: Tylenol 500 MG Oral Tablet (if brand clinically relevant)
3. Confidence score based on generic availability
```

### **Strength and Dosage Normalization**

**Common Variations**:
- `5mg` vs `5 milligrams` vs `5 MG`
- `0.5g` vs `500mg`
- `10mL` vs `10 milliliters`

**Normalization Rules**:
1. Convert all to RxNorm standard format before embedding search
2. Store original text for audit trail
3. Flag unit conversion confidence in metadata

### **Route and Form Coding**

**Critical for Clinical Safety**:
- Oral vs IV vs topical can be life-threatening if confused
- RxNorm includes route/form in SCD level
- PBS codes include administration route

**Examples**:
```
Morphine 10mg oral tablet ≠ Morphine 10mg injection
```

### **Combination Products**

**Complex Pharmaceutical Logic**:
- Single RxNorm code for combination: `acetaminophen 325 MG / oxycodone hydrochloride 5 MG Oral Tablet`
- PBS has separate codes for combinations vs individual components
- AI must not split combination products into separate medications

### **Discontinued and Historical Medications**

**Legacy Data Handling**:
- RxNorm maintains historical codes with TTY (Term Type) = `SCD_RETIRED`
- PBS removes codes but maintains historical reference
- Store discontinuation date and replacement suggestion

## Embedding and Matching Strategy

### **Pre-Processing for Embeddings**

**Text Normalization Before Vector Search**:
1. Standardize units (mg, mL, etc.)
2. Expand abbreviations (tab → tablet)
3. Remove manufacturer-specific identifiers
4. Normalize strength formatting

### **Embedding Dimensions**

**Medication-Specific Vectors**:
- Include drug class context (analgesic, antibiotic)
- Therapeutic indication context when available
- Route and form as semantic meaning
- Exclude manufacturer branding from embeddings

### **Confidence Scoring for Medications**

**Multi-Factor Confidence Calculation**:
```
medication_confidence = (
    strength_match_score * 0.35 +
    route_form_match_score * 0.25 +
    ingredient_match_score * 0.25 +
    brand_context_score * 0.15
)
```

**Threshold Rules**:
- `≥0.85`: Auto-assign with audit log
- `0.60-0.84`: Flag for manual review
- `<0.60`: Create custom_medication record, no code assignment

## Country-Specific Implementation

### **Australian PBS Integration**

**PBS Code Structure**:
- 5-digit PBS item codes
- Schedule categorization (S1-S8 for controlled substances)
- Authority required vs general benefit items
- Co-payment vs full subsidy indicators

**Example Implementation**:
```sql
medication_codes_pbs (
    pbs_item_code VARCHAR(5),
    drug_name TEXT,
    active_ingredient TEXT,
    strength TEXT,
    form TEXT,
    schedule TEXT,
    authority_required BOOLEAN,
    embedding_vector vector(1536)
);
```

### **Travel and Conversion Use Cases**

**Scenario**: Australian patient traveling to UK for 6 months
**Requirements**:
1. Convert PBS codes to BNF equivalents
2. Maintain therapeutic equivalence
3. Flag unavailable medications in destination country
4. Provide alternative medication suggestions

**Implementation**:
- Cross-reference tables between code systems
- Therapeutic class mapping for unavailable exact matches
- User notification of medication availability changes

## Integration with Pass 1/Pass 2 Pipeline

### **Pass 1 Output Requirements**

**Structured Medication Data for Code Resolution**:
```json
{
  "medication_name": "Panadol 500mg",
  "strength": "500mg",
  "form": "tablet",
  "route": "oral",
  "frequency": "twice daily",
  "brand_mentioned": true,
  "generic_name_detected": "paracetamol"
}
```

### **Pass 2 Enhancement Process**

**Medication Code Resolution Workflow**:
1. Receive normalized medication attributes from Pass 1
2. Query embedding index with processed medication text
3. Retrieve top-N candidate codes (max 10)
4. Apply deterministic selection rules
5. Return structured code assignment or null

**Safety Constraints**:
- AI NEVER invents medication codes
- AI ONLY selects from provided candidate list
- Missing codes result in null assignment, not hallucination

### **Code Storage Architecture**

**Database Design**:
```sql
-- Patient medication records with resolved codes
patient_medications (
    id UUID PRIMARY KEY,
    patient_id UUID,
    medication_text TEXT, -- Original extracted text
    rxnorm_code VARCHAR(20), -- Resolved RxNorm SCD
    pbs_code VARCHAR(5), -- Australian PBS if applicable
    code_confidence DECIMAL(3,2),
    resolution_method TEXT, -- 'embedding', 'exact_match', 'manual'
    created_at TIMESTAMP
);

-- Audit trail for code resolution decisions
medication_code_resolution_audit (
    id UUID PRIMARY KEY,
    patient_medication_id UUID,
    candidate_codes JSONB, -- All candidates considered
    selection_reason TEXT,
    confidence_factors JSONB,
    resolved_by TEXT -- 'system', 'manual_review'
);
```

## Error Handling and Edge Cases

### **Ambiguous Medication Names**

**Example**: "Insulin" without strength/type specification
**Resolution**:
1. Flag as insufficient information
2. Create custom_medication record
3. Request clarification if interactive mode available
4. Do not guess insulin type (safety critical)

### **Novel or Compounded Medications**

**Custom Pharmacy Preparations**:
- Not in standard code systems
- Create local custom codes with clear provenance
- Flag for potential addition to standard vocabularies

### **Dosage Form Mismatches**

**Example**: "Aspirin injection" (uncommon form)
**Resolution**:
1. Verify against known RxNorm forms
2. Flag unusual combinations for review
3. Accept only if exact RxNorm match exists

## Validation and Quality Assurance

### **Automated Validation Rules**

**Safety Checks**:
- Route/form combination validation against clinical guidelines
- Strength range validation (flag 1000x typical doses)
- Drug-drug interaction checking at code level
- Pregnancy/pediatric safety flags

### **Manual Review Triggers**

**Human Review Required**:
- Confidence score 0.60-0.84
- Novel medication combinations
- Controlled substance coding (S4/S8 schedule)
- Discontinued medication with no clear replacement

### **Performance Monitoring**

**Key Metrics**:
- Code resolution success rate by medication class
- Manual review queue depth and processing time
- Embedding match accuracy vs manual validation
- Cross-country conversion success rates

## Future Enhancements

### **AI Model Integration**

**Advanced Features (Phase 4+)**:
- Drug class prediction for unmatched medications
- Therapeutic equivalence suggestions
- Interaction checking with existing medication codes
- Dosage appropriateness validation

### **International Expansion**

**Additional Code Systems**:
- WHO ATC classification integration
- Regional formulary support (NHS, German DAV)
- Traditional medicine coding systems
- Clinical trial drug coding

## Implementation Checklist

- [ ] RxNorm database import and embedding generation
- [ ] PBS code integration with TGA mapping
- [ ] Strength/form normalization algorithms
- [ ] Confidence scoring implementation
- [ ] Country preference handling
- [ ] Manual review queue system
- [ ] Audit logging framework
- [ ] Cross-country conversion tables
- [ ] Safety validation rules
- [ ] Performance monitoring dashboard

## Success Criteria

**Phase 1 Success**:
- 85%+ resolution rate for common Australian medications
- <150ms p95 latency for code resolution
- Zero hallucinated medication codes
- Complete audit trail for all assignments

**Phase 2 Success**:
- Multi-country medication conversion capability
- Manual review workflow operational
- Cross-validation with clinical pharmacist review
- Integration with drug interaction checking