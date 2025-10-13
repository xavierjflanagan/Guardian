# File Format Optimization Roadmap

**Created:** 2025-10-10  
**Status:** PLANNED (Post-Phase 2)  
**Priority:** HIGH (iPhone user support critical)  
**Original Analysis:** Based on comprehensive analysis from 2 months ago

## Executive Summary

**Current Reality:** 10-15% of user uploads fail due to unsupported formats, with HEIC (iPhone photos) representing 5-8% of total volume. This creates a critical user experience gap that must be addressed after Phase 2 image downscaling is complete.

**The Fork Architecture Vision:** Implement intelligent upload routing where files are either sent directly to processing OR diverted through format conversion first, then re-enter the mainstream pipeline.

## Critical Format Gaps (From Original Analysis)

### 1. HEIC/HEIF - CRITICAL (5-8% of uploads)
- **Impact:** iPhone users (65-70% Australian market) cannot upload photos
- **Business Risk:** Core camera feature broken for majority of users
- **Technical Challenge:** Google Cloud Vision doesn't support HEIC natively

### 2. Office Documents - HIGH (3-5% of uploads)  
- **Impact:** Medical reports in DOCX/XLSX contain clinical data
- **Business Risk:** Data loss, compliance issues
- **Technical Challenge:** Need text extraction before OCR pipeline

### 3. Archive Formats - MEDIUM (2-3% of uploads)
- **Impact:** Bulk upload workflows fail (ZIP files)
- **Business Risk:** Healthcare provider efficiency reduced
- **Technical Challenge:** Multi-file coordination, comprehensive security scanning
- **Security Risk:** Archive bombs, malware injection, path traversal attacks

## Fork Pathway Architecture

### Current Flow (Phase 2)
```
Upload → Edge Function → [Format Check] → Worker Pipeline
                              ↓
                         [Unsupported] → Error
```

### Future Flow (Phase 3+)
```
Upload → Edge Function → [Format Detection & Routing]
                              ↓                    ↓
                    [Supported Formats]    [Conversion Job Queue]
                              ↓                    ↓
                      Worker Pipeline      [Worker: Convert → Re-queue for Processing]
```

**Critical:** Edge Function only routes and enqueues - all conversion happens in Worker to avoid timeout/cold-start issues.

**Idempotency Strategy:** Use SHA256 checksums of input files + conversion parameters to cache results and avoid redundant processing.

### Format Detection Strategy

**Critical:** Don't trust Content-Type headers - use magic byte detection for reliable identification.

**Pre-Conversion Audit Requirements:**
```typescript
// MANDATORY: Run before any conversion
async function auditFormatDetection(file: File, declaredMimeType: string): Promise<AuditResult> {
  // Step 1: Magic byte detection (source of truth)
  const detectedFormat = await this.detectFormatByMagicBytes(file.buffer);
  
  // Step 2: Log discrepancies for security audit
  const mimeMatch = detectedFormat.mimeType === declaredMimeType;
  
  await this.supabase.functions.invoke('audit-logger-v3', {
    body: {
      event_type: 'format_detection_audit',
      shell_file_id: file.shellFileId,
      metadata: {
        declared_mime: declaredMimeType,
        detected_format: detectedFormat.format,
        detected_mime: detectedFormat.mimeType,
        magic_bytes: Array.from(file.buffer.slice(0, 16)), // First 16 bytes for audit
        format_match: mimeMatch,
        confidence: detectedFormat.confidence,
        risk_level: mimeMatch ? 'low' : 'high' // Flag MIME spoofing attempts
      }
    }
  });
  
  // Step 3: Block suspicious files
  if (!mimeMatch && detectedFormat.confidence > 0.9) {
    throw new Error(`Format mismatch: declared ${declaredMimeType}, detected ${detectedFormat.mimeType}`);
  }
  
  return { detectedFormat, auditPassed: true };
}
```

