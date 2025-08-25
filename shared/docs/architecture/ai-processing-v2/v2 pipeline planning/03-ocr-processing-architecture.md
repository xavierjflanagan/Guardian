# OCR Processing Component Architecture

## Document Status
- **Created**: 25 August 2025
- **Purpose**: Define the OCR text extraction system for converting optimized documents to structured text with spatial coordinates
- **Status**: Component specification for implementation  
- **Related**: Follows `02-file-preprocessing-architecture.md` and feeds `04-ai-processing-architecture.md`

## Executive Summary

The OCR processing component extracts text and spatial coordinate data from pre-processed, optimized medical documents. By the time documents reach this stage, complex format issues have been resolved by pre-processing, allowing OCR to focus on efficient text and spatial cooridnate extraction from clean, analysis-ready files.

## Core OCR Philosophy

**Clean Input Processing**: Process pre-optimized documents that have been enhanced and standardized by the pre-processing component, ensuring maximum text extraction accuracy and spatial precision from quality-assured inputs.

## Architecture Overview

```yaml
OCR Processing Pipeline:
  1. Clean Input Reception: Receive pre-processed, optimized documents
  2. Extraction Method Selection: Direct text vs OCR based on document type  
  3. Text Extraction: High-quality extraction from enhanced documents
  4. Spatial Coordinate Capture: Bounding boxes and positioning data
  5. Quality Assessment: Confidence scoring and validation
  6. Multi-Page Coordination: Page assembly and sequence validation
  7. AI Handoff: Structured text + spatial data for entity detection
```

## Component Specifications

### 1. Pre-Processed Document Reception

#### Clean Input Integration
```typescript
interface PreProcessedInput {
  documentId: string;
  optimizedVersions: {
    original: string;           // Always available
    enhanced?: string;          // Available if enhancement occurred
    pageExtracts?: string[];    // Available for mixed content
  };
  processingMetadata: {
    enhancementsApplied: Enhancement[];
    qualityImprovement: QualityMetrics;
    recommendedOCRApproach: 'direct_text' | 'ocr_extraction';
  };
  documentType: 'native_text' | 'image_based' | 'mixed_content';
}

interface OCRStrategy {
  approach: 'direct_text' | 'google_vision';
  targetVersion: 'enhanced' | 'original';    // Use enhanced when available
  expectedAccuracy: number;
  estimatedCost: number;
  estimatedTime: number;
}
```

#### Strategy Selection Logic
```typescript
async function selectOCRStrategy(input: PreProcessedInput): Promise<OCRStrategy> {
  // Use pre-processing recommendations for optimal approach
  if (input.documentType === 'native_text') {
    return {
      approach: 'direct_text',
      targetVersion: input.optimizedVersions.enhanced || input.optimizedVersions.original,
      provider: 'pdf_text_extraction',
      expectedAccuracy: 0.999,
      estimatedCost: 0.0001,
      estimatedTime: 50  // milliseconds
    };
  }
  
  if (input.documentType === 'image_based') {
    return {
      approach: 'google_vision',
      targetVersion: input.optimizedVersions.enhanced || input.optimizedVersions.original,
      provider: 'google_cloud_vision',
      expectedAccuracy: 0.97,  // Higher due to pre-processing enhancement
      estimatedCost: 0.0015,
      estimatedTime: 2000  // milliseconds
    };
  }
  
  // Mixed content - process optimized page extracts
  return {
    approach: 'mixed_strategy',
    targetVersion: 'page_extracts',
    provider: 'page_by_page_optimal',
    expectedAccuracy: 0.96,
    estimatedCost: 0.0008,
    estimatedTime: 1500
  };
}
```

### 2. Text Extraction Engines

#### Direct Text Extraction (Native Text Documents)
```typescript
interface DirectTextExtraction {
  // For pre-processed PDFs with native text (already optimized)
  extractPdfText: (pdfPath: string) => Promise<TextWithCoordinates>;
  
  // For pre-processed Office documents (rendered and optimized)
  extractDocumentText: (docPath: string) => Promise<TextWithCoordinates>;
  
  // For plain text files (validated and cleaned)
  extractPlainText: (textPath: string) => Promise<TextWithCoordinates>;
}

interface TextWithCoordinates {
  fullText: string;
  textBlocks: TextBlock[];
  pageCount: number;
  extractionMetadata: ExtractionMetadata;
}

interface TextBlock {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
  pageNumber: number;
  blockId: string;
}
```

#### Google Cloud Vision OCR (Image-Based Documents)
```typescript
interface GoogleVisionOCR {
  // High-quality OCR for pre-enhanced image documents
  processDocument: (imagePath: string) => Promise<OCRResult>;
  
  // Batch processing for pre-optimized multi-page documents  
  processBatch: (imagePaths: string[]) => Promise<OCRResult[]>;
  
  // Enhanced accuracy due to pre-processing optimization
  processEnhancedDocument: (enhancedImagePath: string) => Promise<OCRResult>;
}

interface OCRResult {
  fullTextAnnotation: {
    text: string;
    pages: OCRPage[];
  };
  textAnnotations: TextAnnotation[];
  confidence: number;
  processingTime: number;
}
```

