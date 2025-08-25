# File Pre-Processing Component Architecture

## Document Status
- **Created**: 25 August 2025
- **Purpose**: Define the file pre-processing system for document optimization before OCR and AI analysis
- **Status**: Component specification for implementation
- **Related**: Follows `01-file-upload-architecture.md` and precedes `03-ocr-processing-architecture.md`

## Executive Summary

The file pre-processing component transforms uploaded medical documents into optimized, analysis-ready formats. It provides intelligent document routing, security scanning, duplicate detection, and format optimization while maintaining cost efficiency through smart processing paths.

## Core Processing Philosophy

**Intelligent Routing Strategy**: 95% of documents follow the "fast path" with minimal processing overhead, while complex documents receive targeted enhancement without compromising the majority's efficiency.

## Architecture Overview

```yaml
Pre-Processing Pipeline:
  1. Security Scanning: Malware detection and content validation
  2. Duplicate Detection: SHA-256 hash-based deduplication 
  3. Intelligent Document Routing: Fast/slow/hybrid path determination
  4. Format Optimization: Document rendering and enhancement
  5. File Enhancement: Quality improvement and multi-page handling
  6. Multi-Version Storage: Original, enhanced, and page-extract versions
  7. OCR Handoff: Optimized document delivery to text extraction
```

## Component Specifications

### 1. Security Scanning Layer

#### Malware Detection Engine
```typescript
interface SecurityScanResult {
  isSafe: boolean;
  threatLevel: 'none' | 'low' | 'medium' | 'high';
  detectedThreats: SecurityThreat[];
  scanDuration: number;
  scannerVersion: string;
}

interface SecurityThreat {
  type: 'malware' | 'suspicious_content' | 'embedded_script' | 'macro';
  severity: number;
  description: string;
  location?: string;  // Page or section where threat detected
}
```

#### Content Validation
```typescript
interface ContentValidation {
  fileIntegrity: boolean;           // File not corrupted
  formatConsistency: boolean;       // Contents match declared MIME type
  embeddedObjectScan: boolean;      // Check for suspicious embedded objects
  macroDetection: boolean;          // Office document macro scanning
  encryptionStatus: 'none' | 'password' | 'certificate';
}
```

#### Security Rules Engine
- **File signature verification**: Deep inspection beyond MIME types
- **Embedded content scanning**: Check for scripts, macros, suspicious objects  
- **Password-protected handling**: Secure extraction or user notification
- **Certificate validation**: For digitally signed documents
- **Quarantine procedures**: Isolate suspicious files for manual review

### 2. Duplicate Detection System

#### Hash-Based Deduplication
```typescript
interface DuplicateCheck {
  fileHash: string;                 // SHA-256 of raw file
  isDuplicate: boolean;
  originalDocumentId?: string;      // Reference to existing document
  uploadedAt?: Date;               // When original was uploaded
  costSavings: number;             // Processing cost avoided
}

// Immediate cost optimization strategy
const HASH_CHECK_STRATEGY = {
  timing: 'immediate_post_security',  // After security, before any processing
  hashAlgorithm: 'SHA-256',
  processingTime: '<1ms',
  costSavings: '100% of processing costs for duplicates'
};
```

#### Duplicate Handling Logic
```typescript
async function handleDuplicateDetection(fileHash: string, userId: string): Promise<DuplicateAction> {
  const existingDoc = await findDocumentByHash(fileHash, userId);
  
  if (existingDoc) {
    return {
      action: 'reference_existing',
      documentId: existingDoc.id,
      message: 'Identical document already processed',
      skipProcessing: true,
      costSaved: estimateProcessingCost(existingDoc.fileSize)
    };
  }
  
  return {
    action: 'proceed_processing',
    skipProcessing: false
  };
}
```

### 3. Intelligent Document Routing System

#### Processing Path Determination
```typescript
interface DocumentRoutingDecision {
  selectedPath: 'fast' | 'slow' | 'hybrid';
  confidence: number;
  reasoningFactors: RoutingFactor[];
  estimatedProcessingTime: number;
  estimatedCost: number;
}

interface RoutingFactor {
  factor: string;
  weight: number;
  value: any;
  impact: 'positive' | 'negative' | 'neutral';
}
```

#### Fast Path Criteria (95% of documents)
```typescript
const FAST_PATH_CRITERIA = {
  formats: ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'],
  conditions: {
    fileSize: '<10MB',
    pageCount: '<20',
    textExtractability: '>90%',  // For PDFs with native text
    imageQuality: '>300dpi',     // For image documents
    corruptionLevel: '0%'
  },
  processingApproach: 'direct_extraction',
  averageTime: '<500ms'
};
```

