# Vague Medication Handling

**Status**: Complete Implementation Specification  
**Purpose**: Handle medication group mentions, unclear references, and incomplete medication information in clinical documents

## Overview

Healthcare documents often contain vague medication references like "started on steroids yesterday" or "prescribed antibiotics". This framework provides systematic approaches for coding these mentions while maintaining clinical safety and preventing inappropriate deduplication.

**Key Integration Points**:
- Used by [`./embedding-based-code-matching.md`](./embedding-based-code-matching.md) for semantic matching
- Supports [`./code-hierarchy-selection.md`](./code-hierarchy-selection.md) for appropriate granularity  
- Referenced by [`../temporal-data-management/clinical-identity-policies.md`](../temporal-data-management/clinical-identity-policies.md) for identity determination

## Vague Medication Scenarios

### Common Clinical Vague References

```typescript
interface VagueMedicationScenarios {
  medication_classes: {
    "steroids": "systemic corticosteroids",
    "antibiotics": "antibacterial agents", 
    "blood thinners": "anticoagulants",
    "pain killers": "analgesics",
    "blood pressure medications": "antihypertensives",
    "heart medications": "cardiac therapy",
    "diabetes medications": "antidiabetic agents",
    "cholesterol medications": "lipid modifying agents"
  };
  
  temporal_vague: {
    "started yesterday": "recent_initiation",
    "been on for years": "chronic_therapy",
    "as needed": "prn_therapy",
    "short course": "temporary_therapy"
  };
  
  dosage_vague: {
    "low dose": "low_intensity",
    "high dose": "high_intensity", 
    "usual dose": "standard_therapy",
    "maintenance dose": "maintenance_therapy"
  };
}
```

## Drug Class Coding Framework

### ATC Code Integration

**Reference**: [`./australian-healthcare-codes.md`](./australian-healthcare-codes.md) for Australian medication classifications

```typescript
interface DrugClassCoding {
  atc_level1: string;    // Anatomical main group (A-V)
  atc_level2: string;    // Therapeutic subgroup  
  atc_level3: string;    // Pharmacological subgroup
  atc_level4: string;    // Chemical subgroup
  atc_level5: string;    // Chemical substance
  
  clinical_class: string;      // User-friendly description
  common_medications: string[]; // Typical medications in this class
  safety_considerations: string[];
}

const drugClassMappings = {
  "steroids": {
    atc_code: "H02AB",           // Systemic corticosteroids, plain
    atc_level1: "H02",           // Systemic hormonal preparations
    clinical_class: "systemic_corticosteroids",
    common_medications: [
      "prednisolone", "prednisone", "hydrocortisone", 
      "methylprednisolone", "dexamethasone"
    ],
    rxnorm_ingredients: [
      "8640", // Prednisolone
      "8635", // Prednisone  
      "5492", // Hydrocortisone
      "6902", // Methylprednisolone
      "3264"  // Dexamethasone
    ],
    safety_considerations: [
      "requires_tapering", "infection_risk", "blood_sugar_impact",
      "bone_density_effects", "adrenal_suppression"
    ],
    identity_strategy: "class_based_with_safety_flags"
  },
  
  "antibiotics": {
    atc_code: "J01",
    atc_level1: "J01",
    clinical_class: "antibacterials_systemic",
    common_medications: [
      "amoxicillin", "cephalexin", "doxycycline", "ciprofloxacin", "azithromycin"
    ],
    rxnorm_ingredients: [
      "723", "2194", "3640", "2551", "18631"
    ],
    safety_considerations: [
      "allergy_screening_required", "resistance_concerns", "c_diff_risk"
    ],
    identity_strategy: "conservative_unique_per_mention"
  },
  
  "blood_thinners": {
    atc_code: "B01A",
    atc_level1: "B01A",
    clinical_class: "antithrombotic_agents", 
    common_medications: [
      "warfarin", "apixaban", "rivaroxaban", "dabigatran", "enoxaparin"
    ],
    rxnorm_ingredients: [
      "11289", "1364430", "1114195", "1037042", "4025"
    ],
    safety_considerations: [
      "bleeding_risk", "inr_monitoring", "drug_interactions_critical"
    ],
    identity_strategy: "class_based_with_bleeding_alerts"
  }
};
```

### Vague Mention Processing Pipeline

