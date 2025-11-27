# Pass 0.5 Context Window Analysis & Model Options

**Date:** November 8, 2025
**Issue:** 220-page document failed due to AI model context window exhaustion
**Current Model:** GPT-5-mini (128K token context window)

---

## Problem Summary

**Error:**
```
Page assignment references unknown encounter_id "enc-48".
Encounter IDs in encounters array: enc-1, enc-2, ..., enc-47, enc-50, enc-51, ..., enc-72
```

**Root Cause:** AI model skipped encounter IDs `enc-48` and `enc-49` mid-sequence due to context window overload.

**Evidence:**
- 220-page document with 72 encounters identified
- AI successfully processed but lost tracking consistency under memory pressure
- OCR succeeded perfectly (96.65% confidence)
- Validation logic correctly caught the inconsistency

**Token Estimate for 220-Page Document:**
- OCR text: ~150,000-200,000 tokens (220 pages × 700-900 tokens/page)
- Prompt: ~2,000 tokens
- AI response (72 encounters): ~10,000-15,000 tokens
- **Total:** ~160,000-215,000 tokens (exceeds GPT-5-mini's 128K limit)

---

## Available AI Models (November 2025)

### Option 1: Gemini 2.0 Flash (Google) - RECOMMENDED

**Context Window:** 1,000,000 tokens (1M)
**Pricing:** $0.10 per million input tokens, minimal output costs
**Availability:** Generally available via Google AI Studio and Vertex AI

**Why This is Best:**
- **10x larger context** than current GPT-5-mini (1M vs 128K)
- **Cheapest option** for large context: $0.10/M input (90% cheaper than GPT-4.1)
- Can handle 220-page documents easily (~200K tokens vs 1M capacity)
- Headroom for 500+ page documents if needed
- Proven performance on medical documents (from research literature)

**Cost Estimate (220-page document):**
- Input: ~200,000 tokens × $0.10 / 1M = $0.02
- Output: ~15,000 tokens × minimal cost ≈ $0.005
- **Total per document: ~$0.025 (2.5 cents)**

**Cost Comparison to Current:**
- Current GPT-5-mini: Unknown pricing (need to verify)
- Likely cheaper or comparable due to Gemini's aggressive pricing

---

### Option 2: Claude 3.5 Sonnet (Anthropic)

**Context Window:** 200,000 tokens (200K)
**Pricing:** $3.00 per million input tokens, $15.00 per million output tokens
**Availability:** Generally available via Anthropic API

**Analysis:**
- **1.56x larger context** than GPT-5-mini (200K vs 128K)
- Still might struggle with 220-page documents (needs ~160K-215K tokens)
- More expensive than Gemini 2.0 Flash (30x more expensive)
- Excellent quality but limited headroom for large documents

**Cost Estimate (220-page document):**
- Input: ~200,000 tokens × $3.00 / 1M = $0.60
- Output: ~15,000 tokens × $15.00 / 1M = $0.225
- **Total per document: ~$0.825 (82.5 cents)**

**Verdict:** Not ideal - marginal context window increase, expensive

---

### Option 3: GPT-4.1 (OpenAI)

**Context Window:** 1,000,000 tokens (1M)
**Pricing:** $2.00 per million input tokens, $8.00 per million output tokens
**Availability:** API only (no ChatGPT UI access)

**Analysis:**
- **10x larger context** than current GPT-5-mini
- Same 1M context as Gemini 2.0 Flash
- **20x more expensive** than Gemini ($2.00 vs $0.10 input)
- Possible benefits: OpenAI ecosystem familiarity, structured outputs

**Cost Estimate (220-page document):**
- Input: ~200,000 tokens × $2.00 / 1M = $0.40
- Output: ~15,000 tokens × $8.00 / 1M = $0.12
- **Total per document: ~$0.52 (52 cents)**

**Prompt Caching Discount:**
- 75% discount for repeated context (useful for multi-pass processing)
- Could reduce costs to ~$0.15 per document with caching

**Verdict:** Viable but expensive compared to Gemini

---

### Option 4: Gemini 2.5 Pro (Google)

**Context Window:** 1,000,000 tokens (expanding to 2,000,000)
**Pricing:** Higher tier than 2.0 Flash (research shows $0.15 input / $0.60 output per million)
**Availability:** Generally available

**Analysis:**
- **Largest context window** available (up to 2M)
- Highest reasoning scores (86.4 on GPQA Diamond benchmark)
- More expensive than 2.0 Flash (50% more)
- Overkill for current needs (220 pages = 200K tokens, well under 1M)

**Cost Estimate (220-page document):**
- Input: ~200,000 tokens × $0.15 / 1M = $0.03
- Output: ~15,000 tokens × $0.60 / 1M = $0.009
- **Total per document: ~$0.04 (4 cents)**

**Verdict:** Slight cost increase over 2.0 Flash, but stronger reasoning if needed

---

### Option 5: Gemini 2.0 Flash-Lite (Google)

**Context Window:** 1,000,000 tokens
**Pricing:** $0.07 per million input tokens, $0.30 per million output tokens
**Availability:** Generally available

**Analysis:**
- Same 1M context as Gemini 2.0 Flash
- **30% cheaper** than 2.0 Flash ($0.07 vs $0.10 input)
- Lighter-weight model (may have lower accuracy)
- Good for cost optimization if quality is acceptable

**Cost Estimate (220-page document):**
- Input: ~200,000 tokens × $0.07 / 1M = $0.014
- Output: ~15,000 tokens × $0.30 / 1M = $0.0045
- **Total per document: ~$0.019 (1.9 cents)**

**Verdict:** Test if quality is acceptable - could be most cost-effective

---

## Model Comparison Table

| Model | Context Window | Input Cost/1M | Output Cost/1M | Cost per 220p Doc | Availability |
|-------|----------------|---------------|----------------|-------------------|--------------|
| **GPT-5-mini (Current)** | 128K | Unknown | Unknown | Unknown | Current |
| **Gemini 2.0 Flash** | 1M | $0.10 | Minimal | **$0.025** | ✅ Available |
| **Gemini 2.0 Flash-Lite** | 1M | $0.07 | $0.30 | **$0.019** | ✅ Available |
| **Gemini 2.5 Pro** | 1M-2M | $0.15 | $0.60 | **$0.04** | ✅ Available |
| **Claude 3.5 Sonnet** | 200K | $3.00 | $15.00 | **$0.825** | ✅ Available |
| **GPT-4.1** | 1M | $2.00 | $8.00 | **$0.52** | ✅ API Only |
| **GPT-4.1 mini** | 1M | $0.40 | $1.60 | **$0.104** | ✅ Available |

---

## Recommendation: Gemini 2.0 Flash or Flash-Lite

**Primary Choice:** Gemini 2.0 Flash
- 10x context window increase (128K → 1M)
- Cheapest option ($0.025 per 220-page doc)
- Proven medical document performance
- Easy integration via Google AI Studio API

**Alternative:** Gemini 2.0 Flash-Lite
- Test if quality is acceptable
- 24% cheaper than 2.0 Flash ($0.019 vs $0.025)
- Same 1M context window

**Testing Plan:**
1. Test Gemini 2.0 Flash-Lite on 142-page document (baseline comparison)
2. If quality acceptable, test on 220-page document
3. If Flash-Lite fails quality check, upgrade to Gemini 2.0 Flash
4. Compare encounter detection accuracy vs current GPT-5-mini

---

## Chunked Processing Architecture

### Overview

**Concept:** Split large documents into overlapping chunks, process each chunk separately, then merge results.

**When Needed:**
- Documents exceeding AI model context window (even with 1M tokens)
- Cost optimization (process only relevant sections)
- Parallel processing for speed

---

### How Chunked Processing Works

**Step 1: Document Chunking Strategy**

Split 220-page document into chunks:
- **Chunk Size:** 50 pages (safe margin under context limits)
- **Overlap:** 5 pages between chunks (prevents context loss at boundaries)
- **Example for 220 pages:**
  - Chunk 1: Pages 1-50
  - Chunk 2: Pages 46-95 (5-page overlap with Chunk 1)
  - Chunk 3: Pages 91-140 (5-page overlap with Chunk 2)
  - Chunk 4: Pages 136-185 (5-page overlap with Chunk 3)
  - Chunk 5: Pages 181-220 (5-page overlap with Chunk 4)

**Step 2: Process Each Chunk**

For each chunk:
1. Extract OCR text for pages in chunk
2. Run Pass 0.5 encounter discovery
3. Return encounters with page numbers relative to full document
4. Track chunk metadata (chunk_id, page_range, overlap_pages)

**Step 3: Merge Results**

Merge encounters from all chunks:
1. Detect encounters spanning chunk boundaries (overlap region analysis)
2. Merge duplicate encounters (same type, date, provider, overlapping pages)
3. Resolve conflicts (if chunk 1 says pages 48-52 = encounter A, chunk 2 says pages 48-52 = encounter B)
4. Renumber encounter IDs sequentially across full document

---

### Handling Context Loss at Chunk Boundaries

**Problem:** Blood test results spanning pages 49-51 might get split across Chunk 1 (pages 1-50) and Chunk 2 (pages 46-95).

**Solution 1: Overlap Region (5 Pages)**

- Chunk 1 sees pages 46-50 (includes page 49-50 of blood tests)
- Chunk 2 sees pages 46-51 (includes page 49-51 of blood tests)
- Both chunks detect the blood test encounter
- Merge logic identifies duplicate based on:
  - Encounter type match (e.g., `pseudo_lab_report`)
  - Overlapping page ranges (pages 49-51 appear in both)
  - Same date (if extracted)
  - Same facility/provider (if extracted)

**Merge Decision:**
```typescript
// Pseudocode for overlap merge
if (encounter1.pageRanges overlaps encounter2.pageRanges) {
  if (encounter1.type === encounter2.type
      && encounter1.date === encounter2.date
      && encounter1.facility === encounter2.facility) {
    // MERGE: Combine page ranges, keep higher confidence metadata
    merged = {
      pageRanges: union(encounter1.pageRanges, encounter2.pageRanges),
      confidence: max(encounter1.confidence, encounter2.confidence),
      // Use more detailed summary
      summary: longer_of(encounter1.summary, encounter2.summary)
    }
  }
}
```

**Solution 2: Cross-Chunk Context Hints**

Pass metadata from previous chunk to next chunk:
- "Chunk 2, note: Previous chunk detected ongoing encounter at end (pages 48-50, type: lab_report, date: 2025-07-03, facility: NSW Health)"
- AI can use this hint to decide if pages 46-51 continue the same encounter or start a new one

---

### Edge Cases and Risks

**Risk 1: Multi-Encounter Spanning Chunks**

**Scenario:** Hospital admission (pages 1-80) + discharge summary (pages 81-100)

**Problem:** Chunk 1 (pages 1-50) sees partial admission, Chunk 2 (pages 46-95) sees rest of admission + discharge

**Mitigation:**
- Overlap region (pages 46-50) provides continuity
- AI can see "ongoing encounter" context from both chunks
- Merge logic uses date range and provider to unify admission records

**Risk 2: Overlapping Encounters (Multi-Column or Parallel Visits)**

**Scenario:** Page 50 has TWO encounters (left column = GP visit, right column = referral letter)

**Problem:** Both chunks see page 50, both detect 2 encounters, risk of 4x duplication

**Mitigation:**
- Merge logic uses bbox coordinates (if available) to detect spatial separation
- Fallback: Trust chunk with more context (e.g., Chunk 1 sees pages 1-50, Chunk 2 sees pages 46-95 - Chunk 2 has more "after" context for encounter started on page 50)

**Risk 3: Date/Facility Context Loss**

**Scenario:** Blood test date on page 48, results on pages 49-52

**Problem:** Chunk 2 (pages 46-95) sees results but might miss date from page 48

**Mitigation:**
- 5-page overlap ensures page 48 is in Chunk 2
- If date still missed, merge logic uses overlap region to cross-reference
- Fallback: Use file metadata date (already in v2.9 prompt)

---

### Implementation Complexity

**Current Architecture:** Single-pass processing (entire document → Pass 0.5 → result)

**Chunked Architecture Changes Required:**

1. **Document Chunking Module (NEW)**
   - Split document into chunks with overlap
   - Track chunk metadata (chunk_id, page_range, overlap_pages)

2. **Pass 0.5 Modification (MINOR)**
   - Accept chunk page range parameter
   - Adjust page numbering in prompt to match full document
   - Add cross-chunk context hints (optional)

3. **Encounter Merge Module (NEW)**
   - Detect duplicate encounters in overlap region
   - Merge based on type, date, provider, page range overlap
   - Resolve conflicts (keep higher confidence, longer summary)
   - Renumber encounter IDs sequentially

4. **Database Schema Changes (MINOR)**
   - Add `processing_strategy` field to track "single_pass" vs "chunked"
   - Add `chunk_metadata` JSONB for debugging (chunk boundaries, merge decisions)

**Estimated Implementation Time:**
- Chunking module: 2-3 hours
- Pass 0.5 modifications: 1 hour
- Merge module: 4-6 hours (complex logic)
- Testing and validation: 4-6 hours
- **Total: ~12-16 hours**

---

## Comparison: Model Upgrade vs Chunked Processing

| Approach | Pros | Cons |
|----------|------|------|
| **Model Upgrade (Gemini 2.0 Flash)** | ✅ No architecture changes<br>✅ Faster implementation (1-2 hours)<br>✅ Handles 220-page docs<br>✅ Cheaper than current ($0.025/doc)<br>✅ Scales to 500+ pages | ❌ Still has theoretical limit (1M tokens)<br>❌ Very large docs (1000+ pages) need chunking |
| **Chunked Processing** | ✅ Unlimited document size<br>✅ Works with any model<br>✅ Can parallelize chunks for speed | ❌ Complex merge logic<br>❌ Risk of context loss at boundaries<br>❌ 12-16 hours implementation<br>❌ More difficult to debug |

---

## Recommended Strategy

**Phase 1: Model Upgrade (Immediate - 1-2 hours)**
1. Switch Pass 0.5 to Gemini 2.0 Flash (1M context)
2. Test on 142-page baseline document (quality validation)
3. Test on 220-page failed document (context window validation)
4. Deploy to production

**Why Start Here:**
- Solves immediate problem (220-page docs)
- Minimal implementation time
- Cost-effective ($0.025 per doc vs unknown GPT-5-mini cost)
- Provides headroom for 500+ page docs

**Phase 2: Chunked Processing (Future - when needed)**
- Implement only if documents exceed 500+ pages regularly
- Or if cost optimization needed (process only relevant sections)
- Use Phase 1 model as baseline for chunked processing

**Phase 3: Document Size Limits (Immediate - preventative)**
- Frontend validation: Warn users at 200 pages
- Hard limit: Reject uploads >500 pages until chunking implemented
- User-friendly error message: "Documents over 500 pages require additional processing time. Please contact support."

---

## Action Items

**Immediate (Next 2 Hours):**
1. Research Gemini 2.0 Flash API integration (Google AI Studio)
2. Update Pass 0.5 worker code to use Gemini 2.0 Flash
3. Set environment variable: `PASS_05_MODEL=gemini-2.0-flash`
4. Test on 142-page baseline (quality check)
5. Test on 220-page failed document (context window check)

**Short-term (Next Week):**
1. Add frontend page count validation (warn at 200 pages)
2. Monitor Gemini 2.0 Flash costs vs GPT-5-mini
3. Evaluate if Flash-Lite quality is acceptable (cost optimization)

**Long-term (Future):**
1. Implement chunked processing if >500 page documents become common
2. Consider parallel chunk processing for speed optimization
3. Evaluate Gemini 2.5 Pro if reasoning quality issues appear

---

**Last Updated:** November 8, 2025
**Status:** Awaiting decision on model upgrade vs chunked processing approach
