/**
 * Pass 1 Entity Detection - AI Prompt Templates
 * Created: 2025-10-03
 * Updated: 2025-11-28 - Added OCR-only mode (Strategy-A)
 * Purpose: Prompt templates for entity detection
 *
 * TWO MODES:
 * 1. Legacy (dual-input): Vision + OCR for maximum accuracy (58% of input is image tokens)
 * 2. OCR-only (Strategy-A): Enhanced OCR text only (no image tokens, ~60% cost reduction)
 *
 * These prompts instruct the AI to:
 * 1. [Legacy] Analyze raw document image with vision capabilities (PRIMARY)
 * 2. [Legacy] Use OCR spatial data for cross-validation (SECONDARY)
 * 3. [OCR-only] Analyze enhanced OCR text with Y-coordinates (PRIMARY)
 * 4. Classify entities using 3-category taxonomy
 * 5. Provide confidence scores and quality metrics
 */

import { Pass1Input } from './pass1-types';

// =============================================================================
// ENTITY CLASSIFICATION TAXONOMY (Embedded in Prompt)
// =============================================================================

const ENTITY_TAXONOMY = `
=== CLINICAL EVENTS (Full medical analysis required) ===
These entities require full Pass 2 medical enrichment and timeline integration:

• vital_sign: Physiological measurements (BP: 140/90, temp: 98.6°F, pulse: 72 bpm)
• lab_result: Laboratory test results (glucose: 95 mg/dL, HbA1c: 6.1%)
• physical_finding: Clinical examination findings (heart murmur, clear breath sounds)
• symptom: Patient-reported symptoms (chest pain, shortness of breath)
• medication: Prescribed medications (Lisinopril 10mg daily, Tylenol PRN)
• procedure: Medical procedures (colonoscopy, chest X-ray, blood draw)
• immunization: Vaccines administered (COVID-19 vaccine, flu shot)
• diagnosis: Medical diagnoses (Type 2 Diabetes, Hypertension)
• allergy: Known allergies (penicillin allergy, shellfish intolerance)
• healthcare_encounter: Clinical visits (follow-up visit, ER visit, consultation)
• clinical_other: Clinical information not fitting other subtypes (requires manual review)

=== HEALTHCARE CONTEXT (Profile matching and context) ===
These entities require limited Pass 2 enrichment for context and compliance:

• patient_identifier: Patient ID info (John Smith, DOB: 01/15/1980, MRN: 12345)
• provider_identifier: Healthcare provider info (Dr. Sarah Johnson, NPI: 1234567890)
• facility_identifier: Healthcare facility info (Memorial Hospital, Room 204)
• appointment: Scheduled appointments (follow-up visit 3/15/2024, annual physical)
• referral: Provider referrals (refer to orthopedics, cardiology consultation)
• care_coordination: Care plans (discharge plan, follow-up instructions)
• insurance_information: Coverage details (Blue Cross, Policy #: ABC123)
• billing_code: Medical codes (CPT 99213, ICD-10 E11.9)
• authorization: Prior authorizations (insurance verification, prior auth approved)
• healthcare_context_other: Healthcare info not fitting other subtypes

=== DOCUMENT STRUCTURE (Logging only - no medical enrichment) ===
These entities are logged for completeness but require no medical processing:

• header: Document headers and letterheads
• footer: Document footers and disclaimers
• logo: Institutional logos and graphics
• page_marker: Page numbers and navigation elements
• signature_line: Signature areas and authorization fields
• watermark: Document watermarks and security features
• form_structure: Form fields and layout elements
• document_structure_other: Structural elements not fitting other categories
`;

// =============================================================================
// ENTITY DISAMBIGUATION RULES
// =============================================================================

const DISAMBIGUATION_RULES = `
ENTITY DISAMBIGUATION RULES:
- If substance name with dosage → medication; if condition name → diagnosis
- If scheduled/future → appointment; if performed/completed → procedure
- If with credentials/title → provider_identifier; if signature line → signature_line
- When entity spans multiple categories, split into separate entities
- When uncertain, prefer clinical relevance over document structure
`;

// =============================================================================
// MAIN CLASSIFICATION PROMPT
// =============================================================================