#### Mixed Content Processing (Optimized Page Extracts)
```typescript
interface MixedContentExtraction {
  // Process pre-separated, optimized page extracts
  processOptimizedPages: (pages: OptimizedPageCollection) => Promise<MixedResult>;
  
  // Combine results from different extraction methods per page
  mergeExtractionResults: (results: ExtractionResult[]) => Promise<UnifiedResult>;
  
  // Maintain spatial consistency across pre-processed pages
  normalizeCoordinates: (results: ExtractionResult[]) => Promise<UnifiedResult>;
}

interface OptimizedPageExtraction {
  pageNumber: number;
  extractionMethod: 'direct_text' | 'ocr';  // Pre-determined by pre-processing
  optimizedVersion: string;                  // Pre-enhanced page file
  expectedAccuracy: number;                  // Based on pre-processing quality metrics
}
```

### 3. Spatial Coordinate System

#### Coordinate Standardization
```typescript
interface BoundingBox {
  page: number;           // 1-indexed page number
  x_min: number;          // Left edge (0.0-1.0 normalized)
  y_min: number;          // Top edge (0.0-1.0 normalized)  
  x_max: number;          // Right edge (0.0-1.0 normalized)
  y_max: number;          // Bottom edge (0.0-1.0 normalized)
  width: number;          // Calculated width
  height: number;         // Calculated height
  rotation?: number;      // Text rotation angle
}

// Coordinate system: (0,0) at top-left, normalized to page dimensions
const COORDINATE_SYSTEM = {
  origin: 'top_left',
  normalization: 'page_relative',  // 0.0-1.0 based on page width/height
  precision: 4,                    // 4 decimal places
  rotationSupport: true
};
```

#### Spatial Data Enrichment
```typescript
interface SpatialEnrichment {
  // Group nearby text blocks into logical units
  groupTextBlocks: (blocks: TextBlock[]) => TextGroup[];
  
  // Detect table structures from spatial layout
  detectTables: (blocks: TextBlock[]) => TableStructure[];
  
  // Identify headers, footers, and document structure
  analyzeDocumentLayout: (blocks: TextBlock[]) => DocumentStructure;
  
  // Calculate reading order based on spatial position
  determineReadingOrder: (blocks: TextBlock[]) => OrderedTextFlow;
}
```

### 4. Quality Assessment Framework

#### OCR Confidence Scoring
```typescript
interface QualityAssessment {
  // Overall document extraction quality
  documentConfidence: number;      // 0.0-1.0
  
  // Per-page quality metrics
  pageConfidences: number[];       // Per page scores
  
  // Text block confidence distribution
  blockConfidenceDistribution: ConfidenceStats;
  
  // Character-level accuracy estimates
  characterAccuracy: number;
  
  // Word-level confidence scores
  wordConfidences: WordConfidence[];
}

interface ConfidenceStats {
  mean: number;
  median: number;
  standardDeviation: number;
  lowConfidenceBlocks: number;     // Count of blocks < 0.7 confidence
}
```

#### Medical Content Validation
```typescript
interface MedicalTextValidation {
  // Detect medical terminology accuracy
  medicalTermAccuracy: number;
  
  // Validate numeric values (dosages, measurements)
  numericValueConsistency: boolean;
  
  // Check for common OCR errors in medical contexts
  commonErrorDetection: MedicalErrorCheck[];
  
  // Verify medication names and dosages
  medicationNameAccuracy: number;
}

interface MedicalErrorCheck {
  errorType: 'medication_name' | 'dosage' | 'measurement' | 'date';
  suspected: string;          // What OCR detected
  corrections: string[];      // Possible corrections
  confidence: number;         // Confidence in error detection
}
```

### 5. Multi-Page Coordination

#### Page Assembly Strategy
```typescript
interface MultiPageProcessor {
  // Coordinate page processing order
  processPageSequence: (pages: PageCollection) => Promise<ProcessedDocument>;
  
  // Handle page breaks and continuity
  maintainTextContinuity: (pages: ProcessedPage[]) => ContinuousText;
  
  // Merge spatial coordinates across pages
  unifyPageCoordinates: (pages: ProcessedPage[]) => GlobalCoordinateSystem;
  
  // Validate page completeness
  validatePageCompleteness: (pages: ProcessedPage[]) => ValidationResult;
}

interface ProcessedPage {
  pageNumber: number;
  textContent: string;
  textBlocks: TextBlock[];
  extractionMethod: 'direct' | 'ocr';
  confidence: number;
  processingTime: number;
}
```

#### Document Structure Recognition
```typescript
interface DocumentStructure {
  // Identify document sections
  sections: DocumentSection[];
  
  // Detect headers and footers
  headers: TextBlock[];
  footers: TextBlock[];
  
  // Find table structures
  tables: TableStructure[];
  
  // Identify form fields
  formFields: FormField[];
  
  // Detect signatures and stamps
  signatures: SignatureBlock[];
}
```

### 6. Cost Optimization Strategy

