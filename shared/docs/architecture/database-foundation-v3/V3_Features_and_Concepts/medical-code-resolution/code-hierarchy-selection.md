# Medical Code Hierarchy Selection

**Status**: Complete Implementation Specification  
**Purpose**: Define when and how to select appropriate medical code levels for accurate clinical entity identification

## Overview

Medical coding systems have multiple granularity levels. This framework ensures the right level of specificity is chosen for each clinical scenario, balancing safety (preventing unsafe merging) with effectiveness (enabling appropriate deduplication).

**Key Integration Points**:
- Used by [`./embedding-based-code-matching.md`](./embedding-based-code-matching.md) for code candidate selection
- Supports [`../temporal-data-management/clinical-identity-policies.md`](../temporal-data-management/clinical-identity-policies.md) for identity determination
- Referenced by [`./pass1-to-pass2-enhancement.md`](./pass1-to-pass2-enhancement.md) for AI processing workflow

## RxNorm Hierarchy Framework

### RxNorm Levels Overview

```typescript
interface RxNormHierarchy {
  // Most specific (preferred for identity)
  rxnorm_scd: string;    // Semantic Clinical Drug - "Lisinopril 10mg Oral Tablet"
  rxnorm_sbd: string;    // Semantic Branded Drug - "Prinivil 10mg Oral Tablet"  
  
  // Intermediate levels
  rxnorm_scdf: string;   // Semantic Clinical Drug Form - "Lisinopril Oral Tablet"
  rxnorm_sbdf: string;   // Semantic Branded Drug Form - "Prinivil Oral Tablet"
  
  // Too general for safe identity (use with caution)
  rxnorm_ingredient: string; // "Lisinopril" - can merge different strengths/forms unsafely
  rxnorm_pin: string;    // Precise Ingredient - includes salt forms
}
```

### Selection Priority Algorithm

```typescript
function selectOptimalRxNormCode(
  candidateCodes: RxNormCandidates,
  clinicalContext: ClinicalContext
): CodeSelection {
  
  // Priority 1: SCD (Semantic Clinical Drug) - Safest for identity
  if (candidateCodes.rxnorm_scd && candidateCodes.scd_confidence > 0.8) {
    return {
      selected_code: candidateCodes.rxnorm_scd,
      code_level: 'SCD',
      confidence: candidateCodes.scd_confidence,
      reasoning: 'Specific strength and form available - safest for deduplication'
    };
  }
  
  // Priority 2: SBD (Semantic Branded Drug) - When brand specificity matters
  if (candidateCodes.rxnorm_sbd && clinicalContext.brand_specific_therapy) {
    return {
      selected_code: candidateCodes.rxnorm_sbd,
      code_level: 'SBD',
      confidence: candidateCodes.sbd_confidence,
      reasoning: 'Brand-specific therapy identified - preserving brand information'
    };
  }
  
  // Priority 3: SCDF (Clinical Drug Form) - When strength unclear but form known
  if (candidateCodes.rxnorm_scdf && candidateCodes.scdf_confidence > 0.7) {
    return {
      selected_code: candidateCodes.rxnorm_scdf,
      code_level: 'SCDF',
      confidence: candidateCodes.scdf_confidence,
      reasoning: 'Form identified but strength unclear - conservative approach'
    };
  }
  
  // Priority 4: Ingredient level - ONLY with strict safeguards
  if (candidateCodes.rxnorm_ingredient && candidateCodes.ingredient_confidence > 0.9) {
    return {
      selected_code: candidateCodes.rxnorm_ingredient,
      code_level: 'INGREDIENT',
      confidence: candidateCodes.ingredient_confidence,
      reasoning: 'High-confidence ingredient identification - requires composite identity',
      requires_composite_identity: true,
      safety_warning: 'Ingredient-level code requires additional safeguards'
    };
  }
  
  // No suitable RxNorm code found
  return {
    selected_code: null,
    code_level: 'NONE',
    requires_fallback: true,
    reasoning: 'No RxNorm codes meet confidence thresholds'
  };
}
```

## Australian Healthcare Code Integration

### PBS Code Priority Framework

**Reference**: [`./australian-healthcare-codes.md`](./australian-healthcare-codes.md) for PBS structure details