export function generatePass1ClassificationPrompt(input: Pass1Input, modelName: string = 'vision-model'): string {
  return `
You are a medical document entity detection system using DUAL INPUTS for maximum accuracy.

INPUT 1 - RAW DOCUMENT IMAGE: [Base64 image provided to vision model]

INPUT 2 - OCR REFERENCE DATA:
• OCR Text: "${truncateOCRText(input.ocr_spatial_data.extracted_text, 2000)}"
• Spatial Coordinates: ${formatSpatialMapping(input.ocr_spatial_data.spatial_mapping, 100)}
• OCR Confidence: ${input.ocr_spatial_data.ocr_confidence}
• OCR Provider: ${input.ocr_spatial_data.ocr_provider}

PROCESSING INSTRUCTIONS:
1. PRIMARY ANALYSIS: Use your vision capabilities to interpret the raw document image
2. SPATIAL MAPPING: For each entity you identify visually, map it to the closest OCR spatial coordinates
3. CROSS-VALIDATION: Use OCR text as reference but trust your visual interpretation for accuracy
4. DISCREPANCY DETECTION: Note where your vision differs from OCR interpretation
5. QUALITY ASSESSMENT: Evaluate visual quality and readability of each entity

CRITICAL REQUIREMENTS:
1. Analyze RAW IMAGE as primary source; use OCR for spatial coordinates and cross-validation
2. Flag discrepancies between vision and OCR
3. Identify 100% of visible document content
4. Mark spatial_source as: "ocr_exact" (high precision), "ocr_approximate" (uncertain), "ai_estimated" (no OCR match), or "none"
5. Always emit uncertain items; set requires_manual_review=true when confidence < 0.7

CRITICAL: LIST HANDLING RULES (STRICT)
- Treat each list item as a SEPARATE entity across all list formats:
  - Bullet/numbered lists, comma-separated lines, table rows/columns
- If a single line contains multiple items (commas, slashes, "and"), SPLIT into separate entities
- Preserve item order and page locality; do not summarize lists
- Only deduplicate exact duplicates (character-for-character). Similar items must remain separate
- Report overall list extraction metrics in document_coverage.list_extraction_metrics:
  - total_list_items_found: <count of visually distinct items across entire document>
  - total_entities_emitted: <count of entities created from lists>
  - list_items_missed: ["verbatim text of any missed item"] (empty if none)

OUTPUT SIZE SAFEGUARDS
- Truncate all free-text fields (ai_sees, ocr_text, discrepancy_notes, formatting_context) to <=120 characters
- Do not include unrequested narrative or analysis
- Keep JSON output lean and focused on entity data only

CLASSIFICATION CATEGORIES:

${ENTITY_TAXONOMY}

${DISAMBIGUATION_RULES}

RESPONSE FORMAT:
Return JSON with: processing_metadata (model_used="${modelName}", vision_processing=true, token_usage, cost_estimate, confidence_metrics), entities array (entity_id, original_text, classification{entity_category, entity_subtype, confidence}, visual_interpretation{ai_sees, formatting_context, visual_quality, ai_confidence}, ocr_cross_reference{ocr_text, ocr_confidence, ai_ocr_agreement, discrepancy_type, discrepancy_notes}, spatial_information{page_number, bounding_box{x,y,width,height}, unique_marker, location_context, spatial_source}, quality_indicators{detection_confidence, classification_confidence, cross_validation_score, requires_manual_review}), document_coverage{total_content_processed, content_classified, coverage_percentage, unclassified_segments, visual_quality_score, list_extraction_metrics{total_list_items_found, total_entities_emitted, list_items_missed}}, cross_validation_results{ai_ocr_agreement_score, high_discrepancy_count, ocr_missed_entities, ai_missed_ocr_text, spatial_mapping_success_rate}, quality_assessment{completeness_score, classification_confidence, cross_validation_score, requires_manual_review, quality_flags}, profile_safety{patient_identity_confidence, age_appropriateness_score, safety_flags, requires_identity_verification}.

Process this document using both visual analysis and OCR cross-validation. Return ONLY the JSON object, no additional text.
`.trim();
}

// =============================================================================
// SYSTEM MESSAGE (For Chat Completions API)
// =============================================================================

