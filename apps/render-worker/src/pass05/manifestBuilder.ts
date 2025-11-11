/**
 * Manifest Builder for Pass 0.5
 * Parses AI response and enriches with spatial bbox data from OCR
 *
 * FIX #3: PageRanges normalization (sort + fix inverted ranges)
 * FIX #4: Type safety for encounterType (validation)
 */

import { createClient } from '@supabase/supabase-js';
import {
  EncounterMetadata,
  EncounterType,
  GoogleCloudVisionOCR,
  BoundingBox,
  BoundingBoxNorm,
  SpatialBound,
  PageAssignment
} from './types';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AIEncounterResponse {
  // v2.3: Page assignments with justifications (MANDATORY for v2.3+)
  page_assignments?: Array<{
    page: number;
    encounter_id: string;
    justification: string;
  }>;

  encounters: Array<{
    encounter_id?: string;  // v2.3: AI-assigned ID (e.g., "enc-1", "enc-2")
    encounterType: string;
    isRealWorldVisit: boolean;
    dateRange?: { start: string; end?: string };
    encounterTimeframeStatus?: 'completed' | 'ongoing' | 'unknown_end_date';  // v2.9: Migration 42
    dateSource?: 'ai_extracted' | 'file_metadata' | 'upload_date';  // v2.9: Migration 42
    provider?: string;
    facility?: string;
    pageRanges: number[][];
    confidence: number;
    summary?: string;  // Migration 38: Plain English encounter description
    extractedText?: string;
  }>;
}

/**
 * v2.3: Validate page assignments (if present)
 * Ensures all pages assigned, encounter IDs match, justifications present
 */
function validatePageAssignments(
  pageAssignments: Array<{ page: number; encounter_id: string; justification: string }>,
  encounters: Array<{ encounter_id?: string; encounterType: string }>,
  totalPages?: number
): void {
  // Check all pages are assigned (if totalPages known)
  if (totalPages) {
    const assignedPages = new Set(pageAssignments.map(pa => pa.page));
    if (assignedPages.size !== totalPages) {
      console.warn(
        `[Pass 0.5 v2.3] Page assignment count mismatch: ` +
        `${assignedPages.size} pages assigned, but document has ${totalPages} pages`
      );
    }

    // Check for missing pages
    for (let page = 1; page <= totalPages; page++) {
      if (!assignedPages.has(page)) {
        console.warn(`[Pass 0.5 v2.3] Page ${page} not assigned to any encounter`);
      }
    }
  }

  // Check encounter_id consistency
  const encounterIds = new Set(encounters.map(e => e.encounter_id).filter(Boolean));
  const assignmentEncounterIds = new Set(pageAssignments.map(pa => pa.encounter_id));

  for (const id of assignmentEncounterIds) {
    if (!encounterIds.has(id)) {
      throw new Error(
        `[Pass 0.5 v2.3] Page assignment references unknown encounter_id "${id}". ` +
        `Encounter IDs in encounters array: ${Array.from(encounterIds).join(', ')}`
      );
    }
  }

  // Check justifications present
  for (const pa of pageAssignments) {
    if (!pa.justification || pa.justification.trim().length === 0) {
      console.warn(`[Pass 0.5 v2.3] Page ${pa.page} missing justification`);
    }
  }
}

/**
 * Validate that page ranges do not overlap between encounters
 * Phase 1 requirement: Each page belongs to exactly one encounter
 */
function validateNonOverlappingPageRanges(encounters: AIEncounterResponse['encounters']): void {
  const pageToEncounter = new Map<number, string>();

  for (const enc of encounters) {
    for (const pageRange of enc.pageRanges) {
      const [start, end] = pageRange;
      for (let page = start; page <= end; page++) {
        const existingOwner = pageToEncounter.get(page);
        if (existingOwner) {
          throw new Error(
            `Page range overlap detected: Page ${page} appears in both "${existingOwner}" ` +
            `and "${enc.encounterType}". Phase 1 requires non-overlapping page ranges. ` +
            `AI must assign each page to exactly one encounter.`
          );
        }
        pageToEncounter.set(page, enc.encounterType);
      }
    }
  }
}

/**
 * FIX #4: Validate encounter type against EncounterType union
 * Throws error if invalid type returned by AI
 */
function validateEncounterType(type: string): type is EncounterType {
  const validTypes: EncounterType[] = [
    // Real-world visits
    'inpatient',
    'outpatient',
    'emergency_department',
    'specialist_consultation',
    'gp_appointment',
    'telehealth',
    // Planned encounters
    'planned_specialist_consultation',
    'planned_procedure',
    'planned_gp_appointment',
    // Pseudo-encounters
    'pseudo_medication_list',
    'pseudo_insurance',
    'pseudo_admin_summary',
    'pseudo_lab_report',
    'pseudo_imaging_report',
    'pseudo_referral_letter',
    'pseudo_unverified_visit'
  ];

  if (!validTypes.includes(type as EncounterType)) {
    throw new Error(
      `Invalid encounter type "${type}" returned by AI. ` +
      `Type must match EncounterType union defined in types.ts. ` +
      `Valid types: ${validTypes.join(', ')}`
    );
  }

  return true;
}

