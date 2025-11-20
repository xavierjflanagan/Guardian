/**
 * Progressive Refinement Type Definitions
 * For handling large documents (200+ pages) that exceed AI output token limits
 *
 * Strategy A (Universal Progressive Processing):
 * - ALL documents use progressive chunk-based processing
 * - Cascade-based encounter continuity across chunks
 * - Sub-page position granularity (13 position fields)
 * - Identity extraction and profile classification
 * - Data quality tier calculation
 */

import { EncounterMetadata, PageAssignment, OCRPage } from '../types';

// =============================================================================
// STRATEGY A: NEW TYPE DEFINITIONS (Files 04-13)
// =============================================================================

/**
 * Position boundary types (File 04)
 * - inter_page: Boundary between pages (encounter starts/ends at page boundary)
 * - intra_page: Boundary within a page (encounter starts/ends mid-page)
 */
export type BoundaryType = 'inter_page' | 'intra_page';

/**
 * Position fields (17 total) - File 04, 07
 * Enables sub-page granularity for encounter boundaries using marker + region hint pattern
 *
 * V11 CHANGE: Moved from AI coordinate extraction to marker + region hint pattern
 * - AI provides: text marker + marker context + region hint
 * - Post-processor extracts: exact Y coordinates from OCR
 * - Benefits: 50,000 fewer tokens per chunk, better disambiguation
 */
export interface PositionFields {
  // Start position (8 fields)
  start_page: number;                    // Page where encounter starts (1-indexed)
  start_boundary_type: BoundaryType;     // Does encounter start at page boundary or mid-page?
  start_text_marker: string | null;      // Text marker (e.g., "DISCHARGE SUMMARY") - AI provided
  start_marker_context: string | null;   // Additional context for disambiguation - AI provided
  start_region_hint: string | null;      // Region hint: 'top', 'upper_middle', 'lower_middle', 'bottom' - AI provided
  start_text_y_top: number | null;       // OCR Y coordinate of start text (pixels) - Post-processor extracted
  start_text_height: number | null;      // OCR text height (pixels) - Post-processor extracted
  start_y: number | null;                // Calculated split Y coordinate - Post-processor calculated

  // End position (8 fields)
  end_page: number;                      // Page where encounter ends (1-indexed)
  end_boundary_type: BoundaryType;       // Does encounter end at page boundary or mid-page?
  end_text_marker: string | null;        // Text marker - AI provided
  end_marker_context: string | null;     // Additional context for disambiguation - AI provided
  end_region_hint: string | null;        // Region hint: 'top', 'upper_middle', 'lower_middle', 'bottom' - AI provided
  end_text_y_top: number | null;         // OCR Y coordinate - Post-processor extracted
  end_text_height: number | null;        // OCR text height - Post-processor extracted
  end_y: number | null;                  // Calculated split Y coordinate - Post-processor calculated

  // Confidence (1 field)
  position_confidence: number;           // AI confidence in position accuracy (0-1)
}

/**
 * Identity markers extracted by AI (File 10)
 * Patient demographic information for profile classification
 */
export interface IdentityMarkers {
  patient_full_name: string | null;      // Full patient name as appears in document
  patient_date_of_birth: string | null;  // DOB in any format (normalized later)
  patient_address: string | null;        // Patient address
  patient_phone: string | null;          // Patient phone number
}

/**
 * Medical identifier (File 10)
 * MRN, insurance numbers, Medicare numbers, etc.
 */
export interface MedicalIdentifier {
  identifier_type: string;               // 'MRN', 'INSURANCE', 'MEDICARE', etc.
  identifier_value: string;              // Actual identifier value
  issuing_organization: string | null;   // Hospital/provider that issued identifier
  detected_context?: string;             // Raw text where identifier was found (for audit)
}

/**
 * Data quality tier (File 11)
 * Calculated based on A/B/C criteria
 */
export type QualityTier = 'low' | 'medium' | 'high' | 'verified';

/**
 * Profile match status (File 10)
 */
export type MatchStatus = 'matched' | 'unmatched' | 'orphan' | 'review';

/**
 * Encounter source (File 12)
 * Tracks how the encounter was created
 */
export type EncounterSource = 'shell_file' | 'manual' | 'api';

/**
 * Batching analysis (File 06)
 * Identifies safe split points WITHIN encounters for Pass 1/2 optimization
 * NOTE: This is NOT for encounter boundaries - those are handled separately
 *
 * V11 CHANGE: Uses marker + region hint pattern (same as encounter boundaries)
 * - inter_page: marker/marker_context/region_hint are null, page field indicates page AFTER split
 * - intra_page: marker/marker_context/region_hint provided by AI, coordinates extracted post-processing
 */
