/**
 * Pass 1 Entity Detection - AI Prompt Templates
 * Created: 2025-10-03
 * Purpose: Dual-input (vision + OCR) prompt templates for vision-capable AI models
 *
 * These prompts instruct the AI to:
 * 1. Analyze raw document image with vision capabilities (PRIMARY)
 * 2. Use OCR spatial data for cross-validation (SECONDARY)
 * 3. Classify entities using 3-category taxonomy
 * 4. Provide confidence scores and quality metrics
 */
import { Pass1Input } from './pass1-types';
export declare function generatePass1ClassificationPrompt(input: Pass1Input, modelName?: string): string;
export declare const PASS1_SYSTEM_MESSAGE = "You are a medical document entity detection system using dual inputs (vision + OCR) for maximum accuracy. You analyze medical documents to identify and classify every piece of information into three categories: clinical events, healthcare context, and document structure. You provide confidence scores, spatial coordinates, and cross-validation metrics for all detected entities.";
export declare function generateValidationPrompt(documentText: string, classificationResults: string): string;
export declare function generateErrorRecoveryPrompt(errorDetails: string, documentSegment: string): string;
/**
 * Truncate OCR text if it's too long for the prompt
 */
export declare function truncateOCRText(text: string, maxLength?: number): string;
/**
 * Format spatial mapping for prompt (if needed to reduce size)
 */
export declare function formatSpatialMapping(spatialMapping: any[], maxElements?: number): string;
//# sourceMappingURL=pass1-prompts.d.ts.map