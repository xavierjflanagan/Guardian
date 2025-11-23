/**
 * Pending Encounter Reconciler - Strategy A
 *
 * Purpose: Convert pending encounters to final healthcare_encounters after all chunks complete.
 *
 * Strategy A Flow:
 * 1. ALL encounters become pendings during chunk processing (no direct finals)
 * 2. After all chunks complete, reconciliation groups pendings by cascade_id
 * 3. Position data merged: first chunk's start + last chunk's end
 * 4. Identifiers, quality tier calculated, and final encounter created via atomic RPC
 *
 * Source: 08-RECONCILIATION-STRATEGY-V2.md
 * Complexity: VERY HIGH
 */

import {
  getPendingsByStatus,
  reconcilePendingsToFinal,
  getChunkResultsForSession,
  updateAggregatedBatchingAnalysis,
  completeCascadeChain,
  supabase
} from './database';

/**
 * Pick best value from array of nullable strings
 * Migration 58: Helper for identity field merging
 *
 * Prefers non-null, non-empty values.
 * For multiple non-empty values, picks longest (more information = better).
 *
 * @param values - Array of nullable strings from multiple pending encounters
 * @returns Best value or null if all are null/empty
 */
function pickBestValue(values: (string | null)[]): string | null {
  const nonNull = values.filter((v): v is string => v !== null && v.trim() !== '');
  if (nonNull.length === 0) return null;
  if (nonNull.length === 1) return nonNull[0];

  // Pick longest value (more information = better)
  return nonNull.reduce((best, current) =>
    current.length > best.length ? current : best
  );
}

/**
 * Pick best date based on quality hierarchy
 * Migration 65: For multi-chunk encounters, prefer ai_extracted > file_metadata > upload_date
 *
 * @param dates - Array of {date, source} objects from multiple pendings
 * @returns Best date and its source based on quality hierarchy
 */
function pickBestDateByQuality(
  dates: Array<{ date: string | null; source: 'ai_extracted' | 'file_metadata' | 'upload_date' }>
): { date: string | null; source: 'ai_extracted' | 'file_metadata' | 'upload_date' } {
  // Quality ranking: ai_extracted (highest) > file_metadata > upload_date (lowest)
  const qualityRank = { ai_extracted: 3, file_metadata: 2, upload_date: 1 };

  // Filter to only non-null dates
  const validDates = dates.filter(d => d.date !== null && d.date !== undefined && d.date !== '');

  if (validDates.length === 0) {
    return { date: null, source: 'ai_extracted' };
  }

  // Sort by quality (highest first), then pick first
  const sorted = validDates.sort((a, b) => qualityRank[b.source] - qualityRank[a.source]);

  return sorted[0];
}

/**
 * Date normalization result with metadata
 * Migration 63: Enhanced to support international date formats and ambiguity detection
 */
interface DateNormalizationResult {
  isoDate: string | null;
  wasAmbiguous: boolean;
  originalFormat: string;
  parseMethod: 'iso_passthrough' | 'text' | 'dd_mm' | 'mm_dd' | 'ambiguous_default' | 'fallback' | 'failed_sanity_check';
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

/**
 * Normalize date string to ISO format (YYYY-MM-DD) with ambiguity detection
 * Migration 63: Enhanced to support international date formats (DD/MM/YYYY vs MM/DD/YYYY)
 *
 * Handles formats:
 * - ISO 8601: "2024-03-14" (YYYY-MM-DD) → pass through
 * - Written: "November 14, 1965", "14 Nov 1965" → parse naturally
 * - US slash: "11/14/1965" (MM/DD/YYYY) → disambiguate
 * - International slash: "14/11/1965" (DD/MM/YYYY) → disambiguate
 * - European dots: "14.11.1965" (DD.MM.YYYY) → disambiguate
 * - European dash: "14-11-1965" (DD-MM-YYYY) → disambiguate
 *
 * Disambiguation logic for ambiguous dates (e.g., "05/06/1959"):
 * - If first number > 12: Must be DD/MM/YYYY
 * - If second number > 12: Must be MM/DD/YYYY
 * - If both ≤ 12: Default to DD/MM/YYYY (international standard)
 *
 * @param dateString - Date string in any parseable format
 * @param fieldName - Field name for context (e.g., 'patient_date_of_birth', 'encounter_start_date')
 * @returns Date normalization result with metadata
 */
function normalizeDateToISO(
  dateString: string | null,
  fieldName: string = 'unknown'
): DateNormalizationResult {
  if (!dateString || dateString.trim() === '') {
    return {
      isoDate: null,
      wasAmbiguous: false,
      originalFormat: dateString || '',
      parseMethod: 'iso_passthrough',
      confidence: 'low'
    };
  }

  const trimmed = dateString.trim();

  try {
    // ============================================================
    // 1. ISO 8601 Format (YYYY-MM-DD) - Pass Through
    // ============================================================
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return {
          isoDate: trimmed,
          wasAmbiguous: false,
          originalFormat: trimmed,
          parseMethod: 'iso_passthrough',
          confidence: 'high'
        };
      }
    }