```typescript
function processVagueMedicationMention(
  extractedText: string,
  clinicalContext: ClinicalContext
): VagueMedicationResult {
  
  // Step 1: Detect vague medication class
  const detectedClass = detectMedicationClass(extractedText);
  if (!detectedClass) {
    return handleUnknownMedication(extractedText, clinicalContext);
  }
  
  // Step 2: Get class mapping
  const classMapping = drugClassMappings[detectedClass];
  if (!classMapping) {
    return handleUnmappedClass(detectedClass, extractedText);
  }
  
  // Step 3: Determine coding strategy
  const codingStrategy = determineCodingStrategy(classMapping, clinicalContext);
  
  // Step 4: Generate appropriate codes and identity
  return generateVagueCoding(classMapping, codingStrategy, clinicalContext);
}
```

### Coding Strategy Selection

```typescript
function determineCodingStrategy(
  classMapping: DrugClassMapping,
  context: ClinicalContext
): CodingStrategy {
  
  // Strategy 1: Class-based identity (safe medication classes)
  if (classMapping.identity_strategy === 'class_based_with_safety_flags') {
    return {
      approach: 'ATC_CLASS_CODE',
      identity_key: `atc:${classMapping.atc_code}`,
      deduplication_safe: true,
      confidence: 0.7,
      reasoning: 'Well-defined medication class with known safety profile'
    };
  }
  
  // Strategy 2: Conservative unique (high-risk medication classes)
  if (classMapping.identity_strategy === 'conservative_unique_per_mention') {
    return {
      approach: 'UNIQUE_PER_MENTION',
      identity_key: `vague:${context.document_id}:${classMapping.clinical_class}`,
      deduplication_safe: false,
      confidence: 0.5,
      reasoning: 'High-risk medication class - each mention kept separate for safety'
    };
  }
  
  // Strategy 3: Class with specific safety considerations
  if (classMapping.identity_strategy === 'class_based_with_bleeding_alerts') {
    return {
      approach: 'ATC_CLASS_WITH_ALERTS',
      identity_key: `atc_alert:${classMapping.atc_code}`,
      deduplication_safe: true,
      confidence: 0.6,
      safety_alerts: classMapping.safety_considerations,
      reasoning: 'Medication class with critical safety monitoring requirements'
    };
  }
  
  // Default: Conservative approach
  return {
    approach: 'CONSERVATIVE_FALLBACK',
    identity_key: `unknown_class:${context.document_id}`,
    deduplication_safe: false,
    confidence: 0.3
  };
}
```

## Specific Use Case Scenarios

### Scenario 1: "Started on steroids yesterday"

```typescript
const steroidsScenario = {
  input: {
    extracted_text: "Patient started on steroids yesterday",
    clinical_context: {
      document_date: "2024-03-15",
      document_type: "discharge_summary",
      indication_mentioned: false
    }
  },
  
  processing_result: {
    detected_class: "steroids",
    atc_code: "H02AB",
    clinical_class: "systemic_corticosteroids",
    
    // Medical code assignment
    selected_codes: {
      primary: "H02AB", // ATC code for systemic corticosteroids
      candidates: ["8640", "8635", "5492"], // Common RxNorm ingredients
      confidence: 0.7
    },
    
    // Identity determination
    clinical_identity_key: "atc:H02AB",
    identity_confidence: 0.7,
    deduplication_behavior: "merge_with_other_vague_steroid_mentions",
    
    // Clinical date assignment
    clinical_effective_date: "2024-03-14", // Yesterday from document date
    date_confidence: "medium",
    
    // Safety considerations
    safety_flags: [
      "requires_tapering", "infection_risk", "blood_sugar_monitoring",
      "adrenal_suppression_risk"
    ],
    
    // Pass 3 narrative integration
    narrative_context: {
      medication_journey_note: "Systemic corticosteroid therapy initiated",
      requires_follow_up_tracking: true,
      clinical_monitoring_needed: ["blood_glucose", "blood_pressure", "infection_signs"]
    }
  }
};
```

### Scenario 2: "Prescribed antibiotics for chest infection"

