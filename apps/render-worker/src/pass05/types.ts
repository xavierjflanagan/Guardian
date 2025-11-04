/**
 * Pass 0.5 Type Definitions
 * Healthcare Encounter Discovery
 */

/**
 * Pass 0.5 Shell File Manifest
 * Output of encounter discovery (Task 1)
 *
 * v2.3 ADDITION: page_assignments array with explicit page-to-encounter mapping
 */
export interface ShellFileManifest {
  shellFileId: string;
  patientId: string;
  totalPages: number;

  /**
   * Average OCR confidence score across all pages (0.0-1.0)
   * Source: Google Cloud Vision OCR page-level confidence
   */
  ocrAverageConfidence: number;

  // Task 1: Encounter discovery (always present)
  encounters: EncounterMetadata[];

  // v2.3: Page-by-page assignments with justifications (MANDATORY for v2.3+)
  page_assignments?: PageAssignment[];

  // Task 2: Batching (null in Phase 1 MVP)
  batching: null | BatchingPlan;
}

/**
 * Page Assignment with Justification (v2.3)
 * Forces explicit page-to-encounter mapping with reasoning
 */
export interface PageAssignment {
  /**
   * Page number (1-indexed)
   */
  page: number;

  /**
   * Encounter ID this page belongs to
   * Must match an encounter_id in the encounters array
   */
  encounter_id: string;

  /**
   * Brief justification for this page assignment (15-20 words)
   * Examples:
   * - "Continuation of discharge summary, same provider and facility"
   * - "NEW Encounter Summary header, different provider and facility"
   * - "Signature block for previous encounter, Dr Smith closeout"
   */
  justification: string;
}

export interface EncounterMetadata {
  encounterId: string;  // UUID pre-created in database
  encounterType: EncounterType;
  isRealWorldVisit: boolean;

  // Temporal data
  dateRange?: {
    start: string;  // ISO date
    end?: string;   // ISO date (optional for single-day encounters)
  };

  // Provider/facility (only for real-world visits)
  provider?: string;
  facility?: string;

  /**
   * Page ranges where this encounter appears (1-indexed, inclusive)
   * Format: [[startPage, endPage], ...] for non-contiguous page spans
   * Example: [[1,5], [10,12]] means pages 1-5 and 10-12
   * Normalized: Arrays are sorted by start page, inverted ranges fixed
   */
  pageRanges: number[][];

  // Spatial data from OCR
  spatialBounds: SpatialBound[];

  /**
   * AI model confidence score for encounter detection (0.0-1.0)
   * Source: OpenAI GPT-5-mini analysis (NOT OCR confidence)
   */
  confidence: number;

  /**
   * Plain English summary of encounter (Migration 38)
   * Example: "Annual physical exam with Dr. Smith at City Medical Center"
   * TODO: AI prompt needs to generate this field
   */
  summary?: string;

  extractedText?: string;  // Sample text from encounter (for debugging)
}

export type EncounterType =
  // Real-world visits (completed past visits)
  | 'inpatient'
  | 'outpatient'
  | 'emergency_department'
  | 'specialist_consultation'
  | 'gp_appointment'
  | 'telehealth'

  // Planned encounters (future scheduled)
  | 'planned_specialist_consultation'
  | 'planned_procedure'
  | 'planned_gp_appointment'

  // Pseudo-encounters (documents, not visits)
  | 'pseudo_medication_list'
  | 'pseudo_insurance'
  | 'pseudo_admin_summary'
  | 'pseudo_lab_report'
  | 'pseudo_imaging_report'
  | 'pseudo_referral_letter'
  | 'pseudo_unverified_visit';  // Vague date or insufficient details

export interface SpatialBound {
  page: number;  // 1-indexed page number
  region: 'entire_page' | 'top_half' | 'bottom_half' | 'custom';

  // Original pixel coordinates
  boundingBox: BoundingBox;

  // Normalized coordinates [0,1] for functional assignment
  boundingBoxNorm: BoundingBoxNorm;

  // Page dimensions (for denormalization)
  pageDimensions: { width: number; height: number };

  // Optional: Character offset range in OCR text
  charOffsetRange?: [number, number];
}

export interface BoundingBox {
  vertices: Array<{ x: number; y: number }>;  // 4 vertices: TL, TR, BR, BL
}

export interface BoundingBoxNorm {
  // Normalized [0,1] coordinates relative to page dimensions
  x: number;      // Left edge (0 = left, 1 = right)
  y: number;      // Top edge (0 = top, 1 = bottom)
  width: number;  // Width as fraction of page width
  height: number; // Height as fraction of page height
}

// Phase 1 MVP: Always null
export type BatchingPlan = null;

// Phase 2: Will be implemented later
// export interface BatchingPlan {
//   batchingRequired: boolean;
//   batches: BatchMetadata[];
// }

/**
 * Pass 0.5 Input/Output
 */
export interface Pass05Input {
  shellFileId: string;
  patientId: string;
  ocrOutput: GoogleCloudVisionOCR;  // OCR text + spatial data
  pageCount: number;
  processingSessionId: string;  // From ai_processing_sessions table
}

export interface Pass05Output {
  success: boolean;
  manifest?: ShellFileManifest;
  error?: string;

  // Metrics
  processingTimeMs: number;
  aiCostUsd: number;
  aiModel: string;
}

export interface GoogleCloudVisionOCR {
  fullTextAnnotation: {
    text: string;  // Full extracted text
    pages: OCRPage[];
  };
}

export interface OCRPage {
  width: number;
  height: number;
  confidence: number;
  blocks: OCRBlock[];
}

export interface OCRBlock {
  boundingBox: BoundingBox;
  confidence: number;
  paragraphs: OCRParagraph[];
}

export interface OCRParagraph {
  boundingBox: BoundingBox;
  words: OCRWord[];
}

export interface OCRWord {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
}