export const PASS1_SYSTEM_MESSAGE = `You are a medical document entity detection system using dual inputs (vision + OCR) for maximum accuracy. You analyze medical documents to identify and classify every piece of information into three categories: clinical events, healthcare context, and document structure. You provide confidence scores, spatial coordinates, and cross-validation metrics for all detected entities.`;

// =============================================================================
// VALIDATION PROMPT (For Quality Assurance)
// =============================================================================

export function generateValidationPrompt(
  documentText: string,
  classificationResults: string
): string {
  return `
You are a medical document validation system. Review the entity classification results and identify any issues.

VALIDATION CRITERIA:
1. Document Coverage: Is 100% of the text classified?
2. Category Accuracy: Are entities in the correct categories?
3. Subtype Precision: Are subtypes appropriate for the text?
4. Confidence Levels: Are confidence scores realistic?
5. Medical Relevance: Are clinical entities properly identified?

ORIGINAL DOCUMENT:
${documentText}

CLASSIFICATION RESULTS:
${classificationResults}

VALIDATION RESPONSE FORMAT:
{
  "validation_results": {
    "coverage_validation": {
      "complete_coverage": true/false,
      "missing_segments": ["text not classified"],
      "coverage_score": <0.0-1.0>
    },
    "category_validation": {
      "category_accuracy": <0.0-1.0>,
      "misclassified_entities": [
        {
          "entity_id": "ent_001",
          "current_category": "healthcare_context",
          "suggested_category": "clinical_event",
          "reason": "Blood pressure reading should be clinical_event"
        }
      ]
    },
    "confidence_validation": {
      "confidence_distribution": {
        "high_confidence": <count>,
        "medium_confidence": <count>,
        "low_confidence": <count>
      },
      "concerning_entities": ["entity_ids with suspiciously high/low confidence"]
    },
    "medical_relevance": {
      "clinical_entities_identified": <count>,
      "missed_clinical_content": ["potential clinical entities not identified"],
      "over_identified": ["non-clinical content marked as clinical"]
    }
  },
  "overall_quality": {
    "validation_score": <0.0-1.0>,
    "ready_for_pass2": true/false,
    "requires_human_review": true/false,
    "critical_issues": ["list of blocking issues"]
  },
  "recommendations": [
    "Specific recommendations for improvement"
  ]
}
`.trim();
}

// =============================================================================
// ERROR RECOVERY PROMPT
// =============================================================================

export function generateErrorRecoveryPrompt(
  errorDetails: string,
  documentSegment: string
): string {
  return `
The initial entity classification encountered issues. Please perform a focused re-classification.

ORIGINAL ISSUES IDENTIFIED:
${errorDetails}

FOCUS AREAS FOR RE-CLASSIFICATION:
1. Ensure complete document coverage
2. Resolve category ambiguities
3. Improve confidence scoring
4. Identify missed clinical content

Use the same classification system as before, but pay special attention to the identified issues.

DOCUMENT SECTION TO RE-PROCESS:
${documentSegment}

Return corrected classification using the same JSON format.
`.trim();
}

// =============================================================================
// OCR-ONLY MODE PROMPT (Strategy-A)
// =============================================================================

/**
 * Generate Pass 1 classification prompt for OCR-only mode
 * Uses enhanced OCR with Y-coordinates (no raw image)
 *
 * Strategy-A: OCR is PRIMARY input. No vision processing.
 * Expected ~60% cost reduction from removing image tokens.
 *
 * @param enhancedOCR Enhanced OCR text in Y-only format: [Y:###] text text text
 * @param modelName AI model name for metadata
 */