/**
 * Parse AI response and enrich with spatial bbox data from OCR
 * Note: Idempotency handled at runPass05() level
 *
 * v2.3: Returns page_assignments if present in AI response
 * v2.9: Implements two-branch logic for date waterfall (Migration 42)
 */
export async function parseEncounterResponse(
  aiResponse: string,
  ocrOutput: GoogleCloudVisionOCR,
  patientId: string,
  shellFileId: string,
  totalPages?: number
): Promise<{ encounters: EncounterMetadata[]; page_assignments?: PageAssignment[] }> {

  const parsed: AIEncounterResponse = JSON.parse(aiResponse);

  // v2.9: Retrieve file metadata for date fallback logic
  const { data: shellFileData } = await supabase
    .from('shell_files')
    .select('created_at, original_filename')
    .eq('id', shellFileId)
    .single();

  const fileCreatedAt = shellFileData?.created_at ? new Date(shellFileData.created_at) : new Date();

  // v2.3: Validate page_assignments if present
  if (parsed.page_assignments) {
    validatePageAssignments(parsed.page_assignments, parsed.encounters, totalPages);
  }

  // CRITICAL: Validate page ranges have valid end values
  for (const aiEnc of parsed.encounters) {
    for (const range of aiEnc.pageRanges) {
      if (range[1] === null || range[1] === undefined) {
        console.warn(
          `[Pass 0.5] Invalid page range [${range[0]}, ${range[1]}] for encounter "${aiEnc.encounterType}". ` +
          `AI returned NULL end page. Correcting to [${range[0]}, ${range[0]}] for single-page encounter.`
        );
        range[1] = range[0];  // Fix NULL by assuming single-page
      }
    }
  }

  // CRITICAL: Validate non-overlapping page ranges (Phase 1 requirement)
  validateNonOverlappingPageRanges(parsed.encounters);

  const encounters: EncounterMetadata[] = [];

  for (const aiEnc of parsed.encounters) {
    // FIX #4: Validate encounter type (throws error if invalid)
    validateEncounterType(aiEnc.encounterType);

    // FIX #3: Normalize page ranges for idempotency
    // Step 1: Fix inverted ranges (e.g., [5,1] → [1,5])
    // Step 2: Sort by start page for deterministic ordering
    const normalizedPageRanges = aiEnc.pageRanges.map(([start, end]) => {
      if (start > end) {
        console.warn(
          `[Pass 0.5] Inverted page range detected: [${start}, ${end}] - ` +
          `normalizing to [${end}, ${start}] for encounter "${aiEnc.encounterType}"`
        );
        return [end, start];
      }
      return [start, end];
    }).sort((a, b) => a[0] - b[0]);

    // Extract spatial bounds from OCR for this encounter's pages (use normalized ranges)
    const spatialBounds = extractSpatialBounds(normalizedPageRanges, ocrOutput);

    // v2.9: Two-Branch Logic (Migration 42)
    // Branch A: Real-world encounters (direct AI mapping)
    // Branch B: Pseudo encounters (date waterfall fallback)
    let encounterStartDate: string | null;
    let encounterDateEnd: string | null;
    let encounterTimeframeStatus: 'completed' | 'ongoing' | 'unknown_end_date';
    let dateSource: 'ai_extracted' | 'file_metadata' | 'upload_date';

    if (aiEnc.isRealWorldVisit) {
      // Branch A: Real-world encounters - direct mapping from AI
      encounterStartDate = aiEnc.dateRange?.start || null;
      encounterDateEnd = aiEnc.dateRange?.end || null;
      encounterTimeframeStatus = aiEnc.encounterTimeframeStatus || 'completed';
      dateSource = aiEnc.dateSource || 'ai_extracted';
    } else {
      // Branch B: Pseudo encounters - date waterfall fallback
      if (aiEnc.dateRange?.start) {
        // AI extracted date from document (e.g., lab collection date)
        encounterStartDate = aiEnc.dateRange.start;
        dateSource = 'ai_extracted';
      } else if (fileCreatedAt) {
        // Fallback to file creation date
        encounterStartDate = fileCreatedAt.toISOString().split('T')[0]; // YYYY-MM-DD
        dateSource = 'file_metadata';
      } else {
        // Last resort: current date
        encounterStartDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        dateSource = 'upload_date';
      }

      // Pseudo encounters: start = end (completed observation)
      encounterDateEnd = encounterStartDate;
      encounterTimeframeStatus = 'completed';
    }

    // Pre-create encounter in database to get UUID
    // UPSERT for idempotency: safe to retry if manifest write fails
    const { data: dbEncounter, error } = await supabase
      .from('healthcare_encounters')
      .upsert(
        {
          patient_id: patientId,  // Required NOT NULL field
          encounter_type: aiEnc.encounterType as EncounterType,  // Safe now (validated)
          is_real_world_visit: aiEnc.isRealWorldVisit,
          encounter_start_date: encounterStartDate,  // Migration 42: Renamed from encounter_date
          encounter_date_end: encounterDateEnd,  // For multi-day encounters (Migration 38/42)
          encounter_timeframe_status: encounterTimeframeStatus,  // Migration 42: Explicit completion status
          date_source: dateSource,  // Migration 38/42: Track date provenance with waterfall logic
          provider_name: aiEnc.provider || null,
          facility_name: aiEnc.facility || null,
          primary_shell_file_id: shellFileId,  // Link to source document
          page_ranges: normalizedPageRanges,  // Use normalized (sorted) ranges
          spatial_bounds: spatialBounds,  // Migration 38: Bounding box coordinates
          identified_in_pass: 'pass_0_5',
          pass_0_5_confidence: aiEnc.confidence,
          source_method: 'ai_pass_0_5',  // Migration 38: Replaced ai_extracted boolean
          summary: aiEnc.summary || null  // Migration 38: AI-generated plain English description
        },
        {
          onConflict: 'patient_id,primary_shell_file_id,encounter_type,encounter_start_date,page_ranges',  // Migration 42: Updated conflict key
          ignoreDuplicates: false  // Update existing record
        }
      )
      .select('id')
      .single();

    if (error || !dbEncounter) {
      throw new Error(`Failed to create encounter in database: ${error?.message}`);
    }

    encounters.push({
      encounterId: dbEncounter.id,
      encounterType: aiEnc.encounterType as EncounterType,  // Safe now (validated)
      isRealWorldVisit: aiEnc.isRealWorldVisit,
      dateRange: encounterStartDate ? {
        start: encounterStartDate,
        end: encounterDateEnd || undefined
      } : undefined,
      encounterTimeframeStatus: encounterTimeframeStatus,  // v2.9: Migration 42
      dateSource: dateSource,  // v2.9: Migration 42
      provider: aiEnc.provider,
      facility: aiEnc.facility,
      pageRanges: normalizedPageRanges,  // Return normalized ranges
      spatialBounds,
      confidence: aiEnc.confidence,
      summary: aiEnc.summary,  // Migration 41: Include encounter summary in manifest for Pass 1/2 context
      extractedText: aiEnc.extractedText
    });
  }

  // v2.3: Return page_assignments if present (for analysis and debugging)
  const result: { encounters: EncounterMetadata[]; page_assignments?: PageAssignment[] } = {
    encounters
  };

  if (parsed.page_assignments) {
    result.page_assignments = parsed.page_assignments;
  }

  return result;
}