```typescript
// Magic byte signatures for reliable format detection
const MAGIC_BYTES = {
  // Image formats
  jpeg: [0xFF, 0xD8, 0xFF],
  png: [0x89, 0x50, 0x4E, 0x47],
  heic: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], // Multi-frame HEIC
  heic_single: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], // Single-frame HEIC
  webp: [0x52, 0x49, 0x46, 0x46], // + 'WEBP' at offset 8
  tiff_le: [0x49, 0x49, 0x2A, 0x00], // Little endian
  tiff_be: [0x4D, 0x4D, 0x00, 0x2A], // Big endian
  
  // Document formats  
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF-
  
  // Office formats (ZIP-based)
  office_docx: [0x50, 0x4B, 0x03, 0x04], // ZIP signature + content inspection
  
  // Archive formats
  zip: [0x50, 0x4B, 0x03, 0x04],
  rar: [0x52, 0x61, 0x72, 0x21],
  
  // Medical formats
  dicom: [0x44, 0x49, 0x43, 0x4D] // 'DICM' at offset 128
};

interface FormatDetector {
  async detectFormat(buffer: Uint8Array): Promise<DetectedFormat> {
    // Step 1: Magic byte detection (primary)
    const magicFormat = this.detectByMagicBytes(buffer);
    
    // Step 2: Content inspection for ambiguous cases
    if (magicFormat === 'zip') {
      return await this.inspectZipContent(buffer); // Could be Office doc or archive
    }
    
    // Step 3: Fallback to header analysis
    return {
      format: magicFormat,
      confidence: magicFormat ? 'high' : 'low',
      category: this.categorizeFormat(magicFormat)
    };
  }
  
  private detectByMagicBytes(buffer: Uint8Array): string | null {
    // Check each magic byte signature
    for (const [format, signature] of Object.entries(MAGIC_BYTES)) {
      if (this.matchesSignature(buffer, signature)) {
        return format;
      }
    }
    return null;
  }
  
  private async inspectZipContent(buffer: Uint8Array): Promise<DetectedFormat> {
    // Office documents are ZIP files with specific internal structure
    const zipEntries = await this.extractZipEntries(buffer);
    
    if (zipEntries.includes('[Content_Types].xml')) {
      if (zipEntries.includes('word/document.xml')) return { format: 'docx', category: 'office' };
      if (zipEntries.includes('xl/workbook.xml')) return { format: 'xlsx', category: 'office' };
      if (zipEntries.includes('ppt/presentation.xml')) return { format: 'pptx', category: 'office' };
    }
    
    return { format: 'zip', category: 'archive' };
  }
}
```

### Format Routing Logic
```typescript
interface FormatRouter {
  async routeUpload(file: File): Promise<ProcessingRoute> {
    const format = await this.detector.detectFormat(file.buffer);
    
    switch (format.category) {
      case 'native':        // JPEG, PNG, PDF, TIFF
        return { direct: true, pipeline: 'ocr_processing' };
        
      case 'convertible':   // HEIC, WebP, Office docs
        return { direct: false, pipeline: 'format_conversion' };
        
      case 'archive':       // ZIP, RAR  
        return { direct: false, pipeline: 'archive_extraction' };
        
      case 'unsupported':   // DICOM, Unknown
        return { direct: false, pipeline: 'error_handling' };
    }
  }
}
```

## Implementation Phases

### Phase 3: HEIC Conversion (CRITICAL)
**Target:** Post-Phase 2 completion  
**Timeline:** 2-3 weeks  

**Architecture:**
- Add HEIC detection in Edge Function
- Route HEIC files to conversion service
- Convert HEIC → JPEG (quality 95)
- Re-inject into standard pipeline

**Expected Impact:**
- Eliminate 5-8% of upload failures
- Enable iPhone camera workflows
- Support photo library bulk uploads

### Phase 4: Office Document Support (HIGH)
**Target:** 4-6 weeks post-Phase 2  
**Timeline:** 2-3 weeks  

**Architecture:**
- Detect DOCX/XLSX/PPTX in Edge Function
- Route to text extraction service
- Extract text content + structure
- Convert to processing-friendly format

**Expected Impact:**
- Capture clinical data from office documents
- Prevent 3-5% of data loss scenarios
- Support medical report workflows

### Phase 5: Archive Processing (MEDIUM)
**Target:** 8-10 weeks post-Phase 2  
**Timeline:** 3-4 weeks  

**Architecture:**
- ZIP/RAR detection and security scanning
- Multi-file extraction and coordination
- Individual file processing orchestration
- Aggregate results presentation