```typescript
interface AustralianCodeSelection {
  pbs_item_code?: string;      // Pharmaceutical Benefits Scheme
  rxnorm_scd?: string;         // International standard
  atc_code?: string;           // Anatomical Therapeutic Chemical
  
  selection_strategy: 'pbs_priority' | 'rxnorm_priority' | 'dual_coding';
  local_context_score: number; // 0.0 to 1.0
}

function selectAustralianMedicationCode(
  pbsCandidates: PBSCandidate[],
  rxnormCandidates: RxNormCandidate[]
): AustralianCodeSelection {
  
  // Strategy 1: PBS Priority (Australian healthcare context)
  const highConfidencePBS = pbsCandidates.find(pbs => pbs.confidence > 0.85);
  if (highConfidencePBS) {
    return {
      selected_codes: {
        primary: highConfidencePBS.pbs_item_code,
        secondary: findMatchingRxNorm(highConfidencePBS)
      },
      selection_strategy: 'pbs_priority',
      reasoning: 'High-confidence PBS match with Australian clinical context',
      local_context_score: 0.95
    };
  }
  
  // Strategy 2: RxNorm Priority (International compatibility)
  const highConfidenceRxNorm = selectOptimalRxNormCode(rxnormCandidates);
  if (highConfidenceRxNorm.confidence > 0.85) {
    return {
      selected_codes: {
        primary: highConfidenceRxNorm.selected_code,
        secondary: findMatchingPBS(highConfidenceRxNorm)
      },
      selection_strategy: 'rxnorm_priority',
      reasoning: 'High-confidence RxNorm match with international standards',
      local_context_score: 0.7
    };
  }
  
  // Strategy 3: Dual Coding (Both available, moderate confidence)
  return {
    selected_codes: {
      primary: highConfidencePBS?.pbs_item_code || highConfidenceRxNorm?.selected_code,
      secondary: null
    },
    selection_strategy: 'dual_coding',
    reasoning: 'Moderate confidence - use available codes with validation',
    requires_validation: true
  };
}
```

## Combination Therapy Handling

### Multi-Ingredient Medication Rules

```typescript
interface CombinationTherapyDetection {
  is_combination: boolean;
  active_ingredients: string[];
  combination_type: 'fixed_dose' | 'variable_dose' | 'separate_components';
  coding_strategy: 'combination_specific' | 'component_separate';
}

function handleCombinationTherapy(
  medicationText: string,
  candidateCodes: MedicalCodeCandidates
): CombinationTherapySelection {
  
  const ingredients = extractActiveIngredients(medicationText);
  
  if (ingredients.length > 1) {
    // CRITICAL: Combination drugs need specific SCD codes
    const combinationSCD = candidateCodes.find(code => 
      code.type === 'rxnorm_scd' && 
      includesAllIngredients(code.ingredients, ingredients)
    );
    
    if (combinationSCD && combinationSCD.confidence > 0.8) {
      return {
        selected_code: combinationSCD.code,
        coding_approach: 'combination_specific_scd',
        safety_level: 'high',
        reasoning: 'Specific combination SCD found - prevents unsafe component merging'
      };
    }
    
    // FALLBACK: Mark as combination requiring manual review
    return {
      selected_code: null,
      coding_approach: 'combination_manual_review',
      safety_level: 'conservative',
      reasoning: 'Combination therapy without specific SCD - requires clinical review',
      requires_manual_review: true,
      components_identified: ingredients
    };
  }
  
  // Single ingredient - standard processing
  return handleSingleIngredientMedication(medicationText, candidateCodes);
}
```

### Example Combination Scenarios

```typescript
const combinationExamples = {
  // SAFE: Specific combination SCD available
  lisinopril_hctz: {
    text: "Lisinopril 10mg/HCTZ 12.5mg",
    rxnorm_scd: "314077", // Specific combination code
    identity_key: "rxnorm_scd:314077",
    safe_for_deduplication: true
  },
  
  // UNSAFE: Would merge if using ingredient codes
  components_separate: {
    lisinopril_alone: {
      rxnorm_ingredient: "29046", // Same ingredient code
      identity_key: "ingredient:29046" // DANGEROUS - would merge with combination
    },
    lisinopril_combination: {
      rxnorm_ingredient: "29046", // Same ingredient code  
      identity_key: "ingredient:29046" // DANGEROUS - would merge with monotherapy
    }
  },
  
  // SOLUTION: Use SCD-level codes
  safe_separation: {
    lisinopril_alone: {
      rxnorm_scd: "314076", // Monotherapy SCD
      identity_key: "rxnorm_scd:314076"
    },
    lisinopril_combination: {
      rxnorm_scd: "314077", // Combination SCD
      identity_key: "rxnorm_scd:314077" 
    }
  }
};
```