    // ============================================================
    // 2. Written Format - Let JavaScript Date Handle
    // ============================================================
    // Examples: "November 14, 1965", "14 March 2024", "March 14, 2024"
    if (/[a-zA-Z]/.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        const isoDate = `${year}-${month}-${day}`;

        // DOB year sanity check
        if (fieldName === 'patient_date_of_birth') {
          const currentYear = new Date().getFullYear();
          if (year < 1900 || year > currentYear + 1) {
            console.warn('[Identity] DOB year out of range - likely OCR error:', {
              year,
              dateString: trimmed,
              validRange: `1900-${currentYear + 1}`,
              suggestion: 'Review source document for OCR misread digits'
            });
            return {
              isoDate: null,
              wasAmbiguous: false,
              originalFormat: trimmed,
              parseMethod: 'failed_sanity_check',
              confidence: 'low',
              error: 'year_out_of_range'
            };
          }
        }

        return {
          isoDate,
          wasAmbiguous: false,
          originalFormat: trimmed,
          parseMethod: 'text',
          confidence: 'high'
        };
      }
    }

    // ============================================================
    // 3. Numeric Formats with Disambiguation Logic
    // ============================================================
    // Matches: DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, DD-MM-YYYY
    // Separators: slash (/), dot (.), dash (-)
    const numericMatch = trimmed.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);

    if (numericMatch) {
      let [_, first, second, year] = numericMatch;

      // Normalize 2-digit year to 4-digit
      // Rule: 00-49 → 2000s, 50-99 → 1900s
      if (year.length === 2) {
        const yearNum = parseInt(year, 10);
        year = yearNum < 50 ? `20${year}` : `19${year}`;
      }

      const firstNum = parseInt(first, 10);
      const secondNum = parseInt(second, 10);

      let day: number;
      let month: number;
      let wasAmbiguous = false;
      let parseMethod: 'dd_mm' | 'mm_dd' | 'ambiguous_default';

      // ============================================================
      // Disambiguation Logic
      // ============================================================

      if (firstNum > 12) {
        // First number can't be a month → Must be DD/MM/YYYY
        // Examples: "16/02/1959", "31/12/2023"
        day = firstNum;
        month = secondNum;
        parseMethod = 'dd_mm';
      } else if (secondNum > 12) {
        // Second number can't be a month → Must be MM/DD/YYYY
        // Examples: "02/16/1959", "12/31/2023"
        month = firstNum;
        day = secondNum;
        parseMethod = 'mm_dd';
      } else {
        // ============================================================
        // AMBIGUOUS CASE
        // ============================================================
        // Both numbers ≤ 12 → Could be either format
        // Examples: "01/02/2024", "05/06/2023"
        //
        // DEFAULT TO DD/MM/YYYY (International Standard)
        // Rationale:
        // - DD/MM/YYYY used by majority of world (~70%)
        // - Australian medical records use DD/MM/YYYY
        // - ISO 8601 is YYYY-MM-DD (day before month)
        // ============================================================
        day = firstNum;
        month = secondNum;
        wasAmbiguous = true;
        parseMethod = 'ambiguous_default';
      }

      // ============================================================
      // Validate Date Ranges
      // ============================================================
      if (day < 1 || day > 31) {
        console.warn('[Identity] Invalid day value:', { day, month, year, dateString: trimmed });
        return {
          isoDate: null,
          wasAmbiguous,
          originalFormat: trimmed,
          parseMethod,
          confidence: 'low',
          error: 'invalid_day'
        };
      }
      if (month < 1 || month > 12) {
        console.warn('[Identity] Invalid month value:', { day, month, year, dateString: trimmed });
        return {
          isoDate: null,
          wasAmbiguous,
          originalFormat: trimmed,
          parseMethod,
          confidence: 'low',
          error: 'invalid_month'
        };
      }

      // ============================================================
      // Construct ISO 8601 String
      // ============================================================
      const monthStr = String(month).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const isoDate = `${year}-${monthStr}-${dayStr}`;

      // ============================================================
      // Final Validation: Check if Date is Actually Valid
      // ============================================================
      // This catches cases like "31/02/2024" (Feb 31 doesn't exist)
      const testDate = new Date(isoDate);
      if (isNaN(testDate.getTime())) {
        console.warn('[Identity] Constructed invalid date:', isoDate, 'from', trimmed);
        return {
          isoDate: null,
          wasAmbiguous,
          originalFormat: trimmed,
          parseMethod,
          confidence: 'low',
          error: 'constructed_invalid_date'
        };
      }

      // Verify the constructed date matches our intended values
      // (JavaScript Date might "roll over" invalid dates like Feb 31 → Mar 3)
      const yearNum = parseInt(year, 10);
      if (
        testDate.getFullYear() !== yearNum ||
        testDate.getMonth() + 1 !== month ||
        testDate.getDate() !== day
      ) {
        console.warn('[Identity] Date rollover detected:', {
          input: trimmed,
          constructed: isoDate,
          actual: testDate.toISOString().split('T')[0]
        });
        return {
          isoDate: null,
          wasAmbiguous,
          originalFormat: trimmed,
          parseMethod,
          confidence: 'low',
          error: 'date_rollover'
        };
      }

      // ============================================================
      // DOB Year Sanity Check
      // ============================================================
      if (fieldName === 'patient_date_of_birth') {
        const currentYear = new Date().getFullYear();
        if (yearNum < 1900 || yearNum > currentYear + 1) {
          console.warn('[Identity] DOB year out of range - likely OCR error:', {
            year: yearNum,
            dateString: trimmed,
            validRange: `1900-${currentYear + 1}`,
            suggestion: 'Review source document for OCR misread digits'
          });
          return {
            isoDate: null,
            wasAmbiguous,
            originalFormat: trimmed,
            parseMethod: 'failed_sanity_check',
            confidence: 'low',
            error: 'year_out_of_range'
          };
        }
      }

      // Determine confidence level
      const confidence = wasAmbiguous ? 'low' : 'high';

      return {
        isoDate,
        wasAmbiguous,
        originalFormat: trimmed,
        parseMethod,
        confidence
      };
    }

    // ============================================================
    // 4. Fallback: Try JavaScript Date() as Last Resort
    // ============================================================
    // WITH EXPLICIT LOGGING for unexpected formats
    const fallback = new Date(trimmed);
    if (!isNaN(fallback.getTime())) {
      console.warn('[Identity] FALLBACK DATE PARSE USED - REVIEW IF FREQUENT:', {
        original: trimmed,
        parsed: fallback.toISOString(),
        field: fieldName,
        context: 'Unexpected format - should match known patterns'
      });
      // TODO: Track in metrics: fallback_parse_count by field type

      const year = fallback.getFullYear();
      const month = String(fallback.getMonth() + 1).padStart(2, '0');
      const day = String(fallback.getDate()).padStart(2, '0');
      const isoDate = `${year}-${month}-${day}`;

      // DOB year sanity check for fallback
      if (fieldName === 'patient_date_of_birth') {
        const currentYear = new Date().getFullYear();
        if (year < 1900 || year > currentYear + 1) {
          console.warn('[Identity] DOB year out of range in fallback:', {
            year,
            dateString: trimmed,
            validRange: `1900-${currentYear + 1}`
          });
          return {
            isoDate: null,
            wasAmbiguous: false,
            originalFormat: trimmed,
            parseMethod: 'failed_sanity_check',
            confidence: 'low',
            error: 'year_out_of_range'
          };
        }
      }

      return {
        isoDate,
        wasAmbiguous: false,
        originalFormat: trimmed,
        parseMethod: 'fallback',
        confidence: 'low'
      };
    }

    // ============================================================
    // 5. No Matching Format
    // ============================================================
    console.warn('[Identity] No matching date format for:', trimmed);
    return {
      isoDate: null,
      wasAmbiguous: false,
      originalFormat: trimmed,
      parseMethod: 'fallback',
      confidence: 'low',
      error: 'no_matching_format'
    };

  } catch (error) {
    console.warn('[Identity] Failed to parse date:', dateString, error);
    return {
      isoDate: null,
      wasAmbiguous: false,
      originalFormat: trimmed,
      parseMethod: 'fallback',
      confidence: 'low',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Main reconciliation entry point
 *
 * Called by session-manager.ts after all chunks complete.
 * Groups pendings by cascade_id, merges position data, creates final encounters.
 *
 * @param sessionId - UUID of progressive session
 * @param shellFileId - UUID of shell file
 * @param patientId - UUID of patient (from session)
 * @param totalPages - Total pages in document (for batching analysis)
 * @param fileCreatedAt - File creation timestamp for date waterfall fallback (Migration 64)
 * @returns Array of final encounter UUIDs created
 */
export async function reconcilePendingEncounters(
  sessionId: string,
  shellFileId: string,
  patientId: string,
  totalPages: number,
  fileCreatedAt: Date | null
): Promise<string[]> {
  console.log(`[Reconcile] Starting reconciliation for session ${sessionId}`);

  // STEP 1: Session guard validation
  await validateSessionReadyForReconciliation(sessionId);

  // STEP 2: Fetch all pending encounters
  const pendings = await getPendingsByStatus(sessionId, 'pending');

  if (pendings.length === 0) {
    console.log(`[Reconcile] No pending encounters to reconcile`);
    return [];
  }

  console.log(`[Reconcile] Found ${pendings.length} pending encounters`);

  // STEP 3: Group by cascade_id
  const cascadeGroups = groupPendingsByCascade(pendings);
  console.log(`[Reconcile] Grouped into ${cascadeGroups.size} cascades`);

  const finalEncounterIds: string[] = [];

  // STEP 4: Process each cascade group
  for (const [cascadeId, groupPendings] of cascadeGroups) {
    try {
      console.log(`[Reconcile] Processing cascade ${cascadeId || 'null'} (${groupPendings.length} pendings)`);

      // Validate cascade group
      const validation = validateCascadeGroup(groupPendings);
      if (!validation.valid) {
        console.error(`[Reconcile] Cascade ${cascadeId} validation failed:`, validation.errors);
        await markCascadeAsAbandoned(groupPendings, validation.errors.join('; '));
        continue;
      }

      // Merge position data (17 fields)
      const mergedPosition = mergePositionData(groupPendings);

      // Merge page ranges
      const mergedPageRanges = mergePageRanges(
        groupPendings.flatMap(p => p.page_ranges || [])
      );

      // Get clinical data from first pending (should be consistent across cascade)
      const firstPending = groupPendings.sort((a, b) => a.chunk_number - b.chunk_number)[0];

      // Migration 65: Merge is_real_world_visit using "any true = all true" logic
      // If ANY chunk identified this as a real visit, the final encounter is a real visit
      const isRealWorldVisit = groupPendings.some(p => p.is_real_world_visit);

      if (groupPendings.length > 1) {
        const trueCount = groupPendings.filter(p => p.is_real_world_visit).length;
        console.log(`[Reconcile] Merging is_real_world_visit: ${trueCount}/${groupPendings.length} pendings say true → final: ${isRealWorldVisit}`);
      }

      // Calculate quality tier
      const qualityData = calculateQualityTier(firstPending);

      // Migration 63: Normalize all date fields with metadata
      const dobResult = normalizeDateToISO(
        pickBestValue(groupPendings.map(p => p.patient_date_of_birth)),
        'patient_date_of_birth'
      );

      // Migration 65: Pick best date based on quality hierarchy
      // For multi-chunk encounters, prefer AI-extracted dates over metadata/upload dates
      const bestStartDate = pickBestDateByQuality(
        groupPendings.map(p => ({
          date: p.encounter_start_date,
          source: p.date_source || 'ai_extracted'
        }))
      );

      const bestEndDate = pickBestDateByQuality(
        groupPendings.map(p => ({
          date: p.encounter_end_date,
          source: p.date_source || 'ai_extracted'
        }))
      );

      const startDateResult = normalizeDateToISO(
        bestStartDate.date,
        'encounter_start_date'
      );

      const endDateResult = normalizeDateToISO(
        bestEndDate.date,
        'encounter_end_date'
      );

      // Migration 64/65: Date waterfall hierarchy for pseudo encounters
      // For pseudo encounters without AI dates, fall back to file metadata → upload date
      let finalStartDate: string | null;
      let finalEndDate: string | null;
      let finalDateSource: 'ai_extracted' | 'file_metadata' | 'upload_date';

      if (isRealWorldVisit) {
        // Branch A: Real-world encounters - use AI-extracted dates directly
        // Migration 65: Use best quality date from multi-chunk merge
        finalStartDate = startDateResult.isoDate;
        finalEndDate = endDateResult.isoDate;
        finalDateSource = bestStartDate.source;  // Migration 65: Track source from quality merge

        console.log(`[Reconcile] Real-world visit - using AI dates (source: ${finalDateSource}): ${finalStartDate} to ${finalEndDate || 'ongoing'}`);
      } else {
        // Branch B: Pseudo encounters - date waterfall fallback
        if (startDateResult.isoDate) {
          // AI extracted date from document (e.g., lab collection date, report date)
          finalStartDate = startDateResult.isoDate;
          finalDateSource = 'ai_extracted';
          console.log(`[Reconcile] Pseudo encounter - using AI date: ${finalStartDate}`);
        } else if (fileCreatedAt) {
          // Fallback to file creation date
          finalStartDate = fileCreatedAt.toISOString().split('T')[0]; // YYYY-MM-DD
          finalDateSource = 'file_metadata';
          console.log(`[Reconcile] Pseudo encounter - falling back to file metadata: ${finalStartDate}`);
        } else {
          // Last resort: use current date (should be rare)
          finalStartDate = new Date().toISOString().split('T')[0];
          finalDateSource = 'upload_date';
          console.warn(`[Reconcile] Pseudo encounter - falling back to upload_date: ${finalStartDate}`);
        }

        // Pseudo encounters: start = end (completed observation/summary)
        finalEndDate = finalStartDate;
      }

      // Build encounter data JSONB for RPC
      // Rabbit #3 fix: Access JSONB fields correctly
      // Migration 63: Use normalized dates (isoDate property) for RPC payload
      // Migration 64: Use date waterfall results
      const encounterData = {
        encounter_type: firstPending.encounter_data?.encounter_type || 'unknown',
        encounter_start_date: finalStartDate,  // Migration 64: Waterfall result
        encounter_end_date: finalEndDate,      // Migration 64: Waterfall result
        encounter_timeframe_status: firstPending.is_real_world_visit
          ? (firstPending.encounter_data?.encounter_timeframe_status || 'completed')
          : 'completed',  // Pseudo encounters are always completed
        date_source: finalDateSource,  // Migration 64: Accurate provenance tracking
        provider_name: firstPending.provider_name,                // Top-level column
        facility_name: firstPending.facility_name,                // Top-level column

        // Position data (17 fields from mergePositionData)
        start_page: mergedPosition.start_page,
        start_boundary_type: mergedPosition.start_boundary_type,
        start_text_marker: mergedPosition.start_text_marker,
        start_marker_context: mergedPosition.start_marker_context,
        start_region_hint: mergedPosition.start_region_hint,
        start_text_y_top: mergedPosition.start_text_y_top,
        start_text_height: mergedPosition.start_height,
        start_y: mergedPosition.start_y,

        end_page: mergedPosition.end_page,
        end_boundary_type: mergedPosition.end_boundary_type,
        end_text_marker: mergedPosition.end_text_marker,
        end_marker_context: mergedPosition.end_marker_context,
        end_region_hint: mergedPosition.end_region_hint,
        end_text_y_top: mergedPosition.end_text_y_top,
        end_text_height: mergedPosition.end_text_height,
        end_y: mergedPosition.end_y,

        position_confidence: mergedPosition.position_confidence,

        // Page ranges and metadata
        page_ranges: mergedPageRanges,
        pass_0_5_confidence: firstPending.confidence,             // Top-level column
        summary: firstPending.encounter_data?.summary || null,     // Rabbit #3: From JSONB
        is_real_world_visit: isRealWorldVisit,   // Migration 65: Merged value (any true = all true)

        // Quality tier (from calculation)
        data_quality_tier: qualityData.tier,
        // Migration 63: Enrich quality criteria with date ambiguity flags
        quality_criteria_met: {
          ...qualityData.criteria,
          date_ambiguity_flags: {
            patient_date_of_birth: dobResult.wasAmbiguous ? 'ambiguous_dd_mm_assumed' : 'unambiguous',
            patient_date_of_birth_confidence: dobResult.confidence,
            patient_date_of_birth_method: dobResult.parseMethod,
            encounter_start_date: startDateResult.wasAmbiguous ? 'ambiguous_dd_mm_assumed' : 'unambiguous',
            encounter_start_date_confidence: startDateResult.confidence,
            encounter_end_date: endDateResult.wasAmbiguous ? 'ambiguous_dd_mm_assumed' : 'unambiguous',
            encounter_end_date_confidence: endDateResult.confidence
          }
        },

        // Encounter source metadata (5 fields)
        encounter_source: 'shell_file',
        created_by_user_id: firstPending.created_by_user_id,
        manual_created_by: null,
        api_source_name: null,
        api_import_date: null,

        // Migration 63: Identity fields (use isoDate for RPC payload)
        patient_full_name: pickBestValue(groupPendings.map(p => p.patient_full_name)),
        patient_date_of_birth: dobResult.isoDate,  // Migration 63: Normalized ISO date
        patient_address: pickBestValue(groupPendings.map(p => p.patient_address)),
        chief_complaint: firstPending.encounter_data?.chief_complaint || null
      };

      console.log('[Reconcile] Identity merged:', {
        patient_full_name: encounterData.patient_full_name,
        patient_date_of_birth: encounterData.patient_date_of_birth,
        patient_date_of_birth_raw: dobResult.originalFormat,
        patient_date_of_birth_ambiguous: dobResult.wasAmbiguous,
        patient_address: encounterData.patient_address,
        chief_complaint: encounterData.chief_complaint,
        encounter_start_date: encounterData.encounter_start_date,
        encounter_start_date_raw: startDateResult.originalFormat,
        encounter_end_date: encounterData.encounter_end_date,
        date_source: encounterData.date_source,  // Migration 64/65: Show waterfall provenance
        is_real_world_visit: isRealWorldVisit,   // Migration 65: Merged value
        pending_count: groupPendings.length
      });

      // Call atomic RPC to create final encounter
      const pendingIds = groupPendings.map(p => p.id);
      const finalEncounterId = await reconcilePendingsToFinal(
        pendingIds,
        patientId,
        shellFileId,
        encounterData
      );

      console.log(`[Reconcile] Created final encounter ${finalEncounterId} from ${pendingIds.length} pendings`);

      // Complete cascade chain tracking (if cascading encounter)
      if (cascadeId) {
        const lastChunk = Math.max(...groupPendings.map(p => p.chunk_number));
        await completeCascadeChain(cascadeId, lastChunk, finalEncounterId, pendingIds.length);
        console.log(`[Reconcile] Completed cascade chain ${cascadeId}`);
      }

      finalEncounterIds.push(finalEncounterId);

    } catch (error) {
      console.error(`[Reconcile] Error processing cascade ${cascadeId}:`, error);
      await markCascadeAsAbandoned(
        groupPendings,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // STEP 5: Aggregate batching analysis to shell_files
  await aggregateBatchingAnalysis(sessionId, shellFileId, totalPages);

  // STEP 6: Update metrics after reconciliation (Migration 60: Decoupled from ai_processing_sessions)
  try {
    // Migration 60: RPC is now self-contained - only needs shell_file_id
    // The function will self-heal (create metrics record if missing) and query pass05_progressive_sessions
    const { error: metricsError } = await supabase.rpc('update_strategy_a_metrics', {
      p_shell_file_id: shellFileId
      // Migration 60: p_session_id parameter removed (kept as optional DEFAULT NULL for backward compat)
    });

    if (metricsError) {
      console.error(`[Reconcile] Failed to update metrics:`, metricsError);
      // Don't throw - metrics update failure shouldn't block reconciliation success
    } else {
      console.log(`[Reconcile] Updated Strategy A metrics successfully`);
    }
  } catch (error) {
    console.error(`[Reconcile] Exception updating metrics:`, error);
    // Don't throw - metrics update failure shouldn't block reconciliation success
  }

  console.log(`[Reconcile] Reconciliation complete: ${finalEncounterIds.length} final encounters created`);

  return finalEncounterIds;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Session guard validation
 *
 * Ensures session is ready for reconciliation:
 * - All chunks have completed
 * - Session processing_status is appropriate
 *
 * @throws Error if session not ready
 */
async function validateSessionReadyForReconciliation(sessionId: string): Promise<void> {
  // Fetch session metadata
  const { data: session, error: sessionError } = await supabase
    .from('pass05_progressive_sessions')
    .select('processing_status, total_chunks')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error(`Session ${sessionId} not found: ${sessionError?.message || 'unknown'}`);
  }

  // Check all chunks completed
  const { count: completedCount, error: countError } = await supabase
    .from('pass05_chunk_results')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('processing_status', 'completed');

  if (countError) {
    throw new Error(`Failed to count completed chunks: ${countError.message}`);
  }

  if (completedCount !== session.total_chunks) {
    throw new Error(
      `Premature reconciliation attempted: ${completedCount}/${session.total_chunks} chunks completed`
    );
  }

  console.log(`[Reconcile] Session guard passed: ${completedCount}/${session.total_chunks} chunks completed`);
}

/**
 * Validate cascade group before reconciliation
 *
 * Checks:
 * - All pendings have same cascade_id
 * - All pendings have same encounter_type
 * - Chunk numbers are sequential (no gaps)
 * - Page ranges don't overlap incorrectly
 *
 * @param pendings - Pendings in cascade group
 * @returns Validation result with errors
 */
function validateCascadeGroup(
  pendings: any[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (pendings.length === 0) {
    return { valid: false, errors: ['Empty cascade group'] };
  }

  // Check 1: All have same cascade_id
  const cascadeIds = new Set(pendings.map(p => p.cascade_id));
  if (cascadeIds.size > 1) {
    errors.push(`Multiple cascade IDs: ${Array.from(cascadeIds).join(', ')}`);
  }

  // Check 2: All have same encounter_type
  // Rabbit #3: Access from encounter_data JSONB
  const encounterTypes = new Set(
    pendings.map(p => p.encounter_data?.encounter_type || 'unknown')
  );
  if (encounterTypes.size > 1) {
    errors.push(`Multiple encounter types: ${Array.from(encounterTypes).join(', ')}`);
  }

  // Check 3: Sequential chunk numbers (if cascading)
  if (pendings.length > 1) {
    const sorted = pendings.slice().sort((a, b) => a.chunk_number - b.chunk_number);
    const chunkNumbers = sorted.map(p => p.chunk_number);

    for (let i = 1; i < chunkNumbers.length; i++) {
      if (chunkNumbers[i] !== chunkNumbers[i - 1] + 1) {
        errors.push(`Chunk gap: ${chunkNumbers[i - 1]} -> ${chunkNumbers[i]}`);
      }
    }

    // Check 4: Page ranges don't overlap incorrectly
    for (let i = 1; i < sorted.length; i++) {
      const prevEndPage = sorted[i - 1].end_page;
      const currStartPage = sorted[i].start_page;

      if (currStartPage < prevEndPage) {
        errors.push(
          `Page overlap: Chunk ${sorted[i - 1].chunk_number} ends at ${prevEndPage}, ` +
          `Chunk ${sorted[i].chunk_number} starts at ${currStartPage}`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// GROUPING HELPERS
// ============================================================================

/**
 * Group pending encounters by cascade_id
 *
 * Non-cascading encounters have cascade_id = null, each gets own group.
 *
 * @param pendings - All pending encounters for session
 * @returns Map of cascade_id -> pending array
 */
function groupPendingsByCascade(pendings: any[]): Map<string | null, any[]> {
  const groups = new Map<string | null, any[]>();

  for (const pending of pendings) {
    const cascadeId = pending.cascade_id || null;

    // Non-cascading encounters (cascade_id = null) each get own group
    // Use pending_id as unique key for non-cascading
    const key = cascadeId || pending.pending_id;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pending);
  }

  return groups;
}

// ============================================================================
// POSITION MERGING HELPERS
// ============================================================================

/**
 * Merge position data from cascade group
 *
 * Logic:
 * - Start position: Take from FIRST chunk (earliest encounter start)
 * - End position: Take from LAST chunk (latest encounter end)
 * - Position confidence: Weighted average by page count
 *
 * Reference: 08-RECONCILIATION-STRATEGY-V2.md lines 62-139
 *
 * @param pendings - Sorted pending encounters in cascade
 * @returns Merged position data (17 fields)
 */
function mergePositionData(pendings: any[]): any {
  // Sort by chunk number
  const sorted = pendings.slice().sort((a, b) => a.chunk_number - b.chunk_number);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Calculate weighted average confidence
  let totalConfidenceWeighted = 0;
  let totalPages = 0;

  for (const pending of sorted) {
    const pageCount = (pending.end_page - pending.start_page + 1) || 1;
    totalConfidenceWeighted += (pending.position_confidence || 0.5) * pageCount;
    totalPages += pageCount;
  }

  const avgConfidence = totalPages > 0 ? totalConfidenceWeighted / totalPages : 0.5;

  return {
    // Start position (from FIRST chunk)
    start_page: first.start_page,
    start_boundary_type: first.start_boundary_type,
    start_text_marker: first.start_text_marker,
    start_marker_context: first.start_marker_context,
    start_region_hint: first.start_region_hint,
    start_text_y_top: first.start_text_y_top,
    start_text_height: first.start_text_height,
    start_y: first.start_y,

    // End position (from LAST chunk)
    end_page: last.end_page,
    end_boundary_type: last.end_boundary_type,
    end_text_marker: last.end_text_marker,
    end_marker_context: last.end_marker_context,
    end_region_hint: last.end_region_hint,
    end_text_y_top: last.end_text_y_top,
    end_text_height: last.end_text_height,
    end_y: last.end_y,

    // Weighted average confidence
    position_confidence: avgConfidence
  };
}

/**
 * Merge overlapping or adjacent page ranges
 *
 * Preserved from original pending-reconciler.ts (lines 130-153).
 * This logic is correct for Strategy A.
 *
 * @param ranges - Array of [start, end] page ranges
 * @returns Merged page ranges
 */
function mergePageRanges(ranges: number[][]): number[][] {
  if (ranges.length === 0) return [];

  // Sort by start page
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);

  const merged: number[][] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    // Check if ranges overlap or are adjacent
    if (current[0] <= last[1] + 1) {
      // Merge: extend the last range to cover current
      last[1] = Math.max(last[1], current[1]);
    } else {
      // No overlap: add as new range
      merged.push(current);
    }
  }

  return merged;
}

// ============================================================================
// QUALITY TIER HELPERS
// ============================================================================

/**
 * Calculate quality tier for encounter
 *
 * Criteria:
 * - Criteria A: Patient identity (full name + DOB from document)
 * - Criteria B: Provider/facility (provider OR facility + encounter date)
 * - Criteria C: Healthcare professional verification (manual or API)
 *
 * Tier Logic:
 * - IF Criteria C met → VERIFIED
 * - ELSE IF Criteria A AND Criteria B → HIGH
 * - ELSE IF Criteria A (but NOT Criteria B) → MEDIUM
 * - ELSE → LOW
 *
 * Reference: 11-DATA-QUALITY-SYSTEM.md lines 30-53
 *
 * @param pending - First pending in cascade (clinical data source)
 * @returns Quality tier and criteria met JSONB
 */
function calculateQualityTier(pending: any): {
  tier: 'low' | 'medium' | 'high' | 'verified';
  criteria: any;
} {
  // Criteria A: Patient identity confirmed
  const criteriaA = !!(
    pending.patient_full_name &&
    pending.patient_date_of_birth
  );

  // Criteria B: Provider/facility details confirmed
  const criteriaB = !!(
    (pending.provider_name || pending.facility_name) &&
    pending.encounter_start_date
  );

  // Criteria C: Healthcare professional verification
  // For uploaded shell_files, this is always false (no manual verification yet)
  // Future: Check manual_created_by or api_source_name
  const criteriaC = false;

  // Calculate tier
  let tier: 'low' | 'medium' | 'high' | 'verified';

  if (criteriaC) {
    tier = 'verified';
  } else if (criteriaA && criteriaB) {
    tier = 'high';
  } else if (criteriaA) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  return {
    tier,
    criteria: {
      criteria_a: criteriaA,
      criteria_b: criteriaB,
      criteria_c: criteriaC
    }
  };
}

// ============================================================================
// BATCHING ANALYSIS HELPERS
// ============================================================================

/**
 * Aggregate batching analysis from all chunks
 *
 * Combines page_separation_analysis from all chunks into shell_files.page_separation_analysis.
 * Sorts safe split points, calculates summary statistics.
 *
 * Reference: 08-RECONCILIATION-STRATEGY-V2.md lines 182-284
 *
 * @param sessionId - UUID of progressive session
 * @param shellFileId - UUID of shell file
 * @param totalPages - Total pages in document
 */
async function aggregateBatchingAnalysis(
  sessionId: string,
  shellFileId: string,
  totalPages: number
): Promise<void> {
  console.log(`[Reconcile] Aggregating batching analysis for session ${sessionId}`);

  // Fetch all chunk results
  const chunkResults = await getChunkResultsForSession(sessionId);

  if (chunkResults.length === 0) {
    console.warn(`[Reconcile] No chunk results found for batching analysis`);
    return;
  }

  // Combine all safe split points
  const allSplitPoints: any[] = [];

  for (const chunk of chunkResults) {
    const analysis = chunk.page_separation_analysis;
    if (analysis?.safe_split_points) {
      allSplitPoints.push(...analysis.safe_split_points);
    }
  }

  // Check if we have any split points before processing
  if (allSplitPoints.length === 0) {
    console.log(`[Reconcile] No split points to aggregate`);
    return;
  }

  // Sort by page number with null-safe access (Rabbit #6 fix)
  allSplitPoints.sort((a, b) => {
    const pageA = a.split_type === 'inter_page'
      ? (a.between_pages?.[0] ?? a.page ?? 0)
      : (a.page ?? 0);
    const pageB = b.split_type === 'inter_page'
      ? (b.between_pages?.[0] ?? b.page ?? 0)
      : (b.page ?? 0);
    return pageA - pageB;
  });

  // Calculate summary statistics
  const interPageCount = allSplitPoints.filter(s => s.split_type === 'inter_page').length;
  const intraPageCount = allSplitPoints.filter(s => s.split_type === 'intra_page').length;
  const avgConfidence = allSplitPoints.length > 0
    ? allSplitPoints.reduce((sum, s) => sum + (s.confidence || 0), 0) / allSplitPoints.length
    : 0;

  // Build final analysis
  const finalAnalysis = {
    version: '2.0',
    total_pages: totalPages,
    analysis_date: new Date().toISOString(),
    safe_split_points: allSplitPoints,
    summary: {
      total_splits: allSplitPoints.length,
      inter_page_splits: interPageCount,
      intra_page_splits: intraPageCount,
      avg_confidence: avgConfidence,
      pages_per_split: totalPages / (allSplitPoints.length || 1)
    }
  };

  // Store in shell_files
  await updateAggregatedBatchingAnalysis(shellFileId, finalAnalysis);

  console.log(
    `[Reconcile] Batching analysis aggregated: ${allSplitPoints.length} split points ` +
    `(${interPageCount} inter, ${intraPageCount} intra)`
  );
}

// ============================================================================
// ERROR HANDLING HELPERS
// ============================================================================

/**
 * Mark entire cascade as abandoned
 *
 * Called when cascade validation fails or reconciliation errors occur.
 * Marks all pendings as 'abandoned' with review reason.
 *
 * @param pendings - Pendings in failed cascade
 * @param reason - Error reason
 */
async function markCascadeAsAbandoned(
  pendings: any[],
  reason: string
): Promise<void> {
  console.error(`[Reconcile] Marking ${pendings.length} pendings as abandoned: ${reason}`);

  for (const pending of pendings) {
    const { error } = await supabase
      .from('pass05_pending_encounters')
      .update({
        status: 'abandoned',
        requires_review: true,
        review_reason: `Reconciliation failed: ${reason}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', pending.id);

    if (error) {
      console.error(`[Reconcile] Failed to mark pending ${pending.id} as abandoned:`, error);
    }
  }
}