/**
 * Extract bounding boxes from OCR for specified page ranges
 * Creates comprehensive spatial regions for functional assignment
 */
function extractSpatialBounds(
  pageRanges: number[][],
  ocrOutput: GoogleCloudVisionOCR
): SpatialBound[] {

  const bounds: SpatialBound[] = [];

  for (const range of pageRanges) {
    const [startPage, endPage] = range;

    // Handle NULL end page: treat as same page (defensive coding for Phase 1)
    const actualEndPage = endPage ?? startPage;

    for (let pageNum = startPage; pageNum <= actualEndPage; pageNum++) {
      const ocrPage = ocrOutput.fullTextAnnotation.pages[pageNum - 1];
      if (!ocrPage) continue;

      // Create comprehensive page region (entire page for now)
      // Phase 2: Could create sub-page regions based on content density
      // Support both legacy (width/height) and new (dimensions) OCR structure
      const pageDims = ocrPage.dimensions
        ? { width: ocrPage.dimensions.width, height: ocrPage.dimensions.height }
        : { width: ocrPage.width || 0, height: ocrPage.height || 0 };

      const entirePageBbox: BoundingBox = {
        vertices: [
          { x: 0, y: 0 },
          { x: pageDims.width, y: 0 },
          { x: pageDims.width, y: pageDims.height },
          { x: 0, y: pageDims.height }
        ]
      };

      const entirePageBboxNorm: BoundingBoxNorm = {
        x: 0,
        y: 0,
        width: 1.0,
        height: 1.0
      };

      bounds.push({
        page: pageNum,
        region: 'entire_page',
        boundingBox: entirePageBbox,
        boundingBoxNorm: entirePageBboxNorm,
        pageDimensions: pageDims
      });
    }
  }

  return bounds;
}
