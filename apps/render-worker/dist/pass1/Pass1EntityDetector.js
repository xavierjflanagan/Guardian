"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pass1EntityDetector = void 0;
const openai_1 = __importDefault(require("openai"));
const pass1_prompts_1 = require("./pass1-prompts");
const pass1_translation_1 = require("./pass1-translation");
const pass1_database_builder_1 = require("./pass1-database-builder");
// =============================================================================
// PASS 1 ENTITY DETECTOR CLASS
// =============================================================================
class Pass1EntityDetector {
    openai;
    config;
    constructor(config) {
        this.config = config;
        this.openai = new openai_1.default({
            apiKey: config.openai_api_key,
        });
    }
    // ===========================================================================
    // MAIN PROCESSING METHOD
    // ===========================================================================
    /**
     * Process a document through Pass 1 entity detection
     *
     * @param input - Complete Pass 1 input (raw file + OCR data)
     * @returns Processing result with database records
     */
    async processDocument(input) {
        const startTime = Date.now();
        try {
            // Step 1: Validate input
            this.validateInput(input);
            // Step 2: Prepare session metadata
            const sessionMetadata = {
                shell_file_id: input.shell_file_id,
                patient_id: input.patient_id,
                processing_session_id: input.processing_session_id,
                model_used: this.config.model,
                vision_processing: true,
                ocr_provider: input.ocr_spatial_data.ocr_provider,
                started_at: new Date().toISOString(),
            };
            // Step 3: Call AI for entity detection
            console.log(`[Pass1] Calling ${this.config.model} for entity detection...`);
            const aiResponse = await this.callAIForEntityDetection(input);
            // Step 4: Translate AI output to database format
            console.log(`[Pass1] Translating ${aiResponse.entities.length} entities to database format...`);
            const entityRecords = (0, pass1_translation_1.translateAIOutputToDatabase)(aiResponse, sessionMetadata);
            // Step 5: Validate translated records
            const validation = (0, pass1_translation_1.validateRecordBatch)(entityRecords);
            if (!validation.valid) {
                console.error(`[Pass1] Validation failed for ${validation.invalidRecords} records:`, validation.errors);
                throw new Error(`Record validation failed: ${validation.errors.length} errors found`);
            }
            // Step 6: Generate statistics
            const stats = (0, pass1_translation_1.generateRecordStatistics)(entityRecords);
            // Step 7: Calculate processing time
            const processingTime = (Date.now() - startTime) / 1000;
            console.log(`[Pass1] Processing complete: ${stats.total_entities} entities in ${processingTime.toFixed(2)}s`);
            // Step 8: Build all database records (7 tables)
            const databaseRecords = (0, pass1_database_builder_1.buildPass1DatabaseRecords)(input, aiResponse, sessionMetadata, entityRecords);
            // Step 9: Return success result
            return {
                success: true,
                processing_session_id: input.processing_session_id,
                shell_file_id: input.shell_file_id,
                patient_id: input.patient_id,
                total_entities_detected: stats.total_entities,
                entities_by_category: {
                    clinical_event: stats.by_category.clinical_event,
                    healthcare_context: stats.by_category.healthcare_context,
                    document_structure: stats.by_category.document_structure,
                },
                records_created: {
                    entity_audit: entityRecords.length,
                    ai_sessions: 1,
                    shell_files_updated: 1,
                    profile_classification: 1,
                    entity_metrics: 1,
                    confidence_scoring: databaseRecords.ai_confidence_scoring.length,
                    manual_review_queue: databaseRecords.manual_review_queue.length,
                },
                processing_time_seconds: processingTime,
                cost_estimate: aiResponse.processing_metadata.cost_estimate,
                quality_metrics: {
                    overall_confidence: aiResponse.processing_metadata.confidence_metrics.overall_confidence,
                    ai_ocr_agreement: stats.average_ai_ocr_agreement,
                    manual_review_required_count: stats.manual_review_required,
                },
                pass2_entities_queued: stats.pass2_pending,
            };
        }
        catch (error) {
            const processingTime = (Date.now() - startTime) / 1000;
            console.error('[Pass1] Processing failed:', error);
            return {
                success: false,
                processing_session_id: input.processing_session_id,
                shell_file_id: input.shell_file_id,
                patient_id: input.patient_id,
                total_entities_detected: 0,
                entities_by_category: {
                    clinical_event: 0,
                    healthcare_context: 0,
                    document_structure: 0,
                },
                records_created: {
                    entity_audit: 0,
                    ai_sessions: 0,
                    shell_files_updated: 0,
                    profile_classification: 0,
                    entity_metrics: 0,
                    confidence_scoring: 0,
                    manual_review_queue: 0,
                },
                processing_time_seconds: processingTime,
                cost_estimate: 0,
                quality_metrics: {
                    overall_confidence: 0,
                    ai_ocr_agreement: 0,
                    manual_review_required_count: 0,
                },
                pass2_entities_queued: 0,
                error: error.message,
                retry_recommended: this.shouldRetryError(error),
            };
        }
    }
    // ===========================================================================
    // AI INTEGRATION
    // ===========================================================================
    /**
     * Call OpenAI GPT-4o Vision for entity detection
     *
     * @param input - Pass 1 input with raw file and OCR data
     * @returns Parsed AI response
     */
    async callAIForEntityDetection(input) {
        const startTime = Date.now();
        // Generate the prompt
        const prompt = (0, pass1_prompts_1.generatePass1ClassificationPrompt)(input);
        // Call OpenAI with vision + text
        const response = await this.openai.chat.completions.create({
            model: this.config.model,
            messages: [
                {
                    role: 'system',
                    content: pass1_prompts_1.PASS1_SYSTEM_MESSAGE,
                },
                {
                    role: 'user',
                    content: [
                        // Image input (PRIMARY)
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${input.raw_file.file_type};base64,${input.raw_file.file_data}`,
                            },
                        },
                        // Text prompt with OCR reference (SECONDARY)
                        {
                            type: 'text',
                            text: prompt,
                        },
                    ],
                },
            ],
            temperature: this.config.temperature,
            max_tokens: this.config.max_tokens,
            response_format: { type: 'json_object' },
        });
        const processingTime = (Date.now() - startTime) / 1000;
        // Parse the response
        const rawResult = JSON.parse(response.choices[0].message.content || '{}');
        // Enhance with actual token usage and cost
        const enhancedResponse = {
            processing_metadata: {
                model_used: this.config.model,
                vision_processing: true,
                processing_time_seconds: processingTime,
                token_usage: {
                    prompt_tokens: response.usage?.prompt_tokens || 0,
                    completion_tokens: response.usage?.completion_tokens || 0,
                    total_tokens: response.usage?.total_tokens || 0,
                    image_tokens: this.estimateImageTokens(input.raw_file.file_size),
                },
                cost_estimate: this.calculateCost(response.usage, input.raw_file.file_size),
                confidence_metrics: rawResult.processing_metadata?.confidence_metrics || {
                    overall_confidence: 0.8,
                    visual_interpretation_confidence: 0.8,
                    category_confidence: {
                        clinical_event: 0.8,
                        healthcare_context: 0.8,
                        document_structure: 0.9,
                    },
                },
            },
            entities: rawResult.entities || [],
            document_coverage: rawResult.document_coverage || {
                total_content_processed: 0,
                content_classified: 0,
                coverage_percentage: 0,
                unclassified_segments: [],
                visual_quality_score: 0.8,
            },
            cross_validation_results: rawResult.cross_validation_results || {
                ai_ocr_agreement_score: 0.85,
                high_discrepancy_count: 0,
                ocr_missed_entities: 0,
                ai_missed_ocr_text: 0,
                spatial_mapping_success_rate: 0.9,
            },
            quality_assessment: rawResult.quality_assessment || {
                completeness_score: 0.9,
                classification_confidence: 0.85,
                cross_validation_score: 0.85,
                requires_manual_review: false,
                quality_flags: [],
            },
            profile_safety: rawResult.profile_safety || {
                patient_identity_confidence: 0.9,
                age_appropriateness_score: 0.9,
                safety_flags: [],
                requires_identity_verification: false,
            },
        };
        return enhancedResponse;
    }
    // ===========================================================================
    // COST CALCULATION
    // ===========================================================================
    /**
     * Calculate cost for GPT-4o Vision processing
     *
     * GPT-4o Pricing (as of 2025):
     * - Input: $2.50 per 1M tokens
     * - Output: $10.00 per 1M tokens
     * - Image: ~$7.65 per 1M tokens (varies by size)
     */
    calculateCost(usage, fileSizeBytes) {
        const GPT4O_PRICING = {
            input_per_1m: 2.50,
            output_per_1m: 10.00,
            image_per_1m: 7.65,
        };
        const promptTokens = usage?.prompt_tokens || 0;
        const completionTokens = usage?.completion_tokens || 0;
        const imageTokens = this.estimateImageTokens(fileSizeBytes);
        const inputCost = (promptTokens / 1_000_000) * GPT4O_PRICING.input_per_1m;
        const outputCost = (completionTokens / 1_000_000) * GPT4O_PRICING.output_per_1m;
        const imageCost = (imageTokens / 1_000_000) * GPT4O_PRICING.image_per_1m;
        return inputCost + outputCost + imageCost;
    }
    /**
     * Estimate image tokens based on file size
     * Rough approximation: ~85 tokens per 1000 bytes for images
     */
    estimateImageTokens(fileSizeBytes) {
        return Math.ceil((fileSizeBytes / 1000) * 85);
    }
    // ===========================================================================
    // VALIDATION & ERROR HANDLING
    // ===========================================================================
    /**
     * Validate Pass 1 input before processing
     */
    validateInput(input) {
        if (!input.shell_file_id) {
            throw new Error('Missing shell_file_id');
        }
        if (!input.patient_id) {
            throw new Error('Missing patient_id');
        }
        if (!input.processing_session_id) {
            throw new Error('Missing processing_session_id');
        }
        if (!input.raw_file.file_data) {
            throw new Error('Missing raw file data');
        }
        if (!input.raw_file.file_type.match(/^(image\/|application\/pdf)/)) {
            throw new Error(`Unsupported file type: ${input.raw_file.file_type}`);
        }
        if (!input.ocr_spatial_data.extracted_text) {
            throw new Error('Missing OCR extracted text');
        }
        if (!Array.isArray(input.ocr_spatial_data.spatial_mapping)) {
            throw new Error('Invalid OCR spatial mapping format');
        }
        // File size validation (10MB limit)
        const maxFileSize = 10 * 1024 * 1024;
        if (input.raw_file.file_size > maxFileSize) {
            throw new Error(`File too large: ${input.raw_file.file_size} bytes (max: ${maxFileSize})`);
        }
    }
    /**
     * Determine if error is retryable
     */
    shouldRetryError(error) {
        const retryableErrors = [
            'rate_limit_exceeded',
            'timeout',
            'connection_error',
            'service_unavailable',
        ];
        const errorMessage = error.message?.toLowerCase() || '';
        return retryableErrors.some((retryable) => errorMessage.includes(retryable));
    }
    // ===========================================================================
    // PUBLIC HELPER METHODS
    // ===========================================================================
    /**
     * Get ALL Pass 1 database records for insertion (all 7 tables)
     * (Used by worker to insert into ALL Pass 1 tables)
     */
    async getAllDatabaseRecords(input) {
        const sessionMetadata = {
            shell_file_id: input.shell_file_id,
            patient_id: input.patient_id,
            processing_session_id: input.processing_session_id,
            model_used: this.config.model,
            vision_processing: true,
            ocr_provider: input.ocr_spatial_data.ocr_provider,
            started_at: new Date().toISOString(),
        };
        const aiResponse = await this.callAIForEntityDetection(input);
        const entityRecords = (0, pass1_translation_1.translateAIOutputToDatabase)(aiResponse, sessionMetadata);
        return (0, pass1_database_builder_1.buildPass1DatabaseRecords)(input, aiResponse, sessionMetadata, entityRecords);
    }
    /**
     * Get entity audit records only (legacy method - use getAllDatabaseRecords instead)
     * @deprecated Use getAllDatabaseRecords() for complete Pass 1 implementation
     */
    async getEntityAuditRecords(input) {
        const allRecords = await this.getAllDatabaseRecords(input);
        return allRecords.entity_processing_audit;
    }
}
exports.Pass1EntityDetector = Pass1EntityDetector;
//# sourceMappingURL=Pass1EntityDetector.js.map