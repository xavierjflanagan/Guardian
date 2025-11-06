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
    encounters: EncounterMetadata[];
    page_assignments?: PageAssignment[];
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
    encounterId: string;
    encounterType: EncounterType;
    isRealWorldVisit: boolean;
    dateRange?: {
        start: string;
        end?: string;
    };
    provider?: string;
    facility?: string;
    /**
     * Page ranges where this encounter appears (1-indexed, inclusive)
     * Format: [[startPage, endPage], ...] for non-contiguous page spans
     * Example: [[1,5], [10,12]] means pages 1-5 and 10-12
     * Normalized: Arrays are sorted by start page, inverted ranges fixed
     */
    pageRanges: number[][];
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
    extractedText?: string;
}
export type EncounterType = 'inpatient' | 'outpatient' | 'emergency_department' | 'specialist_consultation' | 'gp_appointment' | 'telehealth' | 'planned_specialist_consultation' | 'planned_procedure' | 'planned_gp_appointment' | 'pseudo_medication_list' | 'pseudo_insurance' | 'pseudo_admin_summary' | 'pseudo_lab_report' | 'pseudo_imaging_report' | 'pseudo_referral_letter' | 'pseudo_unverified_visit';
export interface SpatialBound {
    page: number;
    region: 'entire_page' | 'top_half' | 'bottom_half' | 'custom';
    boundingBox: BoundingBox;
    boundingBoxNorm: BoundingBoxNorm;
    pageDimensions: {
        width: number;
        height: number;
    };
    charOffsetRange?: [number, number];
}
export interface BoundingBox {
    vertices: Array<{
        x: number;
        y: number;
    }>;
}
export interface BoundingBoxNorm {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type BatchingPlan = null;
/**
 * Pass 0.5 Input/Output
 */
export interface Pass05Input {
    shellFileId: string;
    patientId: string;
    ocrOutput: GoogleCloudVisionOCR;
    pageCount: number;
    processingSessionId: string;
}
export interface Pass05Output {
    success: boolean;
    manifest?: ShellFileManifest;
    error?: string;
    processingTimeMs: number;
    aiCostUsd: number;
    aiModel: string;
}
export interface GoogleCloudVisionOCR {
    fullTextAnnotation: {
        text: string;
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
//# sourceMappingURL=types.d.ts.map