```typescript
const antibioticsScenario = {
  input: {
    extracted_text: "Prescribed antibiotics for chest infection",
    clinical_context: {
      indication: "chest_infection",
      indication_confidence: 0.9,
      document_type: "gp_letter"
    }
  },
  
  processing_result: {
    detected_class: "antibiotics",
    atc_code: "J01",
    clinical_class: "antibacterials_systemic",
    
    // Conservative coding approach for antibiotics
    selected_codes: {
      primary: "J01", // General antibacterials
      specific_candidates: [], // Too vague to suggest specific antibiotics
      confidence: 0.5
    },
    
    // Conservative identity (each mention separate)
    clinical_identity_key: `vague:${document_id}:antibiotics:chest_infection`,
    identity_confidence: 0.5,
    deduplication_behavior: "keep_separate_mentions", // Safety-first approach
    
    // Safety considerations
    safety_flags: [
      "allergy_screening_required", "c_diff_risk", "resistance_monitoring"
    ],
    
    // Clinical reasoning
    reasoning: "Antibiotic class too broad and high-risk - maintaining separate mentions for clinical safety",
    requires_clinical_clarification: true,
    
    // Follow-up requirements
    clinical_monitoring: {
      allergy_assessment_needed: true,
      culture_sensitivity_tracking: true,
      treatment_duration_unknown: true
    }
  }
};
```

### Scenario 3: "Continue blood pressure medications"

```typescript
const bloodPressureScenario = {
  input: {
    extracted_text: "Continue blood pressure medications",
    clinical_context: {
      patient_has_existing_bp_meds: true,
      existing_medications: ["lisinopril", "amlodipine"],
      document_type: "follow_up_note"
    }
  },
  
  processing_result: {
    detected_class: "blood_pressure_medications",
    atc_code: "C",  // Cardiovascular system (broad)
    clinical_class: "antihypertensives",
    
    // Link to existing medications when possible
    linking_strategy: {
      approach: "REFERENCE_TO_EXISTING",
      existing_medication_references: [
        {
          medication: "lisinopril",
          rxnorm_scd: "314076",
          reference_type: "continuation_implied"
        },
        {
          medication: "amlodipine", 
          rxnorm_scd: "197884",
          reference_type: "continuation_implied"
        }
      ]
    },
    
    // Identity approach
    clinical_identity_key: "medication_continuation_reference",
    deduplication_behavior: "link_to_existing_medications",
    confidence: 0.8,
    
    // Clinical interpretation
    clinical_meaning: "Continuation order for existing antihypertensive regimen",
    requires_existing_medication_validation: true,
    
    // Narrative integration
    medication_journey_impact: {
      status_update: "ongoing_therapy_confirmed",
      adherence_implied: true,
      effectiveness_implied: "stable_control"
    }
  }
};
```

## Missing Information Handling

### Incomplete Medication Information

```typescript
interface IncompleteMedicationHandling {
  missing_strength: {
    example: "Patient on Lisinopril" // No dose specified
    coding_strategy: 'ingredient_level_with_flags';
    identity_approach: 'conservative_with_composite_fallback';
    safety_measures: ['flag_incomplete_info', 'require_clinical_review'];
  };
  
  missing_frequency: {
    example: "Metformin 500mg" // No frequency
    coding_strategy: 'scd_partial_match';
    identity_approach: 'strength_based_with_unknown_frequency';
    safety_measures: ['flag_dosing_incomplete'];
  };
  
  missing_route: {
    example: "Hydrocortisone prescribed" // Route critical for safety
    coding_strategy: 'ingredient_with_route_flag';
    identity_approach: 'separate_until_route_clarified';
    safety_measures: ['route_clarification_required', 'no_merging_allowed'];
  };
}

function handleIncompleteMedication(
  medicationText: string,
  missingComponents: string[]
): IncompleteMedicationResult {
  
  if (missingComponents.includes('route') && isCriticalRouteDistinction(medicationText)) {
    return {
      coding_strategy: 'ROUTE_CRITICAL_SEPARATION',
      identity_key: `incomplete_route:${medicationText}:${document_id}`,
      deduplication_safe: false,
      reasoning: 'Route distinction critical for safety - cannot merge without route information',
      requires_clinical_clarification: true,
      safety_priority: 'high'
    };
  }
  
  if (missingComponents.includes('strength') && hasMultipleStrengthOptions(medicationText)) {
    return {
      coding_strategy: 'INGREDIENT_WITH_STRENGTH_FLAG',
      identity_key: `ingredient_incomplete:${getRxNormIngredient(medicationText)}`,
      deduplication_safe: false,
      reasoning: 'Multiple strength options available - strength clarification needed',
      requires_clinical_clarification: true,
      safety_priority: 'medium'
    };
  }
  
  // Handle less critical missing information
  return handleMinorIncompleteInfo(medicationText, missingComponents);
}
```

## Integration with Embedding System

### Vague Medication Embedding Strategy

**Reference**: [`./embedding-based-code-matching.md`](./embedding-based-code-matching.md) for embedding implementation

