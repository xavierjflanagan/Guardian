# Current State Analysis

## The 219-Page Document Failure

### Timeline of Events

**2025-11-10 00:02:33 UTC** - Production failure:
```json
{
  "failed_at": "2025-11-10T00:02:33.842Z",
  "worker_id": "render-srv-d2qkja56ubrc73dh13q0-1762731885149",
  "error_message": "Pass 0.5 encounter discovery failed: Google AI API error (Gemini 2.5 Flash): Gemini stopped generation with reason: MAX_TOKENS. This may indicate: MAX_TOKENS (output too long), SAFETY (blocked content), RECITATION (copyright), or OTHER issues."
}
```

### Root Cause

**Output Token Limit Exceeded:**
- Gemini 2.5 Flash: 65,536 max output tokens
- 219-page medical document generates >65K tokens of JSON output
- Each encounter requires: date, provider, specialty, diagnosis, procedures, page assignments, justifications

### Current Pass 0.5 Architecture

**Single-Pass Processing:**
```typescript
// Current approach - ONE AI call for entire document
async function discoverEncounters(ocrPages: OCRPage[]): Promise<Result> {
  const prompt = buildPrompt(ocrPages); // ALL pages in one prompt
  const response = await aiProvider.generateJSON(prompt);
  const encounters = parseResponse(response);
  return { encounters };
}
```

**Limitations:**
1. **Output hard limit:** Cannot generate >65K tokens regardless of input size
2. **No chunking:** Must process entire document in one call
3. **All-or-nothing:** Failure loses all progress
4. **No incremental results:** User waits for complete processing or gets nothing

## Token Usage Analysis

### Typical Document Sizes

| Document Type | Pages | Output Tokens | Status |
|--------------|-------|---------------|---------|
| Lab results | 3 | ~2,000 | ✓ Success |
| Clinic visit | 8 | ~5,000 | ✓ Success |
| Hospital discharge | 45 | ~18,000 | ✓ Success |
| Multi-provider collection | 100 | ~40,000 | ✓ Success |
| **Large archive** | **219** | **~80,000** | **✗ FAILS** |

### Output Token Breakdown (Per Encounter)

```json
{
  "encounter_type": "outpatient_visit",        // ~10 tokens
  "encounter_start_date": "2024-03-15",        // ~8 tokens
  "provider_name": "Dr. Sarah Johnson",        // ~8 tokens
  "provider_type": "primary_care",             // ~5 tokens
  "facility_name": "City Medical Center",      // ~6 tokens
  "specialty": "Family Medicine",              // ~5 tokens
  "chief_complaint": "Annual checkup...",      // ~50 tokens
  "summary": "Patient presented for...",       // ~100 tokens
  "clinical_impression": "Overall health...",  // ~80 tokens
  "plan": "Continue current medications...",   // ~60 tokens
  "page_ranges": [12, 13, 14],                // ~10 tokens
  "spatial_bounds": { ... },                   // ~50 tokens
  "justification": "This encounter spans..." // ~150 tokens
}
// Total per encounter: ~542 tokens
```

**For 219-page document:**
- Estimated encounters: ~120-150
- Estimated output: 120 × 542 = ~65,000 tokens
- **Result:** Exceeds 65,536 limit

## Current Database Schema (Pass 0.5 Tables)

### Existing Tables

1. **healthcare_encounters** - Final encounter records
   - Single insert per encounter
   - No concept of partial/pending encounters
   - No chunk tracking

2. **ai_processing_sessions** - Processing metadata
   - One session per document
   - No support for multi-chunk sessions
   - Fields: `session_status`, `ai_model_name`, `workflow_step`

3. **pass05_encounter_metrics** - Processing metrics
   - One record per document
   - Tracks: `encounters_detected`, `processing_time_ms`, `total_tokens`
   - Progressive mode will create new dedicated tables instead of modifying this one

### What's Missing for Progressive Processing

**No support for:**
- Tracking multiple AI calls per document
- Handoff state between chunks
- Pending/incomplete encounters
- Chunk-level metrics and debugging
- Progressive session management

## Use Case Distribution

Based on production data analysis:

| Document Size | Percentage | Processing Mode |
|--------------|------------|-----------------|
| 1-10 pages | 60% | Standard (single call) |
| 11-50 pages | 25% | Standard (single call) |
| 51-100 pages | 10% | Standard (single call) |
| **101-300 pages** | **4%** | **Progressive required** |
| 300+ pages | 1% | Progressive required |

**Key Insight:** 95% of documents work fine with current architecture. Progressive mode is needed for the 5% edge cases.

## Cost Analysis

### Current Costs (Gemini 2.5 Flash)

- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

**Example document (100 pages):**
- Input: ~150K tokens = $0.011
- Output: ~40K tokens = $0.012
- **Total: $0.023 per document**

### Progressive Costs (5 chunks of 50 pages)

**Per chunk:**
- Input: ~30K tokens (smaller chunks)
- Output: ~15K tokens (smaller responses)

**5 chunks:**
- Input: 5 × 30K = 150K tokens = $0.011
- Output: 5 × 15K = 75K tokens = $0.023
- **Total: $0.034 per document**

**Cost increase:** +48% for large documents
**Benefit:** Actually works vs. complete failure

## Failure Modes

### Current System Failures

1. **MAX_TOKENS (observed):** Output exceeds 65K tokens
2. **Context window (theoretical):** Input exceeds 1M tokens (rare)
3. **Timeout (theoretical):** Very long processing time
4. **Rate limits:** API quota exhausted

### Progressive System Protections

1. **MAX_TOKENS:** Solved - each chunk stays under limit
2. **Context window:** Solved - chunks fit within window
3. **Timeout:** Improved - smaller chunks process faster
4. **Rate limits:** Same risk, but chunked failures easier to retry

## Migration Impact

### Zero Impact on Small Documents (95%)

```typescript
// Decision point
if (pages.length <= 100) {
  return processStandardPass05(pages); // Existing code path
}
```

No changes to:
- Database writes
- Processing flow
- User experience
- Cost structure

### Minimal Impact on Large Documents (5%)

Only difference:
- Multiple AI calls instead of one
- Slightly higher cost (~50%)
- Sequential processing (small latency increase)
- Better quality (more context per chunk)

## Technical Debt & Risks

### Current Approach Issues

1. **Brittleness:** One size doesn't fit all document sizes
2. **User experience:** No progress indication for long documents
3. **Error recovery:** Complete failure on any issue
4. **Scalability:** Hard limit at 65K output tokens

### Progressive Approach Benefits

1. **Resilience:** Partial success possible, easier error recovery
2. **Transparency:** Can show progress (chunk 2 of 5)
3. **Flexibility:** Can adjust chunk size based on document complexity
4. **Scalability:** No hard limits, works for any document size

## Conclusion

Progressive refinement solves a critical production issue (219-page failures) with minimal impact on the majority of documents. The architecture is backwards-compatible and provides a solid foundation for future enhancements.