## Route and Form Specificity Requirements

### Critical Safety Distinctions

```typescript
interface RouteFormSafety {
  route: string;
  dose_form: string;
  safety_implications: 'high' | 'medium' | 'low';
  requires_separate_identity: boolean;
}

function validateRouteFormSafety(
  medication1: MedicationCandidate,
  medication2: MedicationCandidate  
): RouteFormValidation {
  
  const criticalDistinctions = {
    // Same ingredient, different routes - MUST separate
    route_critical: [
      { ingredient: "hydrocortisone", routes: ["oral", "topical"], safety: "critical" },
      { ingredient: "morphine", routes: ["oral", "injection"], safety: "critical" },
      { ingredient: "insulin", routes: ["subcutaneous", "inhalation"], safety: "critical" }
    ],
    
    // Same route, different forms - MUST separate  
    form_critical: [
      { ingredient: "metoprolol", forms: ["immediate_release", "extended_release"], safety: "critical" },
      { ingredient: "nifedipine", forms: ["immediate_release", "sustained_release"], safety: "critical" }
    ]
  };
  
  // Check for critical route differences
  if (medication1.ingredient === medication2.ingredient) {
    if (medication1.route !== medication2.route) {
      const criticalRoute = criticalDistinctions.route_critical.find(
        item => item.ingredient === medication1.ingredient
      );
      
      if (criticalRoute) {
        return {
          validation_result: 'UNSAFE_TO_MERGE',
          reason: 'critical_route_difference',
          safety_level: 'high',
          requires_separate_codes: true
        };
      }
    }
    
    // Check for critical form differences
    if (medication1.dose_form !== medication2.dose_form) {
      const criticalForm = criticalDistinctions.form_critical.find(
        item => item.ingredient === medication1.ingredient
      );
      
      if (criticalForm) {
        return {
          validation_result: 'UNSAFE_TO_MERGE',
          reason: 'critical_form_difference', 
          safety_level: 'high',
          requires_separate_codes: true
        };
      }
    }
  }
  
  return {
    validation_result: 'SAFE_TO_CONSIDER',
    safety_level: 'low'
  };
}
```

## Quality Thresholds and Confidence Scoring

### Code Selection Confidence Framework

```typescript
interface CodeConfidenceThresholds {
  // High confidence - safe for automatic selection
  high_confidence: {
    min_threshold: 0.85,
    auto_approve: true,
    suitable_for_identity: true
  };
  
  // Medium confidence - use with validation
  medium_confidence: {
    min_threshold: 0.7,
    requires_validation: true,
    suitable_for_identity: 'with_safeguards'
  };
  
  // Low confidence - conservative approach
  low_confidence: {
    min_threshold: 0.5,
    requires_manual_review: true,
    suitable_for_identity: false
  };
  
  // Below threshold - fallback required
  insufficient_confidence: {
    max_threshold: 0.5,
    requires_fallback: true,
    suitable_for_identity: false
  };
}

function calculateCodeConfidence(
  extractedText: string,
  candidateCode: MedicalCode,
  contextFactors: ContextFactors
): ConfidenceScore {
  
  let confidence = candidateCode.base_similarity_score;
  
  // Boost confidence for exact name matches
  if (candidateCode.display_name.toLowerCase() === extractedText.toLowerCase()) {
    confidence += 0.15;
  }
  
  // Boost for Australian context if PBS code
  if (candidateCode.code_system === 'pbs' && contextFactors.australian_context) {
    confidence += 0.1;
  }
  
  // Reduce confidence for vague matches
  if (candidateCode.match_type === 'partial' || candidateCode.match_type === 'fuzzy') {
    confidence -= 0.1;
  }
  
  // Reduce confidence for ingredient-level when strength/form extracted
  if (candidateCode.level === 'ingredient' && contextFactors.strength_mentioned) {
    confidence -= 0.2;
  }
  
  return {
    final_confidence: Math.max(0, Math.min(1, confidence)),
    confidence_factors: {
      base_similarity: candidateCode.base_similarity_score,
      exact_match_bonus: candidateCode.display_name.toLowerCase() === extractedText.toLowerCase(),
      australian_bonus: candidateCode.code_system === 'pbs' && contextFactors.australian_context,
      vague_penalty: candidateCode.match_type !== 'exact',
      granularity_penalty: candidateCode.level === 'ingredient' && contextFactors.strength_mentioned
    }
  };
}
```

## Fallback Strategies

