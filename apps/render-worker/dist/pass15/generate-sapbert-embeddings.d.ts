/**
 * Generate SapBERT Embeddings for Medical Codes
 *
 * Uses HuggingFace Inference API to generate medical-specific embeddings
 * for all regional medical codes.
 *
 * Based on Experiment 2 findings:
 * - SapBERT provides 17.3pp better differentiation vs OpenAI for medications
 * - Normalized text strategy outperforms ingredient-only by 5.4pp
 *
 * Strategy:
 * - Use normalized_embedding_text column (includes dosage + form context)
 * - SapBERT model: cambridgeltl/SapBERT-from-PubMedBERT-fulltext
 * - HuggingFace API (free tier, ~1000 requests/hour)
 * - Store in column: sapbert_embedding (768 dimensions)
 * - Resume-safe: skips codes that already have SapBERT embeddings
 *
 * Reference: pass1.5-testing/experiment-2/COMPREHENSIVE_ANALYSIS.md
 */
export {};
//# sourceMappingURL=generate-sapbert-embeddings.d.ts.map