export interface PageSeparationAnalysis {
  safe_split_points: Array<{
    page: number;                        // Page AFTER the split (1-indexed)
    split_type: BoundaryType;            // inter_page or intra_page

    // AI-provided fields (null for inter_page)
    marker: string | null;               // Text marker (e.g., "RADIOLOGY REPORT")
    marker_context: string | null;       // Additional context for disambiguation
    region_hint: string | null;          // 'top', 'upper_middle', 'lower_middle', 'bottom'

    // Post-processor extracted coordinates (null for inter_page, calculated for intra_page)
    text_y_top?: number | null;          // Y coordinate of marker (pixels)
    text_height?: number | null;         // Height of marker text
    split_y?: number | null;             // Calculated split line

    confidence: number;                  // AI confidence (0-1)
  }>;
  summary?: {
    total_splits: number;
    inter_page_count: number;
    intra_page_count: number;
    average_confidence: number;
    pages_per_split: number;
  };
}

/**
 * Updated PendingEncounter interface (Strategy A)
 * Extends PositionFields with all new Strategy A fields
 *
 * NOTE: This represents the logical encounter object during chunk extraction.
 * Some fields exist only in-memory (e.g., is_real_world_visit) and are transferred
 * to healthcare_encounters during reconciliation. DB-only fields like reconciliation_key,
 * quality_criteria_met, and api_source_name are populated downstream and not included here.
 */
export interface PendingEncounter extends PositionFields {
  // Core identifiers
  session_id: string;
  pending_id: string;

  // Cascade fields (File 05)
  cascade_id: string | null;             // Links encounters spanning multiple chunks
  is_cascading: boolean;                 // Does this encounter touch chunk boundary?
  continues_previous: boolean;           // Does this continue a previous pending?
  cascade_context?: string;              // AI context about cascade continuation
  expected_continuation?: string;        // What AI expects in next chunk (e.g., 'lab_results', 'discharge_summary')

  // Identity fields (File 10)
  patient_full_name: string | null;
  patient_date_of_birth: string | null;
  patient_address: string | null;
  patient_phone: string | null;

  // Classification fields (File 10)
  matched_profile_id: string | null;    // Which user_profile does this match?
  match_confidence: number | null;      // Confidence in profile match (0-1)
  match_status: MatchStatus | null;     // Match result
  is_orphan_identity: boolean;          // Is this an unmatched identity?

  // Quality field (File 11)
  data_quality_tier: QualityTier | null;

  // Source metadata (File 12)
  encounter_source: EncounterSource;
  created_by_user_id: string | null;    // User who uploaded/created

  // Encounter core fields
  encounter_type: string;
  page_ranges: number[][];               // 1-indexed page ranges
  encounter_start_date?: string;
  encounter_end_date?: string;
  encounter_timeframe_status?: 'completed' | 'ongoing' | 'unknown_end_date';
  provider_name?: string;
  facility_name?: string;
  confidence: number;
  summary?: string;

  // Clinical fields (V11 additions)
  diagnoses?: string[];                  // Array of diagnoses
  procedures?: string[];                 // Array of procedures
  chief_complaint?: string;              // Primary presenting complaint
  department?: string;                   // Hospital department/unit
  provider_role?: string;                // Provider's specialty/role
  disposition?: string;                  // Patient disposition (admitted/discharged/etc.)

  // Timeline Test result (in-memory only, persisted to healthcare_encounters during reconciliation)
  is_real_world_visit: boolean;          // Has both date AND location (provider/facility)?
}

/**
 * Cascade chain record (File 05)
 * Tracks encounters spanning multiple chunks
 */
export interface CascadeChain {
  id: string;
  session_id: string;
  cascade_id: string;                    // Unique cascade identifier
  origin_chunk: number;                  // Chunk where cascade started
  last_chunk: number | null;             // Chunk where cascade ended (NULL if still open)
  final_encounter_id: string | null;     // UUID of final healthcare_encounter
  pendings_count: number;                // Number of pendings in this chain
  created_at: Date;
  completed_at: Date | null;
}

/**
 * Reconciliation log entry (File 05)
 * Audit trail for reconciliation decisions
 */
export interface ReconciliationLogEntry {
  id: string;
  session_id: string;
  cascade_id: string | null;
  pending_ids: string[];                 // Array of pending IDs reconciled
  final_encounter_id: string | null;     // Final encounter created
  match_type: 'cascade' | 'descriptor' | 'orphan';
  confidence: number;
  reasons: string;                       // Explanation of reconciliation decision
  created_at: Date;
}

// =============================================================================
// EXISTING TYPES (Pre-Strategy A)
// =============================================================================

/**
 * Handoff package passed between chunks
 * Contains all context needed for the next chunk to continue processing
 */
/**
 * Handoff Package (Legacy + Strategy A)
 *
 * STRATEGY A MIGRATION NOTE:
 * - Old v2.9 fields (pendingEncounter, activeContext, recentEncountersSummary): DEPRECATED
 * - New Strategy A field (cascadeContexts): Simple cascade continuity context
 * - All fields optional to support gradual migration
 */
