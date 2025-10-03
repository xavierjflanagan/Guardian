/**
 * Pass 1 Entity Detector - Main Class
 * Created: 2025-10-03
 * Purpose: Core entity detection using GPT-4o Vision with dual-input processing
 *
 * This class:
 * 1. Calls OpenAI GPT-4o Vision with raw document image (PRIMARY)
 * 2. Provides OCR data for cross-validation (SECONDARY)
 * 3. Parses AI response with entity classification
 * 4. Translates to database format
 * 5. Returns processing results
 */
import { Pass1Input, Pass1ProcessingResult, Pass1Config, EntityAuditRecord } from './pass1-types';
import { Pass1DatabaseRecords } from './pass1-database-builder';
export declare class Pass1EntityDetector {
    private openai;
    private config;
    constructor(config: Pass1Config);
    /**
     * Process a document through Pass 1 entity detection
     *
     * @param input - Complete Pass 1 input (raw file + OCR data)
     * @returns Processing result with database records
     */
    processDocument(input: Pass1Input): Promise<Pass1ProcessingResult>;
    /**
     * Call OpenAI GPT-4o Vision for entity detection
     *
     * @param input - Pass 1 input with raw file and OCR data
     * @returns Parsed AI response
     */
    private callAIForEntityDetection;
    /**
     * Calculate cost for GPT-4o Vision processing
     *
     * GPT-4o Pricing (as of 2025):
     * - Input: $2.50 per 1M tokens
     * - Output: $10.00 per 1M tokens
     * - Image: ~$7.65 per 1M tokens (varies by size)
     */
    private calculateCost;
    /**
     * Estimate image tokens based on file size
     * Rough approximation: ~85 tokens per 1000 bytes for images
     */
    private estimateImageTokens;
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
}
//# sourceMappingURL=Pass1EntityDetector.d.ts.map