**Critical Security Requirements for Archive Processing:**

1. **Malware Scanning:**
   - Integrate ClamAV or similar antivirus engine
   - Scan all extracted files before processing
   - Quarantine suspicious archives immediately
   - Block known malicious file signatures

2. **Archive Bomb Protection:**
   - Limit extraction depth (max 3 levels of nesting)
   - Limit extracted file count (max 1000 files per archive)
   - Limit total extracted size (max 10GB uncompressed)
   - Timeout extraction after 5 minutes

3. **Path Traversal Prevention:**
   - Sanitize all file paths during extraction
   - Block `../` and absolute path entries
   - Restrict extraction to sandboxed directories
   - Validate filename character sets

4. **Resource Exhaustion Safeguards:**
   - Memory limits per extraction (max 2GB RAM)
   - CPU time limits (max 10 minutes processing)
   - Temporary storage quotas (max 5GB per archive)
   - Concurrent extraction limits (max 3 archives)

5. **Content Validation:**
   - Verify extracted files match declared formats
   - Reject executable files (.exe, .bat, .sh, .ps1)
   - Allow only document/image formats for processing
   - Log all extracted file metadata for audit

6. **Encryption and Password Protection:**
   - Support password-protected archives with user-provided passwords
   - Implement secure password handling (no logging)
   - Limit password attempts (max 3 tries)
   - Handle encrypted archives gracefully

**Expected Impact:**
- Enable secure bulk upload workflows
- Support healthcare provider efficiency
- Handle 2-3% of upload volume safely

## Technical Implementation Strategy

### 1. Format Conversion Service Architecture

**Database Schema for Conversion Tracking:**
```sql
-- Add to current_schema/08_job_coordination.sql
CREATE TABLE format_conversion_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_checksum TEXT NOT NULL,
  conversion_params JSONB NOT NULL,
  output_storage_path TEXT NOT NULL,
  conversion_metadata JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Optional cache expiry
  
  UNIQUE(input_checksum, conversion_params)
);

CREATE INDEX idx_format_conversion_cache_lookup 
ON format_conversion_cache (input_checksum, conversion_params);

CREATE INDEX idx_format_conversion_cache_expiry 
ON format_conversion_cache (expires_at) WHERE expires_at IS NOT NULL;
```
```typescript
interface FormatConversionPipeline {
  // Core conversion service
  async convertFormat(
    inputBuffer: Uint8Array,
    sourceFormat: string,
    targetFormat: string,
    qualityOptions?: QualityOptions
  ): Promise<ConversionResult>;
  
  // Format detection and routing
  async detectFormat(buffer: Uint8Array): Promise<DetectedFormat>;
  async routeToProcessor(buffer: Uint8Array, detectedFormat: DetectedFormat): Promise<ProcessingRoute>;
  
  // Quality preservation
  async preserveQuality(
    originalBuffer: Uint8Array,
    convertedBuffer: Uint8Array
  ): Promise<QualityMetrics>;
}
```

### 2. HEIC Processing Implementation

**Conversion Metadata Schema:**
```typescript
interface ConversionMetadata {
  original_format: string;
  target_format: string;
  original_size_bytes: number;
  converted_size_bytes: number;
  conversion_checksum: string;     // SHA256 of converted file
  quality_score: number;           // 0-1 quality preservation metric
  processing_time_ms: number;
  conversion_version: string;      // For idempotency
  sharp_version?: string;          // Library version tracking
  libheif_version?: string;
}

interface ConversionCacheEntry {
  input_checksum: string;          // SHA256 of original file
  conversion_params: string;       // Serialized conversion parameters
  output_path: string;             // Storage path of converted file
  metadata: ConversionMetadata;
  created_at: string;
  expires_at: string;              // Optional cache expiry
}
```

