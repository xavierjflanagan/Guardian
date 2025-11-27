# V3 Document Processing Pipeline Architecture

**Complete end-to-end flow from file upload to AI output**

**Last Updated:** 2025-11-27
**Version:** 3.0 (Worker V2 Refactoring)

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Complete Data Flow Diagram](#complete-data-flow-diagram)
3. [File-by-File Reference](#file-by-file-reference)
4. [Data Structures](#data-structures)
5. [Storage Locations](#storage-locations)
6. [Integration Points](#integration-points)

---

## High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        GUARDIAN V3 PIPELINE OVERVIEW                          │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐      ┌──────────────┐      ┌────────────────┐      ┌──────────┐
│   WEB APP   │─────▶│ EDGE FUNCTION│─────▶│  SUPABASE      │─────▶│ RENDER   │
│   (Upload)  │      │  (Enqueue)   │      │  JOB QUEUE     │      │ WORKER   │
└─────────────┘      └──────────────┘      └────────────────┘      └──────────┘
                                                                           │
                                                                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         RENDER.COM WORKER PIPELINE                            │
│                                                                               │
│  1. Download File      → Supabase Storage                                    │
│  2. Format Preprocess  → PDF/HEIC/TIFF → JPEG pages                         │
│  3. OCR Processing     → Google Cloud Vision (batched parallel)              │
│  4. OCR Persistence    → Save artifacts to Supabase Storage                  │
│  5. Enhanced OCR Gen   → Create dual coordinate-enriched text formats (v12)  │
│  6. Pass 0.5           → Encounter discovery (AI, uses Y-only format)        │
│  7. Pass 1 (Optional)  → Entity detection (AI) [disabled by default]         │
│  8. Pass 2 (Future)    → Clinical extraction (AI) [not yet implemented]      │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RENDER.COM WORKER PIPELINE                           │
│                         (File: worker.ts)                                 │
└─────────────────────────────────────────────────────────────────────────────┘

         │
         │ STEP 1: Download file from Supabase Storage
         │         Function: processAIJob()
         │         Input: AIProcessingJobPayload { shell_file_id, storage_path, patient_id, ... }
         │         Output: fileBuffer (Buffer)
         │
         ▼
    ┌─────────────────────────────────┐
    │ Format Preprocessing            │
    │ (PDF → JPEG pages)              │
    │                                 │
    │ Function: preprocessForOCR()    │
    │ Module: utils/format-processor  │
    │                                 │
    │ Handles:                        │
    │ - PDF → JPEG conversion         │
    │ - HEIC → JPEG conversion        │
    │ - TIFF → JPEG conversion        │
    │ - Multi-page extraction         │
    │ - Image downscaling (1600px)    │
    │                                 │
    │ Output: PreprocessResult {      │
    │   pages: [{                     │
    │     pageNumber: number,         │
    │     base64: string,             │
    │     mime: 'image/jpeg',         │
    │     width: number,              │
    │     height: number              │
    │   }],                           │
    │   totalPages: number,           │
    │   conversionApplied: boolean    │
    │ }                               │
    └─────────────────────────────────┘
         │
         │ STEP 2: Store processed images (for click-to-source feature)
         │         Function: storeProcessedImages()
         │         Module: utils/storage/store-processed-images
         │         Storage: {patient_id}/{shell_file_id}-processed/page-N.jpg
         │
         ▼
    ┌─────────────────────────────────┐
    │ Processed Image Storage         │
    │                                 │
    │ Output: ProcessedImageMetadata {│
    │   folderPath: string,           │
    │   pages: [{                     │
    │     pageNumber: number,         │
    │     path: string,               │
    │     bytes: number,              │
    │     checksum: string            │
    │   }],                           │
    │   totalBytes: number,           │
    │   combinedChecksum: string      │
    │ }                               │
    └─────────────────────────────────┘
         │
         │ STEP 3: Run batched OCR on all pages
         │         Function: runBatchedOCR()
         │         For each page...
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FILE: utils/ocr-processing.ts                                               │
│ PURPOSE: Google Cloud Vision OCR with spatial sorting and block structure   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  processWithGoogleVisionOCR(base64, mimeType, config, storageContext?)     │
│         │                                                                    │
│         ├── 1. Call Google Vision API (DOCUMENT_TEXT_DETECTION)            │
│         │      Returns: fullTextAnnotation with pages → blocks → paragraphs│
│         │               → words → symbols                                   │
│         │                                                                    │
│         ├── 2. Spatial Sorting (fixes multi-column reading bug)            │
│         │      sortBlocksSpatially(blocks)                                 │
│         │      Algorithm:                                                   │
│         │        - Group blocks into horizontal rows by Y-coordinate       │
│         │        - Sort rows top-to-bottom                                 │
│         │        - Within each row, sort blocks left-to-right              │
│         │      Returns: Sorted blocks in natural reading order             │
│         │                                                                    │
│         ├── 3. Extract Text from Sorted Blocks                             │
│         │      extractTextFromBlocks(sortedBlocks)                         │
│         │      Returns: Spatially sorted text (multi-column safe)          │
│         │                                                                    │
│         ├── 4. Build OCRBlock[] Structure (PHASE 2)                        │
│         │      For each block:                                             │
│         │        - Map GCV blockType (0-5) → BlockType enum               │
│         │          (UNKNOWN/TEXT/TABLE/PICTURE/RULER/BARCODE)              │
│         │        - Preserve full hierarchy: blocks → paragraphs → words   │
│         │        - Store 4-vertex bounding boxes (TL, TR, BR, BL)         │
│         │      Returns: OCRBlock[] with full hierarchy                     │
│         │                                                                    │
│         └── 5. PHASE 4: Store Raw GCV Response (OPTIONAL)                  │
│              storeRawGCV(supabase, patientId, shellFileId, gcvResponse)    │
│              Storage: {patient_id}/{shell_file_id}-ocr/raw-gcv.json       │
│              Enabled: STORE_RAW_GCV=true environment variable              │
│              Lifecycle: Deleted after 30 days via Supabase policy          │
│              Use case: Debugging OCR quality, future metadata extraction   │
│                                                                              │
│  Returns: OCRPageResult {                                                   │
│    page_number: number,                                                     │
│    size: { width_px: number, height_px: number },                          │
│    blocks: OCRBlock[],           ← MAIN DATA STRUCTURE                     │
│    provider: 'google_cloud_vision',                                        │
│    processing_time_ms: number,                                             │
│    original_gcv_text: string,    ← Original unsorted GCV text              │
│    spatially_sorted_text: string, ← Spatially sorted in reading order     │
│    page_dimensions: { width, height }                                      │
│  }                                                                           │
│                                                                              │
│  Types Defined:                                                             │
│  - BlockType: 'UNKNOWN' | 'TEXT' | 'TABLE' | 'PICTURE' | 'RULER' | ...    │
│  - OCRWord: { text, boundingBox: { vertices: [{x,y}] }, confidence }      │
│  - OCRParagraph: { boundingBox, words: OCRWord[] }                         │
│  - OCRBlock: { blockType, boundingBox, confidence, paragraphs[] }          │
│  - OCRPageResult: Complete page OCR result                                 │
│  - OCRResult: { pages: OCRPageResult[] }                                   │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ STEP 4: Collect all OCRPageResult[] into OCRResult
         │         Calculate metrics (confidence, text length, processing time)
         │
         ▼
    ┌─────────────────────────────────┐
    │ OCR Result Assembly             │
    │                                 │
    │ OCRResult {                     │
    │   pages: OCRPageResult[]        │
    │ }                               │
    │                                 │
    │ Metrics calculated:             │
    │ - Average confidence            │
    │ - Total text length             │
    │ - Processing time per page      │
    │ - Memory usage                  │
    └─────────────────────────────────┘
         │
         │ STEP 5: Persist OCR artifacts to Supabase Storage
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FILE: utils/ocr-persistence.ts                                              │
│ PURPOSE: Save/load OCR artifacts from Supabase Storage for reuse            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  persistOCRArtifacts(supabase, shellFileId, patientId, ocrResult,          │
│                      fileChecksum, imageMetadata, correlationId)            │
│         │                                                                    │
│         ├── 1. Upload page artifacts (page-N.json)                         │
│         │      For each page in ocrResult.pages:                           │
│         │        Path: {patient_id}/{shell_file_id}-ocr/page-N.json       │
│         │        Content: OCRPageResult (full page data)                   │
│         │        Includes: blocks[], size, spatially_sorted_text, etc.     │
│         │        Upsert: true (idempotent)                                 │
│         │                                                                    │
│         ├── 2. Build and upload manifest.json                              │
│         │      Path: {patient_id}/{shell_file_id}-ocr/manifest.json       │
│         │      Content: OCRManifest {                                      │
│         │        shell_file_id: string,                                    │
│         │        provider: 'google_vision',                                │
│         │        version: 'v1.2024.11',                                    │
│         │        page_count: number,                                       │
│         │        total_bytes: number,                                      │
│         │        checksum: string,                                         │
│         │        processed_width_px: number,  ← For bbox normalization    │
│         │        processed_height_px: number,                              │
│         │        processed_images_path: string, ← Click-to-source folder  │
│         │        pages: [{                                                 │
│         │          page_number: number,                                    │
│         │          artifact_path: 'page-N.json',                           │
│         │          bytes: number,                                          │
│         │          width_px: number,                                       │
│         │          height_px: number,                                      │
│         │          processed_image_path: string,                           │
│         │          processed_image_bytes: number,                          │
│         │          processed_image_checksum: string                        │
│         │        }],                                                        │
│         │        created_at: ISO timestamp                                 │
│         │      }                                                            │
│         │                                                                    │
│         └── 3. Upsert database index (ocr_artifacts table)                │
│              INSERT/UPDATE ocr_artifacts {                                 │
│                shell_file_id,                                              │
│                manifest_path,                                              │
│                provider: 'google_vision',                                  │
│                artifact_version: 'v1.2024.11',                             │
│                file_checksum,                                              │
│                checksum (manifest),                                        │
│                pages,                                                       │
│                bytes,                                                       │
│                updated_at                                                   │
│              }                                                              │
│              ON CONFLICT (shell_file_id) DO UPDATE                         │
│                                                                              │
│  loadOCRArtifacts(supabase, shellFileId, correlationId)                    │
│         │                                                                    │
│         ├── 1. Check ocr_artifacts table for existing artifacts           │
│         ├── 2. Download manifest.json from storage                         │
│         ├── 3. Download all page-N.json files                             │
│         └── 4. Reconstruct OCRResult { pages: [] }                         │
│                                                                              │
│  DUAL ENHANCED OCR FORMATS (v12):                                          │
│                                                                              │
│  storeEnhancedOCR_Y(supabase, patientId, shellFileId, enhancedOCRText)    │
│         │                                                                    │
│         └── Upload Y-only enhanced OCR format (for Pass 0.5)              │
│             Path: {patient_id}/{shell_file_id}-ocr/enhanced-ocr-y.txt     │
│             Content: [Y:240] text text text (no X-coordinates)             │
│             Token usage: ~900 tokens/page (71% reduction)                  │
│             Use case: Pass 0.5 encounter boundary positioning              │
│                                                                              │
│  storeEnhancedOCR_XY(supabase, patientId, shellFileId, enhancedOCRText)   │
│         │                                                                    │
│         └── Upload XY enhanced OCR format (for Pass 1/2)                  │
│             Path: {patient_id}/{shell_file_id}-ocr/enhanced-ocr-xy.txt    │
│             Content: [Y:240] text (x:20) | text (x:120) | ...             │
│             Token usage: ~5000 tokens/page                                 │
│             Use case: Pass 1/2 clinical entity bounding boxes              │
│                                                                              │
│  loadEnhancedOCR_Y(supabase, patientId, shellFileId)                      │
│         │                                                                    │
│         └── Download Y-only format (with fallback to legacy)              │
│             Fallback: enhanced-ocr.txt if enhanced-ocr-y.txt not found    │
│             Returns: Enhanced OCR text or null if not found                │
│                                                                              │
│  loadEnhancedOCR_XY(supabase, patientId, shellFileId)                     │
│         │                                                                    │
│         └── Download XY format (with fallback to legacy)                  │
│             Fallback: enhanced-ocr.txt if enhanced-ocr-xy.txt not found   │
│             Returns: Enhanced OCR text or null if not found                │
│                                                                              │
│  LEGACY (backward compatibility):                                          │
│  storeEnhancedOCR() / loadEnhancedOCR() - Original single format          │
│                                                                              │
│  storeRawGCV(supabase, patientId, shellFileId, gcvResponse) [PHASE 4]     │
│         │                                                                    │
│         └── Upload raw Google Cloud Vision response                        │
│             Path: {patient_id}/{shell_file_id}-ocr/raw-gcv.json           │
│             Content: Complete GCV API response (large: 2-5MB/page)         │
│             Lifecycle: Deleted after 30 days via Supabase policy           │
│             Use case: Debugging, future metadata extraction                │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ STEP 6: Write OCR metrics to database
         │         Function: writeOCRMetrics()
         │         Table: ocr_processing_metrics
         │
         ▼
    ┌─────────────────────────────────┐
    │ Database: ocr_processing_metrics│
    │                                 │
    │ INSERT {                        │
    │   shell_file_id,                │
    │   correlation_id,               │
    │   total_pages,                  │
    │   processing_time_ms,           │
    │   average_confidence,           │
    │   total_text_length,            │
    │   peak_memory_mb,               │
    │   batch_times_ms[],             │
    │   ocr_provider,                 │
    │   environment,                  │
    │   ...                           │
    │ }                               │
    └─────────────────────────────────┘
         │
         │ STEP 7: Generate dual enhanced OCR formats (v12)
         │         Function: storeEnhancedOCRFormat()
         │         For each page, generate BOTH Y-only and XY formats
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FILE: pass05/progressive/ocr-formatter.ts                                   │
│ PURPOSE: Generate DUAL enhanced OCR formats with inline coordinates (v12)   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TWO FORMAT VARIANTS (v12):                                                 │
│                                                                              │
│  1. generateEnhancedOcrFormatYOnly(page, config?) - For Pass 0.5           │
│     Output: [Y:240] text text text (no X-coordinates)                       │
│     Token usage: ~900 tokens/page (71% reduction vs XY)                    │
│     Use case: Pass 0.5 only needs Y for encounter boundary positioning     │
│                                                                              │
│  2. generateEnhancedOcrFormat(page, config?) - For Pass 1/2                │
│     Output: [Y:240] text (x:20) | text (x:120) | ...                       │
│     Token usage: ~5000 tokens/page                                         │
│     Use case: Pass 1/2 need X for clinical entity bounding boxes           │
│                                                                              │
│  SHARED ALGORITHM:                                                          │
│         │                                                                    │
│         ├── 1. Extract words with coordinates                              │
│         │      extractWordsWithCoordinates(page)                           │
│         │      Returns: EnhancedWord[] { text, x, y }                      │
│         │                                                                    │
│         ├── 2. Group words by Y-coordinate into lines                      │
│         │      groupWordsByLine(words, yTolerance=10)                      │
│         │      Returns: Map<Y-coord, EnhancedWord[]>                       │
│         │                                                                    │
│         ├── 3. Sort lines top-to-bottom by Y-coordinate                    │
│         │                                                                    │
│         └── 4. Format each line (differs by variant):                      │
│                Y-only: "[Y:240] text text text"                            │
│                XY:     "[Y:240] text (x:20) | text (x:120) | ..."         │
│                                                                              │
│  Example Output (Y-only for Pass 0.5):                                     │
│           [Y:240] S T-BIL 16 14 7                                          │
│           [Y:270] S ALP 62 66 75                                           │
│                                                                              │
│  Example Output (XY for Pass 1/2):                                         │
│           [Y:240] S T-BIL (x:20) | 16 (x:120) | 14 (x:220) | 7 (x:320)    │
│           [Y:270] S ALP (x:20) | 62 (x:120) | 66 (x:220) | 75 (x:320)     │
│                                                                              │
│  Why Dual Formats?                                                          │
│  - Pass 0.5 only needs Y-coordinates (71% token savings)                   │
│  - Pass 1/2 need X-coordinates for table structure and bounding boxes      │
│  - 142-page document: 208K tokens (Y-only) vs 721K tokens (XY)            │
│                                                                              │
│  Backward Compatibility:                                                    │
│  - Falls back to legacy enhanced-ocr.txt if new formats not found          │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ STEP 8: Save dual enhanced OCR formats to Supabase Storage
         │         storeEnhancedOCR_Y() and storeEnhancedOCR_XY() called
         │
         ▼
    ┌─────────────────────────────────┐
    │ Storage: DUAL FORMATS (v12)     │
    │                                 │
    │ 1. enhanced-ocr-y.txt           │
    │    (Y-only for Pass 0.5)        │
    │    --- PAGE 1 START ---         │
    │    [Y:240] text text text       │
    │    [Y:270] text text text       │
    │    --- PAGE 1 END ---           │
    │    ~900 tokens/page             │
    │                                 │
    │ 2. enhanced-ocr-xy.txt          │
    │    (XY for Pass 1/2)            │
    │    --- PAGE 1 START ---         │
    │    [Y:240] text (x:20) | ...    │
    │    [Y:270] text (x:20) | ...    │
    │    --- PAGE 1 END ---           │
    │    ~5000 tokens/page            │
    │                                 │
    │ 3. enhanced-ocr.txt (legacy)    │
    │    Backward compatibility       │
    │                                 │
    │ Reused by:                      │
    │ - Pass 0.5: Y-only format       │
    │ - Pass 1/2: XY format           │
    └─────────────────────────────────┘
         │
         │ STEP 9: Run Pass 0.5 (Encounter Discovery)
         │         Function: runPass05()
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PASS 0.5: ENCOUNTER DISCOVERY                                               │
│ FILE: pass05/index.ts (runPass05)                                          │
│ PURPOSE: Discover healthcare encounters in medical documents                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input: Pass05Input {                                                       │
│    shellFileId,                                                             │
│    patientId,                                                               │
│    ocrOutput: {                                                             │
│      fullTextAnnotation: {                                                  │
│        text: Enhanced OCR text (with page markers),                         │
│        pages: [{                                                            │
│          page_number,                                                       │
│          width, height,                                                     │
│          confidence,                                                        │
│          spatially_sorted_text,                                             │
│          original_gcv_text,                                                 │
│          blocks: OCRBlock[]  ← For post-AI coordinate lookup               │
│        }]                                                                    │
│      }                                                                       │
│    },                                                                        │
│    pageCount,                                                               │
│    processingSessionId                                                      │
│  }                                                                           │
│                                                                              │
│  Processing:                                                                │
│  ├── 1. Load Y-only enhanced OCR format (v12)                              │
│  │      session-manager.ts: loadEnhancedOCR_Y() (71% token savings)        │
│  │                                                                           │
│  ├── 2. Send enhanced OCR to AI (GPT-4o-mini)                              │
│  │      Prompt: Detect healthcare encounters                               │
│  │      Response: { encounters: [...], reasoning: "..." }                  │
│  │                                                                           │
│  ├── 3. Parse AI response                                                  │
│  │      Extract encounter metadata (dates, providers, document types)      │
│  │                                                                           │
│  ├── 4. Post-AI Coordinate Enrichment                                      │
│  │      chunk-processor.ts: findActualTextHeight()                         │
│  │      For each marker returned by AI:                                    │
│  │        - Search page.blocks for marker text                             │
│  │        - Extract actual bounding box from word vertices                 │
│  │        - Calculate pixel height: bottomLeftY - topLeftY                 │
│  │      Returns: Actual coordinates for UI highlighting                    │
│  │                                                                           │
│  └── 5. Write to database                                                  │
│       - healthcare_encounters table                                         │
│       - Update ai_processing_sessions                                       │
│                                                                              │
│  Output: Pass05Result {                                                     │
│    success: boolean,                                                        │
│    manifest: { encounters: [...] },                                        │
│    processingTimeMs,                                                        │
│    aiCostUsd,                                                               │
│    aiModel: 'gpt-4o-mini'                                                  │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FILE: pass05/progressive/chunk-processor.ts                                 │
│ PURPOSE: Post-AI coordinate enrichment for UI highlighting                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  findActualTextHeight(pages: OCRPage[], pageIndex, targetY, markerText)   │
│         │                                                                    │
│         ├── 1. Get page and validate blocks structure                      │
│         │      if (!page || !page.blocks) return null                      │
│         │                                                                    │
│         ├── 2. Normalize marker text                                       │
│         │      markerText.toLowerCase().trim()                             │
│         │                                                                    │
│         ├── 3. Search blocks hierarchy for marker                          │
│         │      for block in page.blocks:                                   │
│         │        for paragraph in block.paragraphs:                        │
│         │          for word in paragraph.words:                            │
│         │            - Check if word.text matches marker                   │
│         │            - Check if Y-coordinate matches targetY (±5px)        │
│         │            - Extract vertices[0] (TL) and vertices[3] (BL)      │
│         │            - Calculate height: BL.y - TL.y                       │
│         │            - Return actual pixel height                          │
│         │                                                                    │
│         ├── 4. Fallback: Fuzzy search by Y-coordinate only                │
│         │      If exact match not found:                                   │
│         │        - Search for any word at targetY (±10px tolerance)        │
│         │        - Return height from nearest word                         │
│         │                                                                    │
│         └── 5. Return null if not found                                    │
│                                                                              │
│  Why This Matters:                                                          │
│  - AI returns marker text with estimated Y-coordinate: [Y:240] TEXT       │
│  - This function finds the ACTUAL bounding box in page-N.json             │
│  - Enables pixel-perfect UI highlighting of AI-detected entities          │
│  - Critical for click-to-source feature                                    │
│                                                                              │
│  Data Source:                                                               │
│  - Uses page.blocks[] structure from OCR processing                        │
│  - DOES NOT use legacy lines[] array                                       │
│  - Requires full 4-vertex bounding boxes (Phase 3)                         │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ STEP 10: Optionally run Pass 1 (Entity Detection)
         │          if (config.passes.pass1Enabled) { ... }
         │          Default: DISABLED (set ENABLE_PASS1=true to enable)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PASS 1: ENTITY DETECTION (OPTIONAL)                                         │
│ FILE: pass1/index.ts (Pass1EntityDetector)                                 │
│ PURPOSE: Detect and classify all entities in medical documents              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Status: READY but DISABLED by default (for Pass 0.5 testing)              │
│  Enable: Set environment variable ENABLE_PASS1=true                         │
│                                                                              │
│  Input: Pass1Input {                                                        │
│    shell_file_id,                                                           │
│    patient_id,                                                              │
│    processing_session_id,                                                   │
│    raw_file: {                                                              │
│      file_data: base64 (first processed JPEG page),                         │
│      file_type: 'image/jpeg',                                               │
│      filename, file_size                                                    │
│    },                                                                        │
│    ocr_spatial_data: {                                                      │
│      extracted_text,                                                        │
│      spatial_mapping: [{ text, page_number, bounding_box, ... }],          │
│      ocr_confidence,                                                        │
│      ocr_provider                                                           │
│    },                                                                        │
│    document_metadata: { filename, file_type, page_count, ... }             │
│  }                                                                           │
│                                                                              │
│  Processing:                                                                │
│  ├── Send to GPT-4o Vision with OCR text                                   │
│  ├── Extract entities by category:                                         │
│  │   - Clinical events (diagnoses, procedures, medications)                │
│  │   - Healthcare context (providers, facilities, dates)                   │
│  │   - Document structure (headers, sections)                              │
│  └── Write to 7 database tables:                                           │
│      1. ai_processing_sessions (upsert)                                    │
│      2. entity_processing_audit (bulk insert)                              │
│      3. shell_files (update)                                               │
│      4. profile_classification_audit                                       │
│      5. pass1_entity_metrics                                               │
│      6. ai_confidence_scoring (optional)                                   │
│      7. manual_review_queue (optional)                                     │
│                                                                              │
│  Output: Pass1Result {                                                      │
│    success: boolean,                                                        │
│    total_entities_detected,                                                │
│    entities_by_category: { clinical_event, healthcare_context, ... },     │
│    records_created: { entity_audit, confidence_scoring, ... }              │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ STEP 11: Return job result
         │          completeJob(jobId, result)
         │
         ▼
    ┌─────────────────────────────────┐
    │ Job Completion                  │
    │                                 │
    │ RPC: complete_job()             │
    │ Update: job_queue.status        │
    │ Result: {                       │
    │   success: true,                │
    │   shell_file_id,                │
    │   pass_05_result,               │
    │   pass_1_result (optional),     │
    │   message                       │
    │ }                               │
    └─────────────────────────────────┘
         │
         │ STEP 12: Memory cleanup
         │          cleanupJobMemory(jobId)
         │          Force GC if available
         │
         ▼
    ┌─────────────────────────────────┐
    │ Job Complete                    │
    │                                 │
    │ Status: completed               │
    │ shell_files.status updated      │
    │ Data available in database      │
    │ Files available in storage      │
    └─────────────────────────────────┘
```

---

## File-by-File Reference

### Core Worker Files

#### 1. **worker.ts** (Main Orchestrator)
- **Lines:** 1,450
- **Purpose:** Main worker process that orchestrates entire pipeline
- **Key Functions:**
  - `start()` - Start worker with job polling loop
  - `pollForJobs()` - Claim jobs from queue
  - `processJob()` - Route to appropriate processor
  - `processAIJob()` - Main document processing pipeline
  - `runOCRProcessing()` - OCR pipeline orchestration
  - `runBatchedOCR()` - Batched parallel OCR processing
  - `runPass05()` - Pass 0.5 encounter discovery
  - `runPass1()` - Pass 1 entity detection (optional)
  - `cleanupJobMemory()` - Force garbage collection
- **Configuration:**
  - `config.passes.pass05Enabled` - Always true
  - `config.passes.pass1Enabled` - Controlled by `ENABLE_PASS1` env var
  - `config.ocr.storeRawGCV` - Controlled by `STORE_RAW_GCV` env var
- **Entry Point:** Express server starts worker on port 10000 (health check)

---

### OCR Processing Module

#### 2. **utils/ocr-processing.ts** (OCR Utilities)
- **Lines:** 355
- **Purpose:** Google Cloud Vision OCR with spatial sorting
- **Exports:**
  - `processWithGoogleVisionOCR()` - Main OCR function
  - `sortBlocksSpatially()` - Fix multi-column reading order
  - `extractTextFromBlocks()` - Extract spatially sorted text
  - Types: `OCRBlock`, `OCRWord`, `OCRParagraph`, `OCRPageResult`, etc.
- **Key Features:**
  - Spatial sorting algorithm (top→bottom, left→right)
  - Block type preservation (TEXT/TABLE/PICTURE/RULER/BARCODE)
  - Full 4-vertex bounding boxes (Phase 3)
  - Optional raw GCV storage (Phase 4)
- **Integration:** Called by worker.ts during batched OCR processing

---

### OCR Storage Module

#### 3. **utils/ocr-persistence.ts** (Storage Layer)
- **Lines:** ~550
- **Purpose:** Save/load OCR artifacts from Supabase Storage
- **Exports:**
  - `persistOCRArtifacts()` - Save page-N.json + manifest.json
  - `loadOCRArtifacts()` - Load cached OCR results
  - `storeEnhancedOCR_Y()` - Save Y-only format (v12, for Pass 0.5)
  - `loadEnhancedOCR_Y()` - Load Y-only format (with legacy fallback)
  - `storeEnhancedOCR_XY()` - Save XY format (v12, for Pass 1/2)
  - `loadEnhancedOCR_XY()` - Load XY format (with legacy fallback)
  - `storeEnhancedOCR()` - Save legacy format (backward compat)
  - `loadEnhancedOCR()` - Load legacy format
  - `storeRawGCV()` - Save raw-gcv.json (Phase 4, optional)
- **Storage Paths:**
  - `{patient_id}/{shell_file_id}-ocr/page-N.json`
  - `{patient_id}/{shell_file_id}-ocr/manifest.json`
  - `{patient_id}/{shell_file_id}-ocr/enhanced-ocr-y.txt` (v12, Y-only)
  - `{patient_id}/{shell_file_id}-ocr/enhanced-ocr-xy.txt` (v12, XY)
  - `{patient_id}/{shell_file_id}-ocr/enhanced-ocr.txt` (legacy)
  - `{patient_id}/{shell_file_id}-ocr/raw-gcv.json` (optional)
- **Database:** Indexes in `ocr_artifacts` table
- **Integration:** Called by worker.ts after OCR completion

---

### Enhanced OCR Generation Module

#### 4. **pass05/progressive/ocr-formatter.ts** (Enhanced OCR Generator)
- **Lines:** ~310
- **Purpose:** Generate DUAL enhanced OCR formats with inline coordinates (v12)
- **Exports:**
  - `generateEnhancedOcrFormatYOnly()` - Y-only format for Pass 0.5 (~900 tokens/page)
  - `generateEnhancedOcrFormat()` - XY format for Pass 1/2 (~5000 tokens/page)
  - `hasStructuredOcrData()` - Check for blocks structure
  - `generateEnhancedOcrFromSortedText()` - Fallback for degraded data
- **Output Formats:**
  - Y-only: `[Y:240] text text text` (no X-coordinates)
  - XY: `[Y:240] text (x:20) | text (x:120) | ...`
- **Algorithm:**
  1. Extract words with coordinates from `page.blocks`
  2. Group words by Y-coordinate (±10px tolerance)
  3. Sort lines top-to-bottom
  4. Format each line (Y-only or XY depending on function)
- **Token Savings:** Y-only format provides 71% reduction (208K vs 721K for 142-page doc)
- **Backward Compatibility:** Falls back to legacy `lines[]` array if `blocks` not available
- **Integration:** Called by worker.ts (both formats) and Pass 0.5 session manager (Y-only)

---

### Post-AI Coordinate Enrichment Module

#### 5. **pass05/progressive/chunk-processor.ts** (Coordinate Lookup)
- **Lines:** ~700
- **Purpose:** Convert AI marker text to actual pixel coordinates
- **Key Function:**
  - `findActualTextHeight(pages, pageIndex, targetY, markerText)` - Lines 608-684
- **Algorithm:**
  1. Search `page.blocks` hierarchy for marker text
  2. Match by text content AND Y-coordinate (±5px tolerance)
  3. Extract vertices[0] (top-left) and vertices[3] (bottom-left)
  4. Calculate actual height: `bottomLeftY - topLeftY`
  5. Fallback: Fuzzy search by Y-coordinate only (±10px)
- **Use Case:** Enables pixel-perfect UI highlighting of AI-detected entities
- **Data Source:** Uses `page.blocks[]` structure (NOT legacy `lines[]`)
- **Integration:** Called by Pass 0.5 after AI processing

---

### Content Analysis Module (Infrastructure Ready)

#### 6. **utils/page-analyzer.ts** (Page Content Analysis)
- **Lines:** ~200
- **Purpose:** Analyze page content for future vision routing
- **Status:** Infrastructure ready, not yet integrated into pipeline
- **Exports:**
  - `analyzePageContent(page)` - Analyze block type distribution
  - `shouldRouteToVision(page)` - Determine if vision AI needed
- **Use Case (Future):**
  - Pass 1/2 route TABLE/PICTURE blocks to vision models
  - Pass 1/2 route TEXT blocks to text-only models
  - Content-based batching for cost optimization
- **Integration:** Will be called by Pass 1/2 when vision routing implemented

---

## Data Structures

### OCR Data Structures (Primary)

```typescript
// Full OCR result (multi-page document)
interface OCRResult {
  pages: OCRPageResult[];
}

// Single page OCR result
interface OCRPageResult {
  page_number: number;
  size: { width_px: number; height_px: number };
  blocks: OCRBlock[];                    // ← MAIN STRUCTURE
  provider: 'google_cloud_vision';
  processing_time_ms: number;
  original_gcv_text: string;            // Unsorted GCV text
  spatially_sorted_text: string;        // Sorted in reading order
  page_dimensions?: { width: number; height: number };
}

// Block with type metadata (Phase 2)
interface OCRBlock {
  blockType: BlockType;  // 'TEXT' | 'TABLE' | 'PICTURE' | 'RULER' | 'BARCODE'
  confidence: number;
  boundingBox: {
    vertices: Array<{ x: number; y: number }>;  // 4 vertices: TL, TR, BR, BL
  };
  paragraphs: OCRParagraph[];
}

// Paragraph within block
interface OCRParagraph {
  boundingBox: {
    vertices: Array<{ x: number; y: number }>;
  };
  words: OCRWord[];
}

// Word with full bounding box (Phase 3)
interface OCRWord {
  text: string;
  boundingBox: {
    vertices: Array<{ x: number; y: number }>;  // 4 vertices: TL, TR, BR, BL
  };
  confidence: number;
}
```

### Enhanced OCR Format (v12 - Dual Formats)

```typescript
// TWO FORMAT VARIANTS (v12):

// 1. Y-ONLY FORMAT (for Pass 0.5)
// Stored in: {patient_id}/{shell_file_id}-ocr/enhanced-ocr-y.txt
// Token usage: ~900 tokens/page (71% reduction)

--- PAGE 1 START ---
[Y:240] S T-BIL 16 14 7
[Y:270] S ALP 62 66 75
[Y:300] HAEMOGLOBIN 120 g/L
--- PAGE 1 END ---

// 2. XY FORMAT (for Pass 1/2)
// Stored in: {patient_id}/{shell_file_id}-ocr/enhanced-ocr-xy.txt
// Token usage: ~5000 tokens/page

--- PAGE 1 START ---
[Y:240] S T-BIL (x:20) | 16 (x:120) | 14 (x:220) | 7 (x:320)
[Y:270] S ALP (x:20) | 62 (x:120) | 66 (x:220) | 75 (x:320)
[Y:300] HAEMOGLOBIN (x:20) | 120 (x:150) | g/L (x:200)
--- PAGE 1 END ---

// Why dual formats?
// - Pass 0.5 only needs Y-coordinates for encounter boundary positioning
// - Pass 1/2 need X-coordinates for clinical entity bounding boxes
// - 142-page document savings: 512K tokens ($0.17 per document)
```

### Storage Manifest (Phase 1)

```typescript
// Stored in: {patient_id}/{shell_file_id}-ocr/manifest.json

interface OCRManifest {
  shell_file_id: string;
  provider: 'google_vision';
  version: 'v1.2024.11';
  page_count: number;
  total_bytes: number;
  checksum: string;  // SHA-256 of OCR result

  // CRITICAL: Processed dimensions for bbox normalization
  processed_width_px: number;   // Actual width used for OCR
  processed_height_px: number;  // Actual height used for OCR

  // Processing metadata
  processing_metadata: {
    downscaling_applied: boolean;
    original_dimensions_available: boolean;
    normalization_valid: boolean;
  };

  // Click-to-source feature
  processed_images_path: string;  // Folder path for JPEG images

  // Per-page artifacts
  pages: Array<{
    page_number: number;
    artifact_path: string;        // 'page-N.json'
    bytes: number;
    width_px: number;
    height_px: number;

    // Click-to-source metadata
    processed_image_path: string;
    processed_image_bytes: number;
    processed_image_checksum: string;
  }>;

  created_at: string;  // ISO timestamp
}
```

---

## Storage Locations

### Supabase Storage Bucket: `medical-docs`

```
medical-docs/
├── {patient_id}/
│   ├── {shell_file_id}                    ← Original uploaded file
│   │
│   ├── {shell_file_id}-processed/         ← Processed JPEG pages (click-to-source)
│   │   ├── page-1.jpg
│   │   ├── page-2.jpg
│   │   └── page-N.jpg
│   │
│   └── {shell_file_id}-ocr/               ← OCR artifacts
│       ├── page-1.json                    ← Full OCR data for page 1
│       ├── page-2.json                    ← Full OCR data for page 2
│       ├── page-N.json                    ← Full OCR data for page N
│       ├── manifest.json                  ← Metadata for all pages
│       ├── enhanced-ocr-y.txt             ← v12: Y-only format for Pass 0.5
│       ├── enhanced-ocr-xy.txt            ← v12: XY format for Pass 1/2
│       ├── enhanced-ocr.txt               ← Legacy format (backward compat)
│       └── raw-gcv.json                   ← PHASE 4: Raw GCV response (optional, 30-day lifecycle)
```

### Database Tables

```sql
-- OCR artifact index (fast lookup)
ocr_artifacts
  - shell_file_id (PK)
  - manifest_path
  - provider
  - artifact_version
  - file_checksum
  - checksum (manifest)
  - pages
  - bytes
  - updated_at

-- OCR processing metrics (analytics)
ocr_processing_metrics
  - shell_file_id
  - correlation_id
  - total_pages
  - processing_time_ms
  - average_confidence
  - total_text_length
  - peak_memory_mb
  - batch_times_ms[]
  - ocr_provider
  - environment
  - ...

-- Job queue (worker coordination)
job_queue
  - id (PK)
  - job_type ('ai_processing')
  - job_payload (JSONB)
  - status ('pending' | 'processing' | 'completed' | 'failed')
  - worker_id
  - created_at
  - started_at
  - completed_at
  - ...
```

---

## Integration Points

### 1. **Web App → Edge Function → Job Queue**

```typescript
// apps/web: User uploads file
await supabase.storage
  .from('medical-docs')
  .upload(`${patientId}/${shellFileId}`, file);

// Edge Function: shell-file-processor-v3
await supabase.rpc('enqueue_job_v3', {
  p_job_type: 'ai_processing',
  p_job_lane: 'ai_queue_simple',
  p_job_payload: {
    shell_file_id: shellFileId,
    patient_id: patientId,
    storage_path: `${patientId}/${shellFileId}`,
    file_size_bytes: file.size,
    mime_type: file.type,
    uploaded_filename: file.name,
    correlation_id: crypto.randomUUID()
  }
});
```

### 2. **Worker → Supabase Storage**

```typescript
// Download file
const { data } = await supabase.storage
  .from('medical-docs')
  .download(`${patientId}/${shellFileId}`);

// Upload OCR artifacts
await supabase.storage
  .from('medical-docs')
  .upload(`${patientId}/${shellFileId}-ocr/page-1.json`, pageData);
```

### 3. **Worker → Google Cloud Vision API**

```typescript
// Call GCV API
const response = await fetch(
  `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: base64Data },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
      }]
    })
  }
);
```

### 4. **Worker → OpenAI API (Pass 0.5 & Pass 1)**

```typescript
// Pass 0.5: Encounter discovery
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{
    role: 'user',
    content: enhancedOCRText  // Uses enhanced-ocr.txt format
  }],
  response_format: { type: 'json_object' }
});

// Pass 1: Entity detection (with vision)
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{
    role: 'user',
    content: [
      { type: 'image_url', url: { url: `data:image/jpeg;base64,${base64}` } },
      { type: 'text', text: ocrText }
    ]
  }]
});
```

### 5. **Pass 0.5 → Coordinate Enrichment**

```typescript
// AI returns: [Y:240] DISCHARGE SUMMARY
// Need actual bounding box for UI highlighting

const height = findActualTextHeight(
  pages,              // OCRPage[] with blocks structure
  pageIndex,          // Which page (0-based)
  240,                // Target Y-coordinate from AI
  'DISCHARGE SUMMARY' // Marker text to find
);

// Returns: 18 (actual pixel height from vertices)
// UI can now highlight: { x: ?, y: 240, w: ?, h: 18 }
```

---

## Environment Variables

### Required

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Google Cloud Vision
GOOGLE_CLOUD_API_KEY=AIzaSyC...

# OpenAI (for Pass 0.5 and Pass 1)
OPENAI_API_KEY=sk-proj-...
```

### Optional

```bash
# Worker configuration
WORKER_CONCURRENCY=3           # Max concurrent jobs
POLL_INTERVAL_MS=5000         # Job polling interval
HEALTH_CHECK_PORT=10000       # Health check server port

# OCR configuration
OCR_BATCH_SIZE=10             # Pages per batch
OCR_TIMEOUT_MS=30000          # Timeout per page
MEMORY_LIMIT_MB=1800          # Safety threshold for 2GB plan

# Pass control
ENABLE_PASS1=false            # Enable Pass 1 entity detection (default: false)
STORE_RAW_GCV=false           # Enable raw GCV storage (default: false)

# Environment
NODE_ENV=production
APP_ENV=production
LOG_LEVEL=info
VERBOSE=false
```

---

## Performance Characteristics

### OCR Processing

- **Batch size:** 10 pages (configurable)
- **Processing time:** ~3-5 seconds per page (Google Vision API latency)
- **Memory usage:** ~70-85MB per large file (freed after job via GC)
- **Cost:** ~$0.015-0.03 per document (85-90% cheaper than AWS Textract)

### Storage

- **page-N.json:** ~50-100KB per page (with full blocks structure)
- **enhanced-ocr-y.txt:** ~1-2KB per page (Y-only, for Pass 0.5)
- **enhanced-ocr-xy.txt:** ~5-10KB per page (XY, for Pass 1/2)
- **enhanced-ocr.txt:** ~5-10KB per page (legacy, backward compat)
- **raw-gcv.json:** ~2-5MB per page (optional, deleted after 30 days)
- **processed images:** ~200-500KB per page (JPEG)

### Database

- **ocr_artifacts:** 1 row per document (index)
- **ocr_processing_metrics:** 1 row per document (analytics)
- **job_queue:** 1 row per job (processed then completed)

---

## Error Handling

### OCR Processing Failures

```typescript
// If ANY page fails OCR, entire job fails
// Retry logic: 3 attempts with exponential backoff
// Timeout: 30 seconds per page

if (failedPages.length > 0) {
  throw new Error(
    `Batch ${batchNumber} failed: ${failedPages.length}/${batch.length} pages failed`
  );
}
```

### Memory Safety

```typescript
// Abort if approaching memory limit
const rssMB = Math.round(memBefore.rss / 1024 / 1024);
if (rssMB > config.memory.limitMB) {
  throw new Error(
    `Memory limit approaching (${rssMB} MB / ${config.memory.limitMB} MB threshold)`
  );
}
```

### Storage Failures

```typescript
// Retry logic for Supabase Storage operations
// - 3 attempts
// - Exponential backoff: 2s, 4s, 8s
// - Respects Retry-After header

const result = await retryStorageUpload(async () => {
  return await supabase.storage
    .from('medical-docs')
    .upload(path, data, { upsert: true });
});
```

---

## Monitoring & Observability

### Structured Logging

```typescript
// All operations logged with correlation_id
this.logger.info('OCR processing session started', {
  shell_file_id,
  correlation_id,
  total_pages,
  batch_size,
  ocr_provider: 'google_vision',
  timestamp: new Date().toISOString()
});
```

### Metrics Collection

```typescript
// Written to ocr_processing_metrics table
{
  shell_file_id,
  correlation_id,
  total_pages,
  processing_time_ms,
  average_batch_time_ms,
  average_page_time_ms,
  provider_avg_latency_ms,
  average_confidence,
  total_text_length,
  peak_memory_mb,
  batch_times_ms: [1200, 1150, 1300], // Per-batch timing
  ocr_provider: 'google_vision',
  environment: 'production'
}
```

### Health Check

```bash
# Render.com health check endpoint
GET http://localhost:10000/health

{
  "status": "healthy",
  "worker_id": "render-srv-xxx-1732724800000",
  "active_jobs": 2,
  "timestamp": "2025-11-27T12:00:00.000Z"
}
```

---

## Future Enhancements

### Pass 2: Clinical Extraction (Not Yet Implemented)

```typescript
// Placeholder function exists in worker.ts
private async runPass2(
  payload: AIProcessingJobPayload,
  ocrResult: OCRResult,
  processingSessionId: string
): Promise<any> {
  throw new Error('Pass 2 clinical extraction not yet implemented');
}

// Implementation plan:
// 1. Load Pass 1 entity results
// 2. Extract clinical data (diagnoses, medications, procedures, etc.)
// 3. Write to Pass 2 database tables
// 4. Update shell_files.status to 'pass2_complete'
```

### Vision Model Routing (Infrastructure Ready)

```typescript
// utils/page-analyzer.ts is ready, not yet integrated
const analysis = analyzePageContent(page);

if (analysis.hasComplexTables || analysis.hasImages) {
  // Route to GPT-4o Vision (expensive)
  await processWithVisionModel(page);
} else {
  // Route to GPT-4o-mini Text-only (cheap)
  await processWithTextModel(page);
}
```

---

## Glossary

| Term | Definition |
|------|------------|
| **Block** | Structural unit from GCV with type metadata (TEXT/TABLE/PICTURE/etc.) |
| **Bounding Box** | Rectangle defined by 4 vertices (TL, TR, BR, BL) |
| **Enhanced OCR (Y-only)** | Text format with Y-coordinates only: `[Y:240] text text text` (for Pass 0.5) |
| **Enhanced OCR (XY)** | Text format with XY coordinates: `[Y:240] text (x:20) | ...` (for Pass 1/2) |
| **GCV** | Google Cloud Vision API |
| **OCR Artifacts** | Stored OCR data: page-N.json, manifest.json, enhanced-ocr-y.txt, enhanced-ocr-xy.txt |
| **Pass 0.5** | Encounter discovery (first AI pass) |
| **Pass 1** | Entity detection (second AI pass, optional) |
| **Pass 2** | Clinical extraction (third AI pass, not yet implemented) |
| **Spatial Sorting** | Algorithm to fix multi-column reading order |
| **Vertex** | Single point with {x, y} coordinates |
| **Worker** | Render.com background process that processes jobs |

---

**End of Pipeline Architecture Documentation**
