"use strict";
/**
 * Manifest Builder for Pass 0.5
 * Parses AI response and enriches with spatial bbox data from OCR
 *
 * FIX #3: PageRanges normalization (sort + fix inverted ranges)
 * FIX #4: Type safety for encounterType (validation)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseEncounterResponse = parseEncounterResponse;
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
/**
 * Validate that page ranges do not overlap between encounters
 * Phase 1 requirement: Each page belongs to exactly one encounter
 */
function validateNonOverlappingPageRanges(encounters) {
    const pageToEncounter = new Map();
    for (const enc of encounters) {
        for (const pageRange of enc.pageRanges) {
            const [start, end] = pageRange;
            for (let page = start; page <= end; page++) {
                const existingOwner = pageToEncounter.get(page);
                if (existingOwner) {
                    throw new Error(`Page range overlap detected: Page ${page} appears in both "${existingOwner}" ` +
                        `and "${enc.encounterType}". Phase 1 requires non-overlapping page ranges. ` +
                        `AI must assign each page to exactly one encounter.`);
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
function validateEncounterType(type) {
    const validTypes = [
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
    if (!validTypes.includes(type)) {
        throw new Error(`Invalid encounter type "${type}" returned by AI. ` +
            `Type must match EncounterType union defined in types.ts. ` +
            `Valid types: ${validTypes.join(', ')}`);
    }
    return true;
}
/**
 * Parse AI response and enrich with spatial bbox data from OCR
 * Note: Idempotency handled at runPass05() level
 */
async function parseEncounterResponse(aiResponse, ocrOutput, patientId, shellFileId) {
    const parsed = JSON.parse(aiResponse);
    // CRITICAL: Validate page ranges have valid end values
    for (const aiEnc of parsed.encounters) {
        for (const range of aiEnc.pageRanges) {
            if (range[1] === null || range[1] === undefined) {
                console.warn(`[Pass 0.5] Invalid page range [${range[0]}, ${range[1]}] for encounter "${aiEnc.encounterType}". ` +
                    `AI returned NULL end page. Correcting to [${range[0]}, ${range[0]}] for single-page encounter.`);
                range[1] = range[0]; // Fix NULL by assuming single-page
            }
        }
    }
    // CRITICAL: Validate non-overlapping page ranges (Phase 1 requirement)
    validateNonOverlappingPageRanges(parsed.encounters);
    const encounters = [];
    for (const aiEnc of parsed.encounters) {
        // FIX #4: Validate encounter type (throws error if invalid)
        validateEncounterType(aiEnc.encounterType);
        // FIX #3: Normalize page ranges for idempotency
        // Step 1: Fix inverted ranges (e.g., [5,1] → [1,5])
        // Step 2: Sort by start page for deterministic ordering
        const normalizedPageRanges = aiEnc.pageRanges.map(([start, end]) => {
            if (start > end) {
                console.warn(`[Pass 0.5] Inverted page range detected: [${start}, ${end}] - ` +
                    `normalizing to [${end}, ${start}] for encounter "${aiEnc.encounterType}"`);
                return [end, start];
            }
            return [start, end];
        }).sort((a, b) => a[0] - b[0]);
        // Pre-create encounter in database to get UUID
        // UPSERT for idempotency: safe to retry if manifest write fails
        const { data: dbEncounter, error } = await supabase
            .from('healthcare_encounters')
            .upsert({
            patient_id: patientId, // Required NOT NULL field
            encounter_type: aiEnc.encounterType, // Safe now (validated)
            is_real_world_visit: aiEnc.isRealWorldVisit,
            encounter_date: aiEnc.dateRange?.start || null,
            encounter_date_end: aiEnc.dateRange?.end || null, // For multi-day encounters (added in migration)
            provider_name: aiEnc.provider || null,
            facility_name: aiEnc.facility || null,
            primary_shell_file_id: shellFileId, // Link to source document
            page_ranges: normalizedPageRanges, // Use normalized (sorted) ranges
            identified_in_pass: 'pass_0_5',
            pass_0_5_confidence: aiEnc.confidence
        }, {
            onConflict: 'patient_id,primary_shell_file_id,encounter_type,encounter_date,page_ranges',
            ignoreDuplicates: false // Update existing record
        })
            .select('id')
            .single();
        if (error || !dbEncounter) {
            throw new Error(`Failed to create encounter in database: ${error?.message}`);
        }
        // Extract spatial bounds from OCR for this encounter's pages (use normalized ranges)
        const spatialBounds = extractSpatialBounds(normalizedPageRanges, ocrOutput);
        encounters.push({
            encounterId: dbEncounter.id,
            encounterType: aiEnc.encounterType, // Safe now (validated)
            isRealWorldVisit: aiEnc.isRealWorldVisit,
            dateRange: aiEnc.dateRange,
            provider: aiEnc.provider,
            facility: aiEnc.facility,
            pageRanges: normalizedPageRanges, // Return normalized ranges
            spatialBounds,
            confidence: aiEnc.confidence,
            extractedText: aiEnc.extractedText
        });
    }
    return { encounters };
}
/**
 * Extract bounding boxes from OCR for specified page ranges
 * Creates comprehensive spatial regions for functional assignment
 */
function extractSpatialBounds(pageRanges, ocrOutput) {
    const bounds = [];
    for (const range of pageRanges) {
        const [startPage, endPage] = range;
        // Handle NULL end page: treat as same page (defensive coding for Phase 1)
        const actualEndPage = endPage ?? startPage;
        for (let pageNum = startPage; pageNum <= actualEndPage; pageNum++) {
            const ocrPage = ocrOutput.fullTextAnnotation.pages[pageNum - 1];
            if (!ocrPage)
                continue;
            // Create comprehensive page region (entire page for now)
            // Phase 2: Could create sub-page regions based on content density
            const pageDims = { width: ocrPage.width, height: ocrPage.height };
            const entirePageBbox = {
                vertices: [
                    { x: 0, y: 0 },
                    { x: pageDims.width, y: 0 },
                    { x: pageDims.width, y: pageDims.height },
                    { x: 0, y: pageDims.height }
                ]
            };
            const entirePageBboxNorm = {
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
//# sourceMappingURL=manifestBuilder.js.map