export interface HandoffPackage {
  // DEPRECATED v2.9: Incomplete encounter from previous chunk
  // Use cascadeContexts instead for Strategy A
  pendingEncounter?: {
    tempId: string;
    startPage: number;  // 0-based
    encounterDate?: string;
    provider?: string;
    encounterType?: string;
    partialData: Partial<EncounterMetadata>;
    lastSeenContext: string;  // Last 500 chars for continuity
    confidence: number;
    expectedContinuation?: string;  // 'lab_results', 'treatment_plan', etc.
  };

  // DEPRECATED v2.9: Active context to carry forward
  // Strategy A uses simpler cascade context
  activeContext?: {
    currentAdmission?: {
      facility: string;
      admitDate: string;
      expectedDischargeInfo?: string;
    };
    recentLabOrders?: Array<{
      orderedDate: string;
      tests: string[];
      provider: string;
    }>;
    activeProviders: string[];  // Recently mentioned providers
    documentFlow: 'chronological' | 'mixed' | 'by_provider';
    lastConfidentDate?: string;  // For temporal anchoring
  };

  // DEPRECATED v2.9: Summary of recent encounters (last 3)
  // Strategy A reconciliation handles cross-chunk encounter context
  recentEncountersSummary?: Array<{
    date: string;
    type: string;
    provider: string;
    pages: number[];  // 1-indexed
  }>;

  // STRATEGY A: Cascade contexts for encounters spanning chunk boundaries
  cascadeContexts?: Array<{
    cascade_id: string;             // Links this to pending in next chunk
    pending_id: string;             // ID of cascading pending from current chunk
    encounter_type: string;         // Type for AI recognition
    partial_summary: string;        // What we know so far
    expected_in_next_chunk: string; // What AI should look for
    ai_context: string;             // Free-form context for AI continuity
  }>;
}

/**
 * Progressive session metadata
 * Tracks the overall multi-chunk processing session
 */
export interface ProgressiveSession {
  id: string;  // UUID from database
  shellFileId: string;
  patientId: string;
  totalPages: number;
  chunkSize: number;
  totalChunks: number;
  currentChunk: number;
}

/**
 * Chunk processing parameters
 */
export interface ChunkParams {
  sessionId: string;
  chunkNumber: number;  // 1-indexed
  totalChunks: number;
  pages: OCRPage[];
  pageRange: [number, number];  // 1-based: [startPage, endPage] inclusive (medical page numbers)
  totalPages: number;
  handoffReceived: HandoffPackage | null;  // Strategy A: Use handoffReceived.cascadeContexts for cascade context
  patientId: string;  // Required for persisting pending encounters
  shellFileId: string;  // Required for persisting pending encounters
}

/**
 * Chunk processing result
 */
export interface ChunkResult {
  completedEncounters: EncounterMetadata[];
  completedPageAssignments: PageAssignment[];
  pendingEncounter: HandoffPackage['pendingEncounter'] | null;
  handoffGenerated: HandoffPackage | null;  // Can be null when no cascading encounters
  metrics: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
    confidence: number;
    aiModel: string;
  };
}

/**
 * AI response for progressive chunk processing
 * NOTE: AI returns snake_case, must normalize to camelCase
 */
export interface ProgressiveAIResponse {
  // Data to complete pending encounter from previous chunk
  continuation_data?: {
    [key: string]: any;  // Flexible structure for completion data
  };

  // Encounters found in this chunk
  encounters: Array<{
    status: 'complete' | 'continuing';  // Complete if ends in chunk, continuing if extends beyond
    temp_id?: string;  // Only for continuing encounters
    encounter_type: string;
    encounter_start_date?: string;
    encounter_end_date?: string;
    encounter_timeframe_status?: 'completed' | 'ongoing' | 'unknown_end_date';
    date_source?: 'ai_extracted' | 'file_metadata' | 'upload_date';
    provider_name?: string;
    facility?: string;
    page_ranges: number[][];  // 1-indexed
    confidence: number;
    summary?: string;
    expected_continuation?: string;  // Only for continuing encounters
  }>;

  // Page assignments for this chunk
  page_assignments?: Array<{
    page: number;  // 1-indexed
    encounter_id: string;
    justification: string;
  }>;

  // Active context for next chunk
  active_context?: {
    current_admission?: {
      facility: string;
      admit_date: string;
      expected_discharge_info?: string;
    };
    recent_lab_orders?: Array<{
      ordered_date: string;
      tests: string[];
      provider: string;
    }>;
    active_providers?: string[];
    document_flow?: 'chronological' | 'mixed' | 'by_provider';
    last_confident_date?: string;
  };
}

/**
 * Pending encounter record in database
 */
export interface PendingEncounterRecord {
  id: string;
  sessionId: string;
  tempEncounterId: string;
  chunkStarted: number;
  chunkLastSeen: number | null;
  partialData: any;  // JSONB
  pageRanges: number[];
  lastSeenContext: string | null;
  expectedContinuation: string | null;
  status: 'pending' | 'completed' | 'abandoned';
  completedEncounterId: string | null;
  confidence: number | null;
  requiresReview: boolean;
}