export function generatePass1ClassificationPromptOCROnly(
  enhancedOCR: string,
  modelName: string = 'gpt-4o-mini'
): string {
  return `
You are a medical document entity detection system analyzing OCR-extracted text.

INPUT - ENHANCED OCR TEXT WITH Y-COORDINATES:
Each line is prefixed with [Y:###] indicating the vertical position (in pixels from top).
Lines are sorted top-to-bottom by Y-coordinate.

--- BEGIN DOCUMENT TEXT ---
${enhancedOCR}
--- END DOCUMENT TEXT ---

PROCESSING INSTRUCTIONS:
1. PRIMARY ANALYSIS: Parse the OCR text to identify all medical entities
2. SPATIAL AWARENESS: Use Y-coordinates to understand document structure and reading order
3. ENTITY GROUPING: Group related items that appear on consecutive Y-lines
4. COVERAGE: Identify 100% of clinically relevant content

CRITICAL REQUIREMENTS:
1. Analyze OCR text as the sole source of truth
2. Use Y-coordinates for spatial positioning and document structure analysis
3. Identify 100% of visible document content
4. Mark spatial_source as "ocr_exact" (coordinates come directly from OCR)
5. Always emit uncertain items; set requires_manual_review=true when confidence < 0.7

CRITICAL: LIST HANDLING RULES (STRICT)
- Treat each list item as a SEPARATE entity across all list formats:
  - Bullet/numbered lists, comma-separated lines, table rows/columns
- If a single line contains multiple items (commas, slashes, "and"), SPLIT into separate entities
- Preserve item order and page locality; do not summarize lists
- Only deduplicate exact duplicates (character-for-character). Similar items must remain separate
- Report overall list extraction metrics in document_coverage.list_extraction_metrics:
  - total_list_items_found: <count of distinct items across entire document>
  - total_entities_emitted: <count of entities created from lists>
  - list_items_missed: ["verbatim text of any missed item"] (empty if none)

Y-COORDINATE INTERPRETATION:
- Lower Y values = higher on page (near top)
- Higher Y values = lower on page (near bottom)
- Items with similar Y values (~10px tolerance) are on the same visual line
- Large Y gaps (>50px) typically indicate section breaks

OUTPUT SIZE SAFEGUARDS
- Truncate all free-text fields (ai_sees, ocr_text, discrepancy_notes, formatting_context) to <=120 characters
- Do not include unrequested narrative or analysis
- Keep JSON output lean and focused on entity data only

CLASSIFICATION CATEGORIES:

${ENTITY_TAXONOMY}

${DISAMBIGUATION_RULES}

RESPONSE FORMAT:
Return JSON with: processing_metadata (model_used="${modelName}", vision_processing=false, token_usage, cost_estimate, confidence_metrics), entities array (entity_id, original_text, classification{entity_category, entity_subtype, confidence}, visual_interpretation{ai_sees, formatting_context, visual_quality:"ocr_only", ai_confidence}, ocr_cross_reference{ocr_text, ocr_confidence:1.0, ai_ocr_agreement:1.0, discrepancy_type:null, discrepancy_notes:null}, spatial_information{page_number:1, bounding_box{x:0,y:<Y-coordinate>,width:0,height:0}, unique_marker, location_context, spatial_source:"ocr_exact"}, quality_indicators{detection_confidence, classification_confidence, cross_validation_score:1.0, requires_manual_review}), document_coverage{total_content_processed, content_classified, coverage_percentage, unclassified_segments, visual_quality_score:0.9, list_extraction_metrics{total_list_items_found, total_entities_emitted, list_items_missed}}, cross_validation_results{ai_ocr_agreement_score:1.0, high_discrepancy_count:0, ocr_missed_entities:0, ai_missed_ocr_text:0, spatial_mapping_success_rate:1.0}, quality_assessment{completeness_score, classification_confidence, cross_validation_score:1.0, requires_manual_review, quality_flags}, profile_safety{patient_identity_confidence, age_appropriateness_score, safety_flags, requires_identity_verification}.

Process this document using OCR text analysis. Return ONLY the JSON object, no additional text.
`.trim();
}

/**
 * System message for OCR-only mode
 */
export const PASS1_SYSTEM_MESSAGE_OCR_ONLY = `You are a medical document entity detection system analyzing OCR-extracted text with spatial coordinates. You identify and classify every piece of information into three categories: clinical events, healthcare context, and document structure. You provide confidence scores and spatial coordinates for all detected entities. You work with OCR text only - no image analysis.`;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Truncate OCR text if it's too long for the prompt
 */
export function truncateOCRText(text: string, maxLength: number = 2000): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '... [truncated]';
}

/**
 * Format spatial mapping for prompt (if needed to reduce size)
 */
export function formatSpatialMapping(
  spatialMapping: any[],
  maxElements: number = 100
): string {
  const truncated = spatialMapping.slice(0, maxElements);
  const result = JSON.stringify(truncated, null, 2);

  if (spatialMapping.length > maxElements) {
    return result + `\n... [${spatialMapping.length - maxElements} more elements truncated]`;
  }

  return result;
}
