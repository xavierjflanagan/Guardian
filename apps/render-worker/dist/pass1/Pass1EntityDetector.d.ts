/**
 * Pass 1 Entity Detector - Main Class
 * Created: 2025-10-03
 * Updated: 2025-11-28 - Added OCR-only mode (Strategy-A)
 * Purpose: Core entity detection with two modes:
 *   - Legacy: GPT5-mini Vision with raw document image (PRIMARY) + OCR (SECONDARY)
 *   - OCR-only: Enhanced OCR text only (no image tokens, ~60% cost reduction)
 *
 * This class:
 * 1. [Legacy] Calls OpenAI GPT5-mini Vision with raw document image
 * 2. [Legacy] Provides OCR data for cross-validation
 * 3. [OCR-only] Calls OpenAI with enhanced OCR Y-only text
 * 4. Parses AI response with entity classification
 * 5. Translates to database format
 * 6. Returns processing results
 */
import { Pass1Input, Pass1InputOCROnly, Pass1ProcessingResult, Pass1Config, EntityAuditRecord } from './pass1-types';
import { Pass1DatabaseRecords } from './pass1-database-builder';
export declare class Pass1EntityDetector {
    private openai;
    private config;
    private logger;
    constructor(config: Pass1Config);
    /**
     * Process a document through Pass 1 entity detection
     *
     * @param input - Complete Pass 1 input (raw file + OCR data)
     * @returns Processing result with database records
     */
    processDocument(input: Pass1Input): Promise<Pass1ProcessingResult>;
    /**
     * Call OpenAI GPT5-mini for entity detection
     *
     * @param input - Pass 1 input with raw file and OCR data
     * @returns Parsed AI response
     */
    private callAIForEntityDetection;
    /**
     * Model pricing configuration
     * Source: OpenAI API pricing (as of 2025-10-12)
     */
    private static readonly MODEL_PRICING;
    /**
     * Default pricing fallback (uses GPT-4o pricing)
     */
    private static readonly DEFAULT_PRICING;
    /**
     * Calculate cost for OpenAI Vision processing with model-specific pricing
     *
     * Note: OpenAI's prompt_tokens already includes image tokens, so we don't
     * need to estimate or add them separately.
     *
     * @param usage - OpenAI usage object with token counts
     * @returns Estimated cost in USD
     */
    private calculateCost;
    /**
     * Validate Pass 1 input before processing
     */
    private validateInput;
    /**
     * Determine if error is retryable
     */
    private shouldRetryError;
    /**
     * Get ALL Pass 1 database records for insertion (all 7 tables)
     * (Used by worker to insert into ALL Pass 1 tables)
     */
    getAllDatabaseRecords(input: Pass1Input): Promise<Pass1DatabaseRecords>;
    /**
     * Get entity audit records only (legacy method - use getAllDatabaseRecords instead)
     * @deprecated Use getAllDatabaseRecords() for complete Pass 1 implementation
     */
    getEntityAuditRecords(input: Pass1Input): Promise<EntityAuditRecord[]>;
    /**
     * Process a document through Pass 1 entity detection using OCR-only mode
     *
     * @param input - OCR-only Pass 1 input (enhanced OCR text, no raw image)
     * @returns Processing result with database records
     */
    processDocumentOCROnly(input: Pass1InputOCROnly): Promise<Pass1ProcessingResult>;
    /**
     * Call OpenAI for OCR-only entity detection (no vision)
     *
     * @param input - OCR-only Pass 1 input
     * @returns Parsed AI response
     */
    private callAIForEntityDetectionOCROnly;
    /**
     * Validate OCR-only input before processing
     */
    private validateOCROnlyInput;
    /**
     * Get ALL Pass 1 database records for OCR-only mode (all 7 tables)
     */
    getAllDatabaseRecordsOCROnly(input: Pass1InputOCROnly): Promise<Pass1DatabaseRecords>;
}
//# sourceMappingURL=Pass1EntityDetector.d.ts.map