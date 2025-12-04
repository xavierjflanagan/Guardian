# Pass 1 Entity Detection - Documentation Map

**Last Updated:** 2025-12-02
**Status:** OPERATIONAL (Strategy-A implemented, accuracy review in progress)
**Source Code:** `apps/render-worker/src/pass1-v2/` (8 files, ~3,100 lines TypeScript)

---

## Quick Navigation

| If you want to... | Go to... |
|-------------------|----------|
| Understand current Pass 1 implementation | `strategy-a/PASS1-STRATEGY-A-MASTER.md` |
| See known accuracy issues | `strategy-a/13-PASS1-ACCURACY-ANALYSIS-EMMA-THOMPSON.md` |
| Understand parallel processing & retry logic | `strategy-a/12-PARALLEL-PROCESSING-ARCHITECTURE.md` |
| See original design thinking | `pass-1-and-2-strategy-a-design-Xavier-28-11-2025.md` |
| Browse pre-Strategy-A history | `archive-pre-strategy-a/` |

---

## Current State (December 2025)

Pass 1 Strategy-A is **operational on Render.com** but has **accuracy gaps under review**.

### What's Working
- Encounter-centric processing (receives post-reconciled healthcare_encounters)
- OCR-only input (no vision/image tokens)
- Parallel encounter and batch processing
- Retry-until-complete batch failure handling
- Gemini 2.5 Flash Lite model (~$0.003-0.007 per document)

### Known Issues
1. **Hallucination**: AI extracted entity not present in OCR
2. **Inline vitals missed**: Pipe-separated format not recognized
3. **Physical findings**: 0% extraction rate
4. **Review of Systems**: 0% extraction rate
5. **Social history**: 0% extraction rate

See `strategy-a/13-PASS1-ACCURACY-ANALYSIS-EMMA-THOMPSON.md` for full analysis.

---

## Folder Structure

```
pass-1-entity-detection/
|
+-- README.md                                    <-- THIS FILE
+-- pass-1-and-2-strategy-a-design-Xavier-28-11-2025.md  <-- Original design notes
|
+-- strategy-a/                                  <-- CURRENT IMPLEMENTATION
|   +-- PASS1-STRATEGY-A-MASTER.md              <-- Main reference (start here)
|   +-- 00-START-HERE.md                        <-- Navigation guide
|   +-- 01 through 13-*.md                      <-- Design docs, evaluations, analysis
|   +-- OCR-output-*.txt                        <-- Test OCR files
|
+-- archive-pre-strategy-a/                     <-- HISTORICAL (pre Nov 2025)
    +-- PASS-1-OVERVIEW.md                      <-- Old system overview (archived)
    +-- pass1-audits/                           <-- Old database audits
    +-- pass1-enhancements/                     <-- Old enhancement docs
    +-- pass1-hypothesis-tests-results/         <-- Old test results
```

---

## Strategy-A Documents

### Core Reference
| Document | Purpose |
|----------|---------|
| `PASS1-STRATEGY-A-MASTER.md` | Complete design, implementation status, decision log |
| `12-PARALLEL-PROCESSING-ARCHITECTURE.md` | Parallel processing, concurrency, retry logic |
| `13-PASS1-ACCURACY-ANALYSIS-EMMA-THOMPSON.md` | Accuracy review with known issues |

### Prompt & Model Evaluation
| Document | Purpose |
|----------|---------|
| `07-PASS1-PROMPT-V2-SPECIFICATION.md` | V2 prompt design |
| `07b-PASS1-PROMPT-V3-PATIENT-CONTEXT.md` | V3 patient-centric prompt |
| `09-FLASH-LITE-MODEL-EVALUATION.md` | Flash Lite evaluation |
| `10-GEMINI-PRO-MODEL-EVALUATION.md` | Gemini Pro evaluation |
| `11-V3-PROMPT-FLASH-LITE-EVALUATION.md` | V3 + Flash Lite production validation |

### Architecture & Infrastructure
| Document | Purpose |
|----------|---------|
| `03-prompt-caching-deep-dive.md` | Prompt caching mechanics |
| `04-rate-limits-monitoring-retry-strategy.md` | Rate limits and monitoring |
| `05-hierarchical-observability-system.md` | Metrics and audit tables |
| `06-AI-MODEL-SWITCHING-SYSTEM.md` | Model switching architecture |
| `08-POST-AI-ZONE-DERIVATION-SYSTEM.md` | Zone derivation (future) |

---

## Code Location

```
apps/render-worker/src/
|
+-- pass1-v2/                    <-- CURRENT (Strategy-A)
|   +-- Pass1Detector.ts         <-- Main orchestrator
|   +-- pass1-v2-types.ts        <-- Type definitions
|   +-- pass1-v2-prompt.ts       <-- Prompt generation
|   +-- pass1-v2-output-parser.ts
|   +-- pass1-v2-batching.ts     <-- Safe-split batching
|   +-- pass1-v2-database.ts     <-- Database operations
|   +-- pass1-v2-error-handler.ts
|   +-- index.ts
|
+-- shared/
|   +-- types.ts                 <-- AIProcessingJobPayload
|
+-- pass1/                       <-- DELETED (was old implementation)
```

---

## Integration with AI Pipeline

```
Pass 0.5: OCR -> Chunks -> Pending Encounters -> RECONCILIATION -> healthcare_encounters
                                                                          |
                                                            safe_split_points
                                                                          |
                                                                          v
Pass 1:   Receives ONE healthcare_encounter (or batches via safe-splits if large)
          |
          v
          Outputs: pass1_entity_detections
                   pass1_bridge_schema_zones (currently disabled)
          |
          v
Pass 1.5: Medical code shortlisting per entity (not yet implemented)
          |
          v
Pass 2:   Enrichment batched by bridge_schema_zone (not yet implemented)
```

---

## Environment Variables

```bash
# AI Model (Gemini)
GOOGLE_CLOUD_API_KEY=AIzaSy...    # For Gemini Flash Lite

# Feature Flags
PASS1_DISABLE_ZONES=true          # Disable zone extraction (current default)

# Worker
WORKER_CONCURRENCY=3              # Jobs processing simultaneously
```

---

## Next Steps

Pass 1 is paused while we:
1. Document current state (this cleanup)
2. Begin Pass 2 design
3. Return to fix Pass 1 accuracy issues after Pass 2 architecture is clear

See `strategy-a/PASS1-STRATEGY-A-MASTER.md` Phase 6 for accuracy improvement tasks.

---

**Maintained by:** Exora Health Pty Ltd
