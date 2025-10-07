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

OUTPUT FORMAT - Return valid JSON matching this schema:
{
  "processing_metadata": {model_used, vision_processing, processing_time_seconds, token_usage{prompt_tokens, completion_tokens, total_tokens}, cost_estimate, confidence_metrics{overall_confidence, visual_interpretation_confidence, category_confidence{clinical_event, healthcare_context, document_structure}}},
  "entities": [{entity_id, original_text, classification{entity_category, entity_subtype, confidence}, visual_interpretation{ai_sees, formatting_context, visual_quality, ai_confidence}, ocr_cross_reference{ocr_text, ocr_confidence, ai_ocr_agreement, discrepancy_type, discrepancy_notes}, spatial_information{page_number, bounding_box{x,y,width,height}, unique_marker, location_context, spatial_source}, quality_indicators{detection_confidence, classification_confidence, cross_validation_score, requires_manual_review}}],
  "document_coverage": {total_content_processed, content_classified, coverage_percentage, unclassified_segments[], visual_quality_score, list_extraction_metrics{total_list_items_found, total_entities_emitted, list_items_missed[]}},
  "cross_validation_results": {ai_ocr_agreement_score, high_discrepancy_count, ocr_missed_entities, ai_missed_ocr_text, spatial_mapping_success_rate},
  "quality_assessment": {completeness_score, accuracy_score, requires_review},
  "profile_safety": {patient_identity_confidence, pii_detected, profile_verification_status}
}

DEFAULTS: Use bbox(0,0,100,20) if unknown, confidence 0.7-0.9 for clear items, <0.7 if uncertain.
Extract EVERYTHING. No summarization. Return ONLY valid JSON.
`.trim();
}

/**
 * System message for Phase 1 taxonomy test
 */
export const MINIMAL_SYSTEM_MESSAGE = `You are a medical document entity classifier. Extract EVERY piece of information as separate classified entities. Never summarize lists. Always split combination items into separate entities.`;