### When Standard Codes Unavailable

```typescript
function generateFallbackCoding(
  medicationEntity: MedicationEntity,
  failedCodeAttempts: FailedCodeAttempt[]
): FallbackStrategy {
  
  // Strategy 1: Composite identity from extracted attributes
  if (medicationEntity.ingredient_name && medicationEntity.strength) {
    return {
      fallback_type: 'COMPOSITE_IDENTITY',
      identity_components: {
        ingredient: medicationEntity.ingredient_name,
        strength: medicationEntity.strength,
        route: medicationEntity.route || 'unknown',
        dose_form: medicationEntity.dose_form || 'unknown'
      },
      confidence: calculateCompositeConfidence(medicationEntity),
      suitable_for_deduplication: true
    };
  }
  
  // Strategy 2: ATC class-level coding for vague mentions
  if (medicationEntity.medication_class) {
    return {
      fallback_type: 'ATC_CLASS',
      atc_code: medicationEntity.medication_class.atc_code,
      class_name: medicationEntity.medication_class.name,
      confidence: 0.6,
      suitable_for_deduplication: false, // Too general
      requires_manual_review: true
    };
  }
  
  // Strategy 3: Conservative unique identity
  return {
    fallback_type: 'CONSERVATIVE_UNIQUE',
    unique_identifier: `fallback:${medicationEntity.id}:${medicationEntity.text_hash}`,
    confidence: 0.3,
    suitable_for_deduplication: false,
    reasoning: 'Insufficient information for safe coding - preventing unsafe merges'
  };
}
```

## Integration with Pass 2 AI Processing

### Code Selection Instructions for AI

**Reference**: [`./pass1-to-pass2-enhancement.md`](./pass1-to-pass2-enhancement.md) for AI integration workflow

```typescript
function generatePass2CodeInstructions(
  entityCandidates: CodeCandidates[]
): Pass2Instructions {
  
  return {
    instruction_template: `
    You are provided with ${entityCandidates.length} candidate medical codes for this entity.
    Select the most appropriate code following this hierarchy:
    
    PRIORITY 1 (Highest): RxNorm SCD codes with confidence > 0.8
    - These provide specific strength + form information
    - Safe for clinical deduplication
    
    PRIORITY 2: PBS item codes (Australian context)
    - Use when confidence > 0.8 and Australian healthcare context
    - Include RxNorm mapping if available
    
    PRIORITY 3: RxNorm SBD codes (branded medications)
    - Use when brand specificity is clinically relevant
    - Confidence threshold: > 0.8
    
    PRIORITY 4: Ingredient-level codes WITH CAUTION
    - Only when strength/form unavailable
    - Mark as requiring composite identity
    - Confidence threshold: > 0.9
    
    OUTPUT REQUIREMENTS:
    - selected_code: The chosen code
    - code_system: rxnorm_scd, rxnorm_sbd, pbs, etc.
    - confidence: Your confidence in this selection (0.0-1.0)
    - reasoning: Why this code was selected
    - safety_flags: Any safety concerns or requirements
    `,
    
    candidate_codes: entityCandidates,
    safety_guidelines: {
      never_merge_different_routes: true,
      never_merge_different_forms: true,
      require_scd_for_combinations: true,
      flag_low_confidence: true
    }
  };
}
```

## Success Criteria

### Code Selection Accuracy
- **95%+ appropriate granularity selection** (SCD when strength available)
- **Zero unsafe ingredient-level merging** for different routes/forms  
- **Australian code integration** meeting local healthcare requirements
- **Combination therapy safety** preventing dangerous component merging

### Quality Assurance
- **Confidence thresholds enforced** across all code selection decisions
- **Fallback strategies** for uncertain or incomplete information
- **Safety validation** preventing clinical data contamination
- **Complete audit trail** for code selection reasoning

### Performance Requirements
- **Sub-100ms code selection** for real-time processing
- **Scalable to Australian medication database** (PBS + RxNorm integration)
- **Efficient candidate filtering** based on confidence thresholds

## Next Steps

1. **Implement embedding database**: Populate with hierarchy-aware medical codes
2. **Integrate with Pass 2**: Provide candidate codes with selection instructions  
3. **Validate Australian codes**: Ensure PBS integration meets local requirements
4. **Test safety scenarios**: Validate combination therapy and route/form handling

This hierarchy selection framework ensures that the medical code resolution system chooses appropriate granularity levels for safe clinical entity deduplication while maintaining Australian healthcare compliance.