**Idempotent HEIC Processor:**
```typescript
class HEICProcessor implements FormatConverter {
  async convertToJPEG(
    heicBuffer: Uint8Array,
    options: { quality?: number; maxWidth?: number } = {}
  ): Promise<JPEGResult> {
    const startTime = Date.now();
    const inputChecksum = await calculateSHA256(heicBuffer);
    const conversionParams = JSON.stringify({ ...options, target: 'jpeg' });
    
    // Check cache for idempotency
    const cached = await this.checkConversionCache(inputChecksum, conversionParams);
    if (cached) {
      console.log('[HEICProcessor] Using cached conversion result');
      // Log cache hit for cost optimization metrics
      await this.logConversionMetrics('cache_hit', {
        original_size_bytes: heicBuffer.length,
        cache_age_hours: Math.floor((Date.now() - new Date(cached.created_at).getTime()) / (1000 * 60 * 60))
      });
      return cached;
    }
    
    // Use libheif + Sharp for single-pass conversion + downscaling
    const heifDecoder = new HeifDecoder();
    const heifImage = await heifDecoder.decode(heicBuffer);
    
    // Single operation: resize + encode (avoid double compression)
    const jpegBuffer = await sharp(heifImage)
      .resize({ 
        width: options.maxWidth || 1600, 
        withoutEnlargement: true, 
        kernel: 'lanczos3' 
      })
      .jpeg({ 
        quality: options.quality || 95,
        progressive: true,
        mozjpeg: true // Better compression for medical images
      })
      .toBuffer();
    
    const metadata: ConversionMetadata = {
      original_format: 'image/heic',
      target_format: 'image/jpeg',
      original_size_bytes: heicBuffer.length,
      converted_size_bytes: jpegBuffer.length,
      conversion_checksum: await calculateSHA256(jpegBuffer),
      quality_score: await this.calculateQualityScore(heicBuffer, jpegBuffer),
      processing_time_ms: Date.now() - startTime,
      conversion_version: 'v1.0.0',
      sharp_version: sharp.versions.sharp,
      libheif_version: await this.getLibheifVersion()
    };
    
    const result = {
      buffer: jpegBuffer,
      metadata,
      cached: false
    };
    
    // Hard cap on converted file size to prevent runaway costs
    if (result.buffer.length > 50 * 1024 * 1024) { // 50MB limit
      throw new Error(`Converted file too large: ${result.buffer.length} bytes (max 50MB)`);
    }
    
    // Cache result for future idempotency
    await this.supabase
      .from('format_conversion_cache')
      .insert({
        input_checksum: inputChecksum,
        conversion_params: conversionParams,
        output_storage_path: result.storagePath,
        conversion_metadata: result.metadata,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      });
      
    // Log cache miss for metrics
    await this.logConversionMetrics('cache_miss', result.metadata);
    
    return result;
  }
  
  private async calculateQualityScore(original: Uint8Array, converted: Uint8Array): Promise<number> {
    // Implement SSIM or PSNR quality comparison
    // For now, use file size ratio as rough metric
    const compressionRatio = converted.length / original.length;
    return Math.max(0.5, Math.min(1.0, compressionRatio * 2)); // Rough approximation
  }
}
```

### 3. Integration with Phase 2 Downscaling

**Critical:** Format conversion and downscaling must happen in a **single operation** to avoid double-lossy compression.

```typescript
// CORRECT: Single-pass conversion + downscaling (avoid double-lossy)
async processFileOptimally(file: File): Promise<ProcessedFile> {
  // Detect format and determine optimal processing path
  const format = await this.detectFormat(file.buffer);
  
  if (format.category === 'convertible') {
    // SINGLE OPERATION: Convert HEIC→JPEG with downscaling in one pass
    return await this.convertAndDownscaleSimultaneously(file);
  } else {
    // Native formats: downscale only (Phase 2 pipeline)
    return await this.downscaleOnly(file);
  }
}

// HEIC example: Single-pass conversion + downscaling
async convertAndDownscaleSimultaneously(file: File): Promise<ProcessedFile> {
  if (file.type === 'image/heic') {
    // Use libheif + Sharp in single pipeline
    const heifDecoder = new HeifDecoder();
    const heifImage = await heifDecoder.decode(file.buffer);
    
    // CRITICAL: Resize before JPEG encoding (not after)
    const processed = await sharp(heifImage)
      .resize({ width: 1600, withoutEnlargement: true, kernel: 'lanczos3' })
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' }) // High quality for medical
      .toBuffer();
    
    const meta = await sharp(processed).metadata();
    return {
      buffer: processed,
      width: meta.width || 0,
      height: meta.height || 0,
      mimeType: 'image/jpeg'
    };
  }
  
  throw new Error(`Unsupported convertible format: ${file.type}`);
}

// WRONG APPROACH - NEVER DO THIS:
// 1. Convert HEIC → full-size JPEG
// 2. Then downscale JPEG → smaller JPEG
// Result: Double JPEG compression = significant quality loss for medical text
```

**Conversion Order Principles:**
- **HEIC → JPEG**: Convert + downscale simultaneously
- **PNG → PNG**: Downscale only (format preserved)
- **JPEG → JPEG**: Downscale only (avoid re-compression)
- **Office docs**: Extract text first, then process as text (no image pipeline)

## Performance Targets (From Original Analysis)

### HEIC Conversion
- **Target Time:** < 2 seconds for typical photos
- **Memory Usage:** < 100MB per conversion  
- **Concurrent Processing:** 10 simultaneous conversions
- **Quality Preservation:** > 90% quality score

### Office Document Processing  
- **Target Time:** < 5 seconds for typical documents
- **Memory Usage:** < 200MB per document
- **Text Extraction:** > 95% completeness
- **Structure Preservation:** Tables and formatting maintained

### Overall System Impact
- **Upload Success Rate:** 85-90% → 98%+
- **Format Coverage:** 40% (6/15+ formats) → 95%
- **User Experience:** Eliminate format-related failures

## Architectural Seams in Phase 2

Phase 2 is designed for future expansion with V3 job queue integration:

```typescript
// Phase 2: downscaleImageBase64() in image-processing.ts (CURRENT)
export async function downscaleImageBase64(b64: string, mime: string) {
  // HEIC: Not supported by Google Cloud Vision
  if (mime === 'image/heic' || mime === 'image/heif') {
    throw new Error('HEIC/HEIF files not supported by Google Cloud Vision OCR');
    // Phase 3: Will be handled by format_conversion job type
  }
  
  // Future: Office document detection
  if (mime.startsWith('application/vnd.openxmlformats')) {
    throw new Error('Office documents require text extraction (Phase 4)');
    // Phase 4: Will be handled by format_conversion job type
  }
}

// Phase 3+: Edge Function format routing (FUTURE)
if (detectedFormat.format === 'heic') {
  // Route to conversion pipeline instead of throwing error
  await supabase.rpc('enqueue_job_v3', {
    p_job_type: 'format_conversion',
    p_job_category: 'image_conversion',
    p_job_name: 'heic_to_jpeg_conversion',
    p_job_payload: {
      shell_file_id,
      patient_id,
      source_format: 'image/heic',
      target_format: 'image/jpeg',
      conversion_options: { quality: 95, maxWidth: 1600 }
    }
  });
}
```

## Success Metrics

### Technical Success Metrics
- **Format Support Coverage:** 40% → 95% (15+ formats supported)
- **Processing Success Rate:** 85-90% → 98%+ upload success
- **Performance Compliance:** > 95% within target processing times
- **Quality Preservation:** > 90% quality score for conversions

### User Experience Success Metrics  
- **Upload Success Rate:** > 98% user upload success
- **iPhone User Success:** 100% HEIC photo upload success
- **Workflow Completion:** > 95% end-to-end completion rate
- **Error Recovery:** > 90% successful error recovery

## Risk Assessment

### Current Risk Level: HIGH
- 10-15% of uploads fail due to format issues
- iPhone users (65-70% market) affected by HEIC failures
- Clinical data loss from unsupported office documents

### Target Risk Level: LOW  
- < 2% upload failures after full implementation
- Comprehensive format support across all user devices
- Future-ready for new formats and devices

## Dependencies and Prerequisites

**Sharp + libheif Integration Status:**
Sharp (already in package.json) includes HEIC support via libheif when installed with:
```bash
# Render.com build environment
npm install sharp --platform=linux --arch=x64
# libheif is automatically included in Sharp's prebuilt binaries
```

