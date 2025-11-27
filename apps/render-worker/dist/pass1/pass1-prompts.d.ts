/**
 * Pass 1 Entity Detection - AI Prompt Templates
 * Created: 2025-10-03
 * Updated: 2025-11-28 - Added OCR-only mode (Strategy-A)
 * Purpose: Prompt templates for entity detection
 *
 * TWO MODES:
 * 1. Legacy (dual-input): Vision + OCR for maximum accuracy (58% of input is image tokens)
 * 2. OCR-only (Strategy-A): Enhanced OCR text only (no image tokens, ~60% cost reduction)
 *
 * These prompts instruct the AI to:
 * 1. [Legacy] Analyze raw document image with vision capabilities (PRIMARY)
 * 2. [Legacy] Use OCR spatial data for cross-validation (SECONDARY)
 * 3. [OCR-only] Analyze enhanced OCR text with Y-coordinates (PRIMARY)
 * 4. Classify entities using 3-category taxonomy
 * 5. Provide confidence scores and quality metrics
 */
import { Pass1Input } from './pass1-types';
export declare function generatePass1ClassificationPrompt(input: Pass1Input, modelName?: string): string;
export declare const PASS1_SYSTEM_MESSAGE = "You are a medical document entity detection system using dual inputs (vision + OCR) for maximum accuracy. You analyze medical documents to identify and classify every piece of information into three categories: clinical events, healthcare context, and document structure. You provide confidence scores, spatial coordinates, and cross-validation metrics for all detected entities.";
export declare function generateValidationPrompt(documentText: string, classificationResults: string): string;
export declare function generateErrorRecoveryPrompt(errorDetails: string, documentSegment: string): string;
/**
 * Generate Pass 1 classification prompt for OCR-only mode
 * Uses enhanced OCR with Y-coordinates (no raw image)
 *
 * Strategy-A: OCR is PRIMARY input. No vision processing.
 * Expected ~60% cost reduction from removing image tokens.
 *
 * @param enhancedOCR Enhanced OCR text in Y-only format: [Y:###] text text text
 * @param modelName AI model name for metadata
 */
export declare function generatePass1ClassificationPromptOCROnly(enhancedOCR: string, modelName?: string): string;
/**
 * System message for OCR-only mode
 */
export declare const PASS1_SYSTEM_MESSAGE_OCR_ONLY = "You are a medical document entity detection system analyzing OCR-extracted text with spatial coordinates. You identify and classify every piece of information into three categories: clinical events, healthcare context, and document structure. You provide confidence scores and spatial coordinates for all detected entities. You work with OCR text only - no image analysis.";
/**
 * Truncate OCR text if it's too long for the prompt
 */
export declare function truncateOCRText(text: string, maxLength?: number): string;
/**
 * Format spatial mapping for prompt (if needed to reduce size)
 */
export declare function formatSpatialMapping(spatialMapping: any[], maxElements?: number): string;
//# sourceMappingURL=pass1-prompts.d.ts.map