#### Provider Cost Management
```typescript
const OCR_COST_STRUCTURE = {
  directTextExtraction: {
    costPerPage: 0.0001,        // Nearly free for PDFs
    processingTime: '50ms',
    accuracy: '99.9%',          // For native text
    suitability: 'clean_pdfs_text_docs'
  },
  
  googleCloudVision: {
    costPerPage: 0.0015,        // $1.50 per 1000 pages
    processingTime: '2-3s',
    accuracy: '95-98%',         // For scanned documents
    suitability: 'scanned_images_complex_layouts'
  },
  
  hybridApproach: {
    averageCostPerDocument: 0.0008,  // Optimized mix
    timeEfficiency: '40% improvement',
    accuracyMaintenance: '>96%'
  }
};
```

#### Smart Processing Distribution
```typescript
interface ProcessingDistribution {
  expectedUsage: {
    directText: '95% of documents',
    googleVisionOCR: '3% of documents', 
    hybridProcessing: '2% of documents'
  };
  
  costOptimization: {
    totalSavings: '90% vs OCR-only approach',
    averageCostPerDoc: '$0.0002-0.0005',
    monthlyBudgetPredictability: 'high'
  };
}
```

### 7. Error Handling & Recovery

#### OCR Failure Recovery
```typescript
interface OCRErrorHandling {
  // Retry strategies for failed extractions
  retryStrategies: RetryStrategy[];
  
  // Fallback to alternative OCR providers
  fallbackProviders: OCRProvider[];
  
  // Manual review queue for failed extractions
  manualReviewTriggers: ReviewTrigger[];
  
  // Quality gates for acceptable extraction
  qualityThresholds: QualityThreshold[];
}

interface RetryStrategy {
  trigger: 'low_confidence' | 'extraction_failure' | 'timeout';
  action: 'retry_enhanced_image' | 'try_alternative_provider' | 'manual_review';
  maxAttempts: number;
  backoffStrategy: 'exponential' | 'fixed' | 'none';
}
```

#### Quality Gate System
```typescript
const QUALITY_GATES = {
  minimumDocumentConfidence: 0.7,    // Overall document must be >70% confident
  maximumLowConfidenceBlocks: 0.2,   // <20% of blocks can be low confidence
  requiredTextExtraction: 0.8,       // Must extract >80% of visible text
  medicalTermAccuracy: 0.85,         // Medical terms >85% accurate
  numericValueAccuracy: 0.95         // Numbers/dosages >95% accurate
};
```

## Integration Points

### Pre-Processing Integration
```typescript
interface PreProcessingHandoff {
  documentId: string;
  optimizedVersions: DocumentVersions;
  processingPath: ProcessingPath;
  qualityMetrics: QualityMetrics;
  recommendedOCRStrategy: OCRStrategy;
}
```

### AI Processing Handoff
```typescript
interface AIProcessingHandoff {
  documentId: string;
  extractedText: string;                    // Full document text
  spatialData: BoundingBox[];              // For click-to-zoom feature
  textBlocks: TextBlock[];                 // Structured text with coordinates
  documentStructure: DocumentStructure;    // Headers, tables, sections
  qualityMetrics: QualityAssessment;       // Confidence and accuracy data
  extractionMetadata: ExtractionMetadata;  // Processing details
}
```

## Performance Monitoring

### Extraction Quality Metrics
```typescript
interface ExtractionMetrics {
  // Accuracy measurements
  characterAccuracy: number;
  wordAccuracy: number; 
  medicalTermAccuracy: number;
  
  // Performance measurements
  averageProcessingTime: Record<OCRStrategy, number>;
  costPerDocument: Record<OCRStrategy, number>;
  
  // Quality distribution
  confidenceDistribution: ConfidenceHistogram;
  manualReviewRate: number;
}
```

### Cost Tracking Analytics
```typescript
interface CostAnalytics {
  monthlyProcessingCosts: number;
  costPerDocument: number;
  savingsFromDirectExtraction: number;
  providerCostBreakdown: Record<string, number>;
  costOptimizationOpportunities: string[];
}
```

## Implementation Phases

### Phase 1: Core OCR (MVP)
- Direct text extraction for PDFs
- Google Cloud Vision for scanned images
- Basic spatial coordinate capture
- Simple quality assessment

### Phase 2: Intelligence & Optimization
- Route-optimized extraction strategies
- Hybrid processing for mixed content
- Advanced spatial coordinate enrichment
- Cost optimization analytics

### Phase 3: Advanced Features
- Medical content validation
- Advanced document structure recognition
- Machine learning quality improvements
- Real-time performance optimization

## Success Criteria

- **Text Extraction Accuracy**: >96% character accuracy for medical documents
- **Cost Efficiency**: 90% cost reduction vs OCR-only approach
- **Processing Speed**: <500ms for fast path, <3s for slow path
- **Spatial Precision**: <2% coordinate error for click-to-zoom functionality
- **Medical Content Accuracy**: >95% accuracy for dosages and measurements

---

*This OCR processing architecture provides intelligent, cost-effective text extraction that delivers high-quality structured text with precise spatial coordinates, optimized for downstream AI analysis while maintaining healthcare-grade accuracy standards.*