**Dependency Verification Script:**
```typescript
// Add to render-worker startup checks
async function verifyFormatSupport() {
  const sharp = await import('sharp');
  
  console.log('Sharp version:', sharp.versions.sharp);
  console.log('libheif support:', !!sharp.format.heif);
  console.log('Supported input formats:', Object.keys(sharp.format));
  
  // Test HEIC processing capability
  try {
    await sharp(testHeicBuffer).metadata();
    console.log('✅ HEIC processing verified');
  } catch (error) {
    console.error('❌ HEIC processing failed:', error.message);
  }
}
```

### Phase 3 (HEIC) Dependencies:
- Phase 2 image downscaling complete
- **Sharp + libheif**: Existing Sharp dependency already supports HEIC via libheif
- Quality preservation validation framework
- iPhone testing infrastructure

**Library Integration Strategy:**
```typescript
// Sharp already has HEIC support via libheif - no additional dependencies needed
import sharp from 'sharp';

// Verify HEIC support in current Sharp installation
const supportedFormats = sharp.format;
console.log('HEIC supported:', !!supportedFormats.heif);

// Single-pass HEIC conversion + downscaling
const processedImage = await sharp(heicBuffer)
  .resize({ width: 1600, withoutEnlargement: true })
  .jpeg({ quality: 95, mozjpeg: true })
  .toBuffer();
```

**Render.com Deployment Considerations:**
- Sharp binary compatibility on Linux x64 (Render.com runtime)
- libheif shared library availability in Render.com environment
- Build-time vs runtime dependency resolution
- Docker image size optimization with libheif

### Phase 4 (Office Docs) Dependencies:
- Phase 3 conversion pipeline established
- **Node.js libraries**: mammoth (DOCX), xlsx (XLSX), or Apache POI via Java bridge
- Structure preservation validation
- Clinical document test dataset

**Library Options Analysis:**
```typescript
// Option 1: Native Node.js libraries (recommended)
import mammoth from 'mammoth';           // DOCX text extraction
import * as XLSX from 'xlsx';            // Excel file processing

// Option 2: Java bridge (higher overhead)
import java from 'java';                 // Requires JVM in Render.com
// java.classpath.push('apache-poi.jar');

// Option 3: LibreOffice headless (heavy)
// Requires full LibreOffice installation
```

### Phase 5 (Archives) Dependencies:
- Phase 4 multi-format handling proven
- **Archive libraries**: yauzl (ZIP), node-rar (RAR) with security wrappers
- **Security scanning**: ClamAV integration via clamd or clamdscan
- Multi-file coordination framework

**Security-First Library Selection:**
```typescript
// Secure ZIP extraction with yauzl + custom safety wrapper
import yauzl from 'yauzl';              // Streaming ZIP extraction
import { createSecureExtractor } from './security-wrapper';

// ClamAV integration options
import clamscan from 'clamscan';         // Node.js ClamAV wrapper
// Alternative: Direct clamd TCP socket communication

// Resource monitoring
import pidusage from 'pidusage';         // Process resource monitoring
```

## V3 Job Queue Integration Points

### Current Architecture Integration:

**Leverages Existing V3 Job Queue System:**

1. **Edge Function (`shell-file-processor-v3`):**
   - Add format detection (magic bytes) 
   - Route native formats → direct `ai_processing` job
   - Route convertible formats → `format_conversion` job → `ai_processing` job
   - No conversion processing (avoid timeouts)

2. **Worker Pipeline (extends existing `worker.ts`):**
   - Add `processFormatConversionJob()` method alongside `processAIJob()`
   - Use existing job claiming via `claim_next_job_v3()` with new job types
   - Conversion jobs create follow-up AI processing jobs
   - Reuse existing storage patterns and error handling

**Job Type/Lane Configuration:**
```typescript
// Extend existing job claiming in worker.ts
const { data, error } = await this.supabase
  .rpc('claim_next_job_v3', {
    p_worker_id: this.workerId,
    p_job_types: [
      'ai_processing',        // Existing
      'format_conversion'     // NEW: Dedicated lane for conversions
    ],
    p_job_lanes: [
      'ai_queue_simple',      // Existing
      'format_conversion_lane' // NEW: Separate lane with rate limits
    ]
  });

// Rate limiting and backpressure for format_conversion lane
if (job.job_type === 'format_conversion') {
  // Check conversion queue depth for backpressure
  const queueDepth = await this.getConversionQueueDepth();
  if (queueDepth > 50) {
    console.warn('[Worker] Conversion queue overloaded, applying backpressure');
    await this.sleep(5000); // Wait 5s before processing
  }
}
```

**Backpressure and Rate Limiting:**
- Max 10 concurrent format conversions per worker
- Queue depth monitoring (pause at >50 jobs)
- HEIC conversion priority over archive extraction
- Fail-fast for oversized files (>100MB)

3. **Job Coordination Integration:**
   ```typescript
   // Extends existing job types in worker.ts
   switch (job.job_type) {
     case 'ai_processing':        // Existing
       result = await this.processAIJob(job);
       break;
     case 'format_conversion':    // NEW
       result = await this.processFormatConversionJob(job);
       break;
     case 'shell_file_processing': // Legacy
       result = await this.processShellFile(job);
       break;
   }
   ```

4. **Storage Strategy:**
   - Original files: `${patient_id}/${shell_file_id}.ext` (existing)
   - Converted files: `${patient_id}/${shell_file_id}-converted.jpg`
   - Cache converted files for idempotency
   - Update `shell_files` table with converted file path

5. **Database Integration:**
   - Extends existing `job_queue` table (no schema changes needed)
   - Add `format_conversion_cache` table for idempotency
   - Track conversion metadata in `shell_files.processing_metadata`
   - Correlation tracking across upload → conversion → AI processing pipeline

### Future Architecture Considerations:

**Builds on V3 Foundation:**
- **Job Queue Scaling:** Existing `claim_next_job_v3()` handles conversion job prioritization
- **Worker Scaling:** Existing Render.com worker auto-scales based on job volume
- **Caching Strategy:** `format_conversion_cache` table prevents redundant conversions
- **Monitoring:** Extends existing job metrics and worker heartbeat system
- **Error Handling:** Reuses existing retry logic and failure tracking

**Integration Points with Existing V3 System:**
```typescript
// Edge Function: shell-file-processor-v3.ts (EXTEND)
if (needsFormatConversion(detectedFormat)) {
  // Enqueue format conversion job first
  await supabase.rpc('enqueue_job_v3', {
    p_job_type: 'format_conversion',
    p_job_payload: { /* conversion params */ }
  });
} else {
  // Direct to AI processing (existing flow)
  await supabase.rpc('enqueue_job_v3', {
    p_job_type: 'ai_processing', 
    p_job_payload: { /* AI params */ }
  });
}

// Worker: worker.ts (EXTEND)
class V3Worker {
  async processFormatConversionJob(job: Job): Promise<any> {
    // 1. Convert format (HEIC→JPEG, etc.)
    // 2. Store converted file
    // 3. Enqueue follow-up AI processing job
    // 4. Return conversion metadata
  }
}
```

## Next Steps

### Immediate (Post-Phase 2):
1. **Detailed Phase 3 Planning:** HEIC conversion implementation design
2. **Library Evaluation:** Test libheif, sharp, and alternative solutions
3. **Performance Benchmarking:** Establish conversion speed baselines
4. **Quality Framework:** Define quality preservation metrics

### Medium Term:
1. **Office Document Analysis:** Define text extraction requirements  
2. **Archive Processing Design:** Secure multi-file coordination strategy
3. **User Experience Design:** Seamless conversion user flows
4. **Testing Framework:** Comprehensive format validation suite
5. **Observability Dashboard:** Real-time conversion metrics and correlation tracking
6. **Security Monitoring:** Archive threat detection and response automation

## Test Corpus and Expected Outcomes