#### Slow Path Criteria (Complex documents)
```typescript
const SLOW_PATH_CRITERIA = {
  formats: ['image/heic', 'image/heif', 'application/msword', 'complex_pdf'],
  conditions: {
    fileSize: '>10MB',
    pageCount: '>20',
    textExtractability: '<50%',   // Scanned PDFs
    imageQuality: '<200dpi',      // Low resolution images
    corruptionLevel: '>0%'        // Damaged files
  },
  processingApproach: 'rendering_then_extraction',
  averageTime: '3-8s'
};
```

#### Hybrid Path Criteria (Mixed content - 15-20% of documents)
```typescript
const HYBRID_PATH_CRITERIA = {
  conditions: {
    contentMix: 'text_and_images',
    pdfStructure: 'mixed',        // Some pages text, some scanned
    documentSections: 'heterogeneous'
  },
  strategy: 'page_by_page_analysis',
  approach: 'optimal_per_page_processing',
  example: 'Pages 1-2: native text (fast), Pages 3-4: scanned images (slow)'
};
```

### 4. Format Optimization Engine

#### Document Rendering System
```typescript
interface RenderingEngine {
  // For complex Office documents
  officeToImage: (file: File) => Promise<ImageSet>;
  
  // For HEIC/HEIF mobile formats  
  heicToPng: (file: File) => Promise<ImageFile>;
  
  // For corrupted or complex PDFs
  pdfRerender: (file: File) => Promise<CleanPDF>;
  
  // Quality assessment
  assessRenderQuality: (original: File, rendered: File) => QualityScore;
}

interface ImageSet {
  pages: ImagePage[];
  totalPages: number;
  resolution: number;
  format: 'png' | 'jpeg';
}
```

#### Format-Specific Optimization
```typescript
const FORMAT_HANDLERS = {
  'application/pdf': {
    fastPath: 'direct_text_extraction',
    slowPath: 'render_to_images',
    hybrid: 'page_by_page_decision'
  },
  
  'image/heic': {
    processing: 'convert_to_png',
    qualityEnhancement: 'orientation_brightness_contrast',
    costImpact: 'minimal'
  },
  
  'application/msword': {
    processing: 'render_to_pdf_then_images', 
    textPreservation: 'extract_before_render',
    layoutPreservation: 'high_fidelity_rendering'
  }
};
```

### 5. File Enhancement Engine

#### Image Quality Enhancement
```typescript
interface EnhancementProcessing {
  // Orientation correction
  autoRotate: (image: ImageFile) => ImageFile;
  
  // Brightness and contrast optimization
  optimizeContrast: (image: ImageFile) => ImageFile;
  
  // Resolution enhancement for low-quality scans
  upscaleResolution: (image: ImageFile) => ImageFile;
  
  // Noise reduction for scanned documents
  denoise: (image: ImageFile) => ImageFile;
  
  // Text clarity improvement
  sharpenText: (image: ImageFile) => ImageFile;
}
```

#### Multi-Page Document Handling
```typescript
interface MultiPageProcessor {
  // PDF page separation
  separatePdfPages: (pdf: File) => PageCollection;
  
  // Archive extraction (ZIP, RAR containing images)
  extractArchive: (archive: File) => FileCollection;
  
  // Multi-page TIFF handling
  splitTiffPages: (tiff: File) => ImageCollection;
  
  // Page sequence validation
  validatePageOrder: (pages: PageCollection) => OrderingResult;
}
```

#### Enhancement Decision Matrix
```typescript
const ENHANCEMENT_RULES = {
  always: ['orientation_correction', 'basic_brightness_adjustment'],
  conditional: {
    'low_quality_scan': ['contrast_enhancement', 'noise_reduction'],
    'mobile_photo': ['perspective_correction', 'shadow_removal'],
    'faded_document': ['contrast_boost', 'text_sharpening'],
    'oversized_image': ['smart_resize', 'compression_optimization']
  },
  never: ['lossy_compression', 'aggressive_filtering']
};
```

### 6. Multi-Version Storage Strategy

#### Three-Version Storage Architecture
```typescript
interface DocumentVersions {
  original: {
    path: string;           // Always preserved
    purpose: 'audit_compliance',
    retention: 'permanent'
  };
  
  enhanced: {
    path: string;           // Created if processing occurred
    purpose: 'ocr_ai_analysis',
    retention: 'until_processed',
    optimizations: Enhancement[]
  };
  
  pageExtracts: {
    paths: string[];        // For mixed content documents
    purpose: 'granular_processing', 
    retention: 'processing_duration',
    structure: 'page_by_page_files'
  };
}
```