```typescript
function createVagueMedicationEmbeddings(): VagueMedicationEmbeddings {
  
  const vagueMedicationEntries = [
    {
      search_text: "steroids corticosteroids systemic prednisone prednisolone hydrocortisone anti-inflammatory",
      atc_code: "H02AB",
      clinical_class: "systemic_corticosteroids",
      common_names: ["steroids", "corticosteroids", "cortisone"],
      embedding_strategy: "broad_semantic_match"
    },
    
    {
      search_text: "antibiotics antibacterials penicillin amoxicillin cephalexin infection treatment",
      atc_code: "J01", 
      clinical_class: "antibacterials_systemic",
      common_names: ["antibiotics", "antibacterials", "antimicrobials"],
      embedding_strategy: "conservative_unique_matching"
    },
    
    {
      search_text: "blood thinners anticoagulants warfarin apixaban rivaroxaban clot prevention",
      atc_code: "B01A",
      clinical_class: "antithrombotic_agents",
      common_names: ["blood thinners", "anticoagulants", "blood thinning medication"],
      embedding_strategy: "class_based_with_safety_alerts"
    }
  ];
  
  return generateEmbeddingsForVagueMedications(vagueMedicationEntries);
}
```

### Vector Similarity Thresholds for Vague Matches

```typescript
const vagueMatchingThresholds = {
  high_confidence_vague: {
    similarity_threshold: 0.85,
    action: 'apply_class_coding',
    safety_validation: 'standard'
  },
  
  medium_confidence_vague: {
    similarity_threshold: 0.70,
    action: 'apply_class_coding_with_flags',
    safety_validation: 'enhanced'
  },
  
  low_confidence_vague: {
    similarity_threshold: 0.55,
    action: 'conservative_unique_identity',
    safety_validation: 'maximum'
  },
  
  insufficient_confidence: {
    similarity_threshold: 0.55,
    action: 'fallback_to_text_based',
    safety_validation: 'manual_review_required'
  }
};
```

## Clinical Decision Support Integration

### Safety Alerts for Vague Medications

```typescript
interface VagueMedicationCDS {
  alert_rules: {
    steroid_monitoring: {
      trigger: "atc_code IN ('H02AB', 'H02AA')",
      alerts: [
        "Blood glucose monitoring recommended",
        "Bone density assessment for long-term use",
        "Infection risk - monitor for fever/symptoms",
        "Gradual tapering required - do not stop abruptly"
      ],
      priority: 'high'
    },
    
    antibiotic_allergy_screening: {
      trigger: "clinical_class = 'antibacterials_systemic'",
      alerts: [
        "Penicillin allergy screening required",
        "Previous antibiotic reactions check needed",
        "C. difficile risk assessment"
      ],
      priority: 'critical'
    },
    
    anticoagulant_bleeding_risk: {
      trigger: "atc_code = 'B01A'",
      alerts: [
        "Bleeding risk assessment required",
        "INR monitoring may be needed",
        "Drug interaction screening critical",
        "Fall risk evaluation recommended"
      ],
      priority: 'critical'
    }
  }
};
```

## Success Criteria

### Vague Medication Handling Accuracy
- **90%+ correct class identification** for common vague medication mentions
- **Appropriate coding strategy selection** based on medication class safety profile
- **Zero unsafe merging** of high-risk vague medication classes
- **Clinical decision support alerts** triggered for safety-critical vague medications

### Safety and Clinical Utility
- **Conservative approach** for uncertain or high-risk medication classes
- **Complete audit trail** for all vague medication processing decisions
- **Clinical clarification flags** for information requiring follow-up
- **Integration with existing medications** when continuation implied

### Australian Healthcare Context
- **ATC code integration** meeting Australian therapeutic classification requirements
- **PBS class mapping** where applicable for local healthcare context
- **Australian medication terminology** recognition and processing

## Implementation Integration

### Pass 2 AI Enhancement
**Reference**: [`./pass1-to-pass2-enhancement.md`](./pass1-to-pass2-enhancement.md)

Pass 2 receives vague medication candidates and applies clinical reasoning for final code selection and safety flag assignment.

### Clinical Identity Integration
**Reference**: [`../temporal-data-management/clinical-identity-policies.md`](../temporal-data-management/clinical-identity-policies.md)

Vague medication codes integrate with identity determination logic, ensuring appropriate deduplication behavior based on safety considerations.

This vague medication handling framework ensures that unclear medication references are processed safely while providing maximum clinical utility through appropriate coding and safety alert integration.