```typescript
interface TestCase {
  input: string;           // File type
  expectedOutput: string;  // Expected conversion result
  shouldBlock?: boolean;   // Should be blocked pending security scan
  bypassConversion?: boolean; // Emergency bypass flag
}

const TEST_CORPUS: TestCase[] = [
  // Image conversions
  { input: 'iPhone_photo.heic', expectedOutput: 'converted_1600px.jpeg' },
  { input: 'android_photo.jpg', expectedOutput: 'downscaled_1600px.jpeg' },
  { input: 'scan_document.png', expectedOutput: 'unchanged.png' }, // Lossless preservation
  { input: 'medical_scan.tiff', expectedOutput: 'passthrough.tiff' }, // Multi-page support
  
  // Office documents
  { input: 'lab_report.docx', expectedOutput: 'extracted_text.txt' },
  { input: 'results_spreadsheet.xlsx', expectedOutput: 'extracted_data.csv' },
  
  // Archive files (security-first)
  { input: 'medical_records.zip', expectedOutput: 'blocked_pending_av_scan', shouldBlock: true },
  { input: 'bulk_documents.rar', expectedOutput: 'blocked_pending_av_scan', shouldBlock: true },
  
  // Edge cases
  { input: 'corrupted_file.heic', expectedOutput: 'error_graceful_fallback' },
  { input: 'oversized_100mb.jpg', expectedOutput: 'error_size_limit_exceeded' },
  
  // Bypass scenarios
  { input: 'emergency_bypass.heic', expectedOutput: 'direct_to_phase2', bypassConversion: true }
];
```

**Performance Targets:**
- **Upload success rate improvement**: 85-90% → 98%+
- **Cache hit rate**: >60% for repeat uploads (cost optimization)
- **Conversion time**: <2s for HEIC, <5s for Office docs, <30s for archives
- **Security scan time**: <10s for archives (ClamAV integration)
- **User experience enhancement**: Seamless format handling with progress indicators

## Emergency Rollback Strategy

**Conversion Bypass Flag:**
```typescript
// Environment variable for emergency rollback
const BYPASS_FORMAT_CONVERSION = process.env.BYPASS_FORMAT_CONVERSION === 'true';

// Edge Function: shell-file-processor-v3.ts
if (BYPASS_FORMAT_CONVERSION || file.bypassConversion) {
  console.log('[Emergency] Bypassing format conversion, routing directly to Phase 2');
  
  // Route directly to AI processing (Phase 2 path)
  await supabase.rpc('enqueue_job_v3', {
    p_job_type: 'ai_processing',
    p_job_payload: {
      ...originalPayload,
      conversion_bypassed: true,
      bypass_reason: BYPASS_FORMAT_CONVERSION ? 'system_flag' : 'file_flag'
    }
  });
  
  return response;
}

// Worker: Handle bypassed files in Phase 2 pipeline
if (payload.conversion_bypassed) {
  console.log('[Worker] Processing bypassed file with Phase 2 downscaling');
  // Use existing Phase 2 downscaleImageBase64() function
  const processed = await downscaleImageBase64(fileData, mimeType);
  // Continue with existing AI processing...
}
```

**Rollback Triggers:**
- Conversion queue overload (>100 jobs pending)
- High conversion failure rate (>10% in 1 hour)
- Security scan service unavailable
- Manual override via environment variable

**Monitoring and Alerts:**
```typescript
// Conversion health check
interface ConversionHealthMetrics {
  queue_depth: number;
  cache_hit_rate: number;
  conversion_success_rate: number;
  average_processing_time_ms: number;
  security_scan_availability: boolean;
}

// Alert conditions
if (metrics.conversion_success_rate < 0.9) {
  await triggerAlert('high_conversion_failure_rate', metrics);
}
if (metrics.queue_depth > 100) {
  await triggerAlert('conversion_queue_overload', metrics);
  // Auto-enable bypass for new uploads
  await setEnvironmentFlag('BYPASS_FORMAT_CONVERSION', 'true');
}
```

## Related Documentation

- **[Original File Format Analysis](../../../archive/ai-processing-v2/03-extraction-pipeline/document-ingestion/FILE_FORMAT_ANALYSIS_AND_SOLUTION_PLAN.md)** - Comprehensive 2-month-old analysis (source material)
- **[Phase 2 Image Downscaling](./architectural-improvements/phase2-image-downscaling-implementation.md)** - Current implementation with format detection hooks
- **[Performance Optimization Roadmap](./pass1-performance-optimization-roadmap.md)** - Processing speed improvements
- **[Pass 1 Architectural Improvements](./architectural-improvements/pass1-architectural-improvements.md)** - Overall improvement strategy

---

**This roadmap preserves the critical insights from the original analysis while building on the Phase 2 foundation to create a comprehensive file format optimization strategy for future implementation.**