#### Storage Optimization Logic
```typescript
async function determineStorageStrategy(
  processingPath: ProcessingPath, 
  enhancementsApplied: Enhancement[]
): Promise<StorageDecision> {
  
  const strategy = {
    storeOriginal: true,  // Always store for compliance
    storeEnhanced: enhancementsApplied.length > 0,
    storePageExtracts: processingPath === 'hybrid'
  };
  
  return {
    versions: calculateVersionsNeeded(strategy),
    estimatedStorage: estimateStorageRequirement(strategy),
    cleanupSchedule: determineCleanupTiming(strategy)
  };
}
```

### 7. Quality Assurance Framework

#### Processing Quality Validation
```typescript
interface QualityMetrics {
  textExtractability: number;      // 0-1 score
  imageClarity: number;            // DPI and sharpness score
  pageCompleteness: number;        // No missing or corrupted pages
  formatConsistency: boolean;      // Output matches expectations
  processingTime: number;          // Performance metric
}

interface QualityGates {
  minimumTextExtractability: 0.7;
  minimumImageClarity: 200;        // DPI
  maximumProcessingTime: 30000;    // 30 seconds
  requiredPageCompleteness: 1.0;   // 100%
}
```

#### Fallback and Recovery
```typescript
interface ProcessingFallback {
  primaryFailed: boolean;
  fallbackStrategy: 'alternative_engine' | 'manual_review' | 'user_notification';
  fallbackCost: number;
  successProbability: number;
}

const FALLBACK_HIERARCHY = [
  'retry_with_different_settings',
  'try_alternative_rendering_engine', 
  'manual_processing_queue',
  'user_notification_for_reupload'
];
```

## Performance Optimization

### Processing Strategy Distribution
```typescript
const EXPECTED_DISTRIBUTION = {
  fastPath: {
    percentage: 95,
    averageTime: '400ms',
    costPerDocument: '$0.0001'
  },
  slowPath: {
    percentage: 3,
    averageTime: '5s',
    costPerDocument: '$0.002'
  },
  hybridPath: {
    percentage: 2, 
    averageTime: '2s',
    costPerDocument: '$0.0008'
  }
};
```

### Cost Optimization Strategies
- **Hash checking priority**: Immediate deduplication saves 100% processing costs
- **Path selection accuracy**: Minimize unnecessary slow path routing
- **Enhancement selectivity**: Apply enhancements only when beneficial
- **Storage efficiency**: Clean up intermediate files promptly
- **Batch processing**: Group similar documents for efficiency

## Integration Points

### Upload Component Integration
```typescript
interface UploadHandoff {
  documentId: string;
  rawStoragePath: string;
  uploadMetadata: UploadMetadata;
  securityClearance: boolean;
}
```

### OCR Component Handoff  
```typescript
interface OCRHandoff {
  documentId: string;
  optimizedStoragePaths: string[];    // Enhanced versions
  processingPath: ProcessingPath;
  qualityMetrics: QualityMetrics;
  recommendedOCRStrategy: OCRStrategy;
}
```

## Monitoring & Analytics

### Processing Metrics
```typescript
interface ProcessingAnalytics {
  pathDistribution: Record<ProcessingPath, number>;
  averageProcessingTimes: Record<ProcessingPath, number>;
  enhancementEffectiveness: Record<Enhancement, QualityImprovement>;
  costOptimizationSavings: number;
  duplicateDetectionRate: number;
}
```

### Quality Monitoring
- **Processing success rates** by document type and path
- **Enhancement effectiveness** measured by downstream OCR accuracy
- **Cost optimization** tracking through duplicate detection
- **Security threat detection** rates and false positive monitoring

## Implementation Phases

### Phase 1: Core Processing (MVP)
- Security scanning and duplicate detection
- Basic fast/slow path routing
- Essential format conversions (HEIC, basic PDF)
- Single enhanced version storage

### Phase 2: Intelligence Layer
- Advanced document routing with hybrid paths
- Page-by-page processing for mixed content
- Comprehensive enhancement engine
- Multi-version storage strategy

### Phase 3: Optimization & Learning
- Machine learning for routing decisions
- Advanced quality metrics and optimization
- Cost optimization through processing analytics
- Performance monitoring and auto-tuning

## Success Criteria

- **Processing Success Rate**: >99.5% for all supported formats
- **Path Accuracy**: >95% correct fast/slow/hybrid routing decisions
- **Cost Efficiency**: <$0.002 average cost per document
- **Quality Improvement**: >20% OCR accuracy improvement for enhanced documents
- **Duplicate Detection**: 100% accuracy for preventing unnecessary processing

---

*This file pre-processing architecture provides intelligent, cost-effective document optimization that ensures downstream OCR and AI systems receive clean, analysis-ready content while maintaining healthcare-grade security and compliance.*