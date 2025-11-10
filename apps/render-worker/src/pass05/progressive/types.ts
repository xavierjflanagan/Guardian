/**
 * Progressive Refinement Type Definitions
 * For handling large documents (200+ pages) that exceed AI output token limits
 */

import { EncounterMetadata, PageAssignment, OCRPage } from '../types';

/**
 * Handoff package passed between chunks
 * Contains all context needed for the next chunk to continue processing
 */
export interface HandoffPackage {
  // Incomplete encounter from previous chunk
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

  // Active context to carry forward
  activeContext: {
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

  // Summary of recent encounters (last 3)
  recentEncountersSummary: Array<{
    date: string;
    type: string;
    provider: string;
    pages: number[];  // 1-indexed
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
  pageRange: [number, number];  // 0-based: [startPage, endPage] exclusive
  totalPages: number;
  handoffReceived: HandoffPackage | null;
}

/**
 * Chunk processing result
 */
export interface ChunkResult {
  completedEncounters: EncounterMetadata[];
  completedPageAssignments: PageAssignment[];
  pendingEncounter: HandoffPackage['pendingEncounter'] | null;
  handoffGenerated: HandoffPackage;
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
