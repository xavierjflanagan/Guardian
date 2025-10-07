/**
 * TEST 04 PHASE 1: Minimal Prompt + Entity Taxonomy
 * Created: 2025-10-07
 * Purpose: Add structured entity classification while maintaining extraction quality
 *
 * Evolution from Test 03 (baseline):
 * - Test 03: 20 lines, 53 entities avg, no classification
 * - Phase 1: ~60 lines, target 50+ entities with proper categories
 *
 * Phase 1 adds: Compact 3-tier taxonomy, disambiguation rules, combo vaccine splitting
 */

import { Pass1Input } from './pass1-types';

// =============================================================================
// ENTITY TAXONOMY (Compact Version - Based on Gold Standard)
// =============================================================================

const ENTITY_TAXONOMY = `
=== CLINICAL EVENTS (Full medical analysis required) ===
• vital_sign: BP, temp, pulse, weight, height
• lab_result: Blood tests, glucose, HbA1c, cholesterol
• physical_finding: Exam findings, heart sounds, breath sounds
• symptom: Patient complaints, chest pain, headache
• medication: Prescribed drugs with dosage
• procedure: Medical procedures, surgeries, imaging
• immunization: Vaccines administered (split combo vaccines by disease)
• diagnosis: Medical conditions, diseases
• allergy: Known allergies and adverse reactions
• healthcare_encounter: Visits, consultations, ER admissions
• clinical_other: Clinical info not fitting other subtypes

=== HEALTHCARE CONTEXT (Profile matching) ===
• patient_identifier: Name, DOB, MRN, address, phone
• provider_identifier: Doctor names, NPI, credentials
• facility_identifier: Hospital, clinic, room numbers
• appointment: Scheduled visits, follow-ups
• referral: Specialist referrals
• insurance_information: Coverage, policy numbers
• billing_code: CPT, ICD-10 codes
• healthcare_context_other: Healthcare info not fitting other subtypes

=== DOCUMENT STRUCTURE (Logging only) ===
• section_header: Document section titles
• page_marker: Page numbers, footers
• logo: Institutional branding
• signature_line: Signature areas
• watermark: Security features
• document_structure_other: Structural elements not fitting other categories
`;

const DISAMBIGUATION_RULES = `
DISAMBIGUATION:
- Substance + dosage → medication; condition name → diagnosis
- Scheduled/future → appointment; performed → procedure
- With credentials → provider_identifier; signature area → signature_line
- Combo vaccines: SPLIT into separate entities per disease (e.g., "Boostrix (Pertussis, Diphtheria, Tetanus)" → 3 immunization entities)
- Skip standalone disease names if already in dated clinical entries (legend items)
`;

// =============================================================================
// MINIMAL PROMPT WITH TAXONOMY
// =============================================================================

/**
 * Phase 1: Minimal prompt + entity taxonomy for classification
 */
export function generateMinimalListPrompt(_input: Pass1Input): string {
  return `
Extract EVERY piece of information from this medical document as SEPARATE entities with proper classification.

CRITICAL LIST RULES (UNCHANGED FROM BASELINE):
1. Each list item = separate entity (DO NOT summarize lists)
2. If you see 9 immunizations, emit 9 separate entities
3. Each phone number, address line = separate entity
4. Split multi-item lines (commas, "and", slashes) into separate entities
5. Combination vaccines: Split into separate entities per disease component

ENTITY CLASSIFICATION:
${ENTITY_TAXONOMY}

${DISAMBIGUATION_RULES}

ADDITIONAL RULES:
- Section headers (Immunisations, Medications, Family History) → section_header
- Do NOT extract standalone disease names if already captured in dated entries
- Each immunization record with date = separate immunization entity
- "Not recorded" or "Nil known" → clinical_other (clinical status info)
- ALWAYS emit uncertain items; set confidence < 0.7 when unsure (never skip entities)
- Cap original_text to 120 characters (truncate longer text)

Return JSON with this EXACT structure:
{
  "processing_metadata": {
    "model_used": "gpt-5-mini",
    "vision_processing": true,
    "processing_time_seconds": 0,
    "token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    "cost_estimate": 0,
    "confidence_metrics": {
      "overall_confidence": 0.9,
      "visual_interpretation_confidence": 0.9,
      "category_confidence": {"clinical_event": 0.9, "healthcare_context": 0.9, "document_structure": 0.9}
    }
  },
  "entities": [
    {
      "entity_id": "ent_001",
      "original_text": "exact text from document (max 120 chars)",
      "classification": {
        "entity_category": "clinical_event|healthcare_context|document_structure",
        "entity_subtype": "specific_subtype_from_taxonomy",
        "confidence": 0.95
      },
      "visual_interpretation": {
        "ai_sees": "same as original_text",
        "formatting_context": "plain text|bold|header|list item",
        "visual_quality": "clear|blurry|handwritten",
        "ai_confidence": 0.95
      },
      "ocr_cross_reference": {
        "ocr_text": "same as original_text",
        "ocr_confidence": 0.9,
        "ai_ocr_agreement": 0.95,
        "discrepancy_type": "none|typo|abbreviation",
        "discrepancy_notes": "any differences or 'none'"
      },
      "spatial_information": {
        "page_number": 1,
        "bounding_box": {"x": 0, "y": 0, "width": 100, "height": 20},
        "unique_marker": "same as original_text",
        "location_context": "page X, section name",
        "spatial_source": "ocr_exact|ocr_approximate|ai_estimated"
      },
      "quality_indicators": {
        "detection_confidence": 0.95,
        "classification_confidence": 0.95,
        "cross_validation_score": 0.95,
        "requires_manual_review": false
      }
    }
  ],
  "document_coverage": {
    "total_content_processed": 100,
    "content_classified": 100,
    "coverage_percentage": 100,
    "unclassified_segments": [],
    "visual_quality_score": 0.9,
    "list_extraction_metrics": {
      "total_list_items_found": 50,
      "total_entities_emitted": 50,
      "list_items_missed": []
    }
  },
  "cross_validation_results": {
    "ai_ocr_agreement_score": 0.95,
    "high_discrepancy_count": 0,
    "ocr_missed_entities": 0,
    "ai_missed_ocr_text": 0,
    "spatial_mapping_success_rate": 1.0
  },
  "quality_assessment": {
    "completeness_score": 1.0,
    "accuracy_score": 0.95,
    "requires_review": false
  },
  "profile_safety": {
    "patient_identity_confidence": 0.95,
    "pii_detected": true,
    "profile_verification_status": "confident"
  }
}

NOTE:
- Bounding_box values are pixel coordinates (use 0,0,100,20 as default if unknown)
- For visual_interpretation, ocr_cross_reference: keep simple, minimal text
- All confidence scores: use 0.5 as baseline, 0.7+ for confident, <0.7 for uncertain

Extract EVERYTHING you see. No summarization. Each item = separate classified entity.

Return ONLY the JSON object, no extra text.
`.trim();
}

/**
 * System message for Phase 1 taxonomy test
 */
export const MINIMAL_SYSTEM_MESSAGE = `You are a medical document entity classifier. Extract EVERY piece of information as separate classified entities. Never summarize lists. Always split combination items into separate entities.`;
