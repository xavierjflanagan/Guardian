# GPT-4o Mini Vision Processing System

**Purpose:** Cost-effective medical document analysis using GPT-4o Mini for text extraction and clinical content identification  
**Focus:** Vision-based document processing, spatial coordinate extraction, and medical terminology recognition  
**Priority:** CRITICAL - Primary AI processing engine for cost-optimized extraction  
**Dependencies:** Document preprocessing, OpenAI API integration, medical knowledge bases

---

## System Overview

The GPT-4o Mini Vision Processing System provides the core AI processing engine for Guardian's document extraction pipeline. By leveraging GPT-4o Mini's vision and language capabilities, this system achieves 85-90% cost reduction compared to premium models while maintaining high accuracy for medical document processing.

### Cost-Performance Analysis
```yaml
cost_comparison:
  gpt4o_mini:
    cost_per_1k_documents: "$15-30"
    processing_time: "2-5 seconds per document"
    accuracy: "88-92% clinical accuracy"
    use_case: "Primary processing engine"
    
  gpt4_vision_premium:
    cost_per_1k_documents: "$250-400"
    processing_time: "3-8 seconds per document"
    accuracy: "94-98% clinical accuracy"
    use_case: "Complex case fallback only"
    
  cost_savings: "85-90% reduction with GPT-4o Mini"
  quality_tradeoff: "4-6% accuracy reduction acceptable with medical review fallback"
```

---

## GPT-4o Mini Integration Architecture

### Vision Model Configuration
```typescript
interface GPT4oMiniConfig {
  // Model parameters
  model: 'gpt-4o-mini';
  maxTokens: 4096;                    // Sufficient for medical documents
  temperature: 0.1;                   // Low temperature for consistent medical extraction
  topP: 0.95;                         // Focused sampling for medical accuracy
  
  // Vision-specific settings
  imageResolution: 'high';            // High resolution for medical document clarity
  detailLevel: 'high';               // Detailed analysis for medical terminology
  ocrEnhancement: true;              // Enhanced OCR for handwritten notes
  
  // Cost optimization
  batchSize: 10;                     // Process multiple documents per request
  caching: true;                     // Cache similar medical content
  responseStreaming: true;           // Stream responses for faster processing
  
  // Quality controls
  confidenceThreshold: 0.7;          // Minimum confidence for auto-acceptance
  multiPassEnabled: true;            // Multiple passes for complex documents
  fallbackStrategy: 'human_review';  // Fallback for low confidence results
}

class GPT4oMiniProcessor {
  private readonly openaiClient: OpenAI;
  private readonly config: GPT4oMiniConfig;
  private readonly medicalKnowledge: MedicalKnowledgeBase;
  
  constructor(apiKey: string, config: GPT4oMiniConfig) {
    this.openaiClient = new OpenAI({ apiKey });
    this.config = config;
    this.medicalKnowledge = new MedicalKnowledgeBase();
  }

  async processDocument(
    documentPath: string,
    documentMetadata: DocumentMetadata
  ): Promise<GPT4oMiniResult> {
    
    try {
      // Prepare document for AI processing
      const preparedDocument = await this.prepareDocument(documentPath, documentMetadata);
      
      // Generate medical-optimized prompt
      const prompt = await this.generateMedicalPrompt(preparedDocument);
      
      // Process with GPT-4o Mini
      const aiResponse = await this.callGPT4oMini(preparedDocument.imageData, prompt);
      
      // Parse and validate response
      const parsedResult = await this.parseAndValidate(aiResponse, preparedDocument);
      
      // Calculate processing metrics
      const metrics = this.calculateProcessingMetrics(aiResponse, parsedResult);
      
      return {
        extractedContent: parsedResult.content,
        confidence: parsedResult.confidence,
        spatialData: parsedResult.spatialCoordinates,
        processingMetrics: metrics,
        cost: this.estimateProcessingCost(aiResponse),
        qualityFlags: parsedResult.qualityFlags
      };
      
    } catch (error) {
      console.error('GPT-4o Mini processing failed:', error);
      return this.handleProcessingError(error, documentPath);
    }
  }

  private async prepareDocument(
    documentPath: string,
    metadata: DocumentMetadata
  ): Promise<PreparedDocument> {
    
    // Image optimization for AI processing
    const optimizedImage = await this.optimizeImageForAI(documentPath);
    
    // Document type detection for prompt optimization
    const documentType = await this.detectDocumentType(optimizedImage, metadata);
    
    // Medical context preparation
    const medicalContext = await this.prepareMedicalContext(documentType, metadata);
    
    return {
      imageData: optimizedImage,
      documentType,
      medicalContext,
      metadata,
      processingHints: await this.generateProcessingHints(documentType)
    };
  }

  private async optimizeImageForAI(documentPath: string): Promise<OptimizedImageData> {
    // Load and analyze image
    const imageBuffer = await fs.readFile(documentPath);
    const imageMetadata = await this.analyzeImageMetadata(imageBuffer);
    
    // Optimize for AI processing
    let optimizedBuffer = imageBuffer;
    
    // Resolution optimization
    if (imageMetadata.width > 2048 || imageMetadata.height > 2048) {
      optimizedBuffer = await this.resizeImage(optimizedBuffer, { maxWidth: 2048, maxHeight: 2048 });
    }
    
    // Contrast enhancement for medical documents
    if (this.isMedicalDocument(imageMetadata)) {
      optimizedBuffer = await this.enhanceContrast(optimizedBuffer);
    }
    
    // Noise reduction for scanned documents
    if (this.isScannedDocument(imageMetadata)) {
      optimizedBuffer = await this.reduceNoise(optimizedBuffer);
    }
    
    // Convert to base64 for API
    const base64Image = optimizedBuffer.toString('base64');
    
    return {
      base64Data: base64Image,
      mimeType: imageMetadata.mimeType,
      dimensions: { width: imageMetadata.width, height: imageMetadata.height },
      optimizations: this.getAppliedOptimizations(),
      estimatedTokens: this.estimateImageTokens(optimizedBuffer)
    };
  }
}
```

---

## Medical Document Processing Strategies

### Document Type-Specific Processing
```typescript
class DocumentTypeProcessor {
  async processLabResults(
    preparedDocument: PreparedDocument
  ): Promise<LabResultsExtraction> {
    
    const labPrompt = this.buildLabResultsPrompt();
    const response = await this.callGPT4oMini(preparedDocument.imageData, labPrompt);
    
    return {
      patientInformation: response.patientInfo,
      testResults: response.tests.map(test => ({
        testName: test.name,
        value: test.value,
        unit: test.unit,
        referenceRange: test.referenceRange,
        abnormalFlag: test.flag,
        loincCode: test.loincCode || null,
        confidence: test.confidence,
        spatialLocation: test.coordinates
      })),
      orderingProvider: response.provider,
      reportDate: response.date,
      confidence: response.overallConfidence
    };
  }

  async processPrescription(
    preparedDocument: PreparedDocument
  ): Promise<PrescriptionExtraction> {
    
    const prescriptionPrompt = this.buildPrescriptionPrompt();
    const response = await this.callGPT4oMini(preparedDocument.imageData, prescriptionPrompt);
    
    return {
      patientInformation: response.patientInfo,
      medications: response.medications.map(med => ({
        medicationName: med.name,
        genericName: med.generic,
        strength: med.strength,
        dosage: med.dosage,
        quantity: med.quantity,
        directions: med.directions,
        prescriber: med.prescriber,
        rxNumber: med.rxNumber,
        ndcCode: med.ndcCode || null,
        confidence: med.confidence,
        spatialLocation: med.coordinates
      })),
      pharmacy: response.pharmacy,
      prescriptionDate: response.date,
      confidence: response.overallConfidence
    };
  }

  async processClinicalNotes(
    preparedDocument: PreparedDocument
  ): Promise<ClinicalNotesExtraction> {
    
    const clinicalPrompt = this.buildClinicalNotesPrompt();
    const response = await this.callGPT4oMini(preparedDocument.imageData, clinicalPrompt);
    
    return {
      patientInformation: response.patientInfo,
      clinicalFindings: response.findings.map(finding => ({
        category: finding.category,
        description: finding.description,
        severity: finding.severity,
        bodySystem: finding.bodySystem,
        snomedCode: finding.snomedCode || null,
        confidence: finding.confidence,
        spatialLocation: finding.coordinates
      })),
      assessmentAndPlan: response.assessmentPlan,
      provider: response.provider,
      visitDate: response.date,
      confidence: response.overallConfidence
    };
  }

  private buildLabResultsPrompt(): string {
    return `
Analyze this laboratory results document and extract all medical information.

EXTRACTION REQUIREMENTS:

1. PATIENT INFORMATION:
   - Full name (as printed on report)
   - Date of birth
   - Medical record number or patient ID
   - Address (if visible)

2. LABORATORY TESTS:
   - Test name (exactly as shown)
   - Result value with units
   - Reference range (normal values)
   - Abnormal flags (H, L, Critical, etc.)
   - Collection date and time
   - LOINC code if available

3. PROVIDER INFORMATION:
   - Ordering physician name
   - Laboratory facility name
   - Report date and time

4. SPATIAL COORDINATES:
   - For each extracted piece of information, provide x,y coordinates
   - Use percentage-based coordinates (0-100% of document width/height)

RESPONSE FORMAT (JSON):
{
  "patientInfo": {
    "name": "string",
    "dateOfBirth": "YYYY-MM-DD",
    "mrn": "string",
    "coordinates": {"x": 0, "y": 0, "width": 100, "height": 20}
  },
  "tests": [
    {
      "name": "Complete Blood Count",
      "value": "12.5",
      "unit": "g/dL",
      "referenceRange": "12.0-15.5 g/dL",
      "flag": "Normal",
      "loincCode": "718-7",
      "confidence": 0.95,
      "coordinates": {"x": 10, "y": 30, "width": 80, "height": 15}
    }
  ],
  "provider": {
    "orderingPhysician": "Dr. Jane Smith",
    "laboratory": "Guardian Medical Lab",
    "coordinates": {"x": 0, "y": 90, "width": 100, "height": 10}
  },
  "reportDate": "2024-08-19",
  "overallConfidence": 0.92
}

IMPORTANT GUIDELINES:
- Be precise with numerical values and units
- Include confidence scores (0-1) for each extraction
- Mark unclear or partially visible text with lower confidence
- Preserve exact formatting for medication names and medical terminology
- Include spatial coordinates for click-to-zoom functionality
`;
  }

  private buildPrescriptionPrompt(): string {
    return `
Analyze this prescription document and extract all medication information.

EXTRACTION REQUIREMENTS:

1. PATIENT INFORMATION:
   - Patient name (exactly as on prescription)
   - Date of birth
   - Address (if visible)
   - Phone number (if visible)

2. MEDICATIONS:
   - Medication name (brand and generic if both shown)
   - Strength/concentration
   - Dosage form (tablet, capsule, liquid, etc.)
   - Quantity prescribed
   - Directions for use (exactly as written)
   - Number of refills
   - NDC number (if visible)

3. PRESCRIBER INFORMATION:
   - Prescriber name
   - Medical license number (if visible)
   - DEA number (if visible)
   - Clinic/practice name
   - Prescription date

4. PHARMACY INFORMATION:
   - Pharmacy name
   - Pharmacy address
   - Prescription number (Rx #)
   - Date filled

RESPONSE FORMAT (JSON):
{
  "patientInfo": {
    "name": "string",
    "dateOfBirth": "YYYY-MM-DD",
    "address": "string",
    "coordinates": {"x": 0, "y": 0, "width": 100, "height": 25}
  },
  "medications": [
    {
      "name": "Lisinopril",
      "generic": "lisinopril",
      "strength": "10mg",
      "dosage": "Take 1 tablet by mouth daily",
      "quantity": "30 tablets",
      "refills": "5",
      "ndcCode": "0781-1506-01",
      "confidence": 0.93,
      "coordinates": {"x": 5, "y": 35, "width": 90, "height": 20}
    }
  ],
  "prescriber": {
    "name": "Dr. John Doe, MD",
    "licenseNumber": "12345",
    "clinic": "Guardian Medical Clinic",
    "coordinates": {"x": 0, "y": 70, "width": 50, "height": 15}
  },
  "pharmacy": {
    "name": "Guardian Pharmacy",
    "address": "123 Health St, Medical City",
    "rxNumber": "RX123456789",
    "dateFilled": "2024-08-19",
    "coordinates": {"x": 50, "y": 70, "width": 50, "height": 15}
  },
  "prescriptionDate": "2024-08-15",
  "overallConfidence": 0.89
}

IMPORTANT GUIDELINES:
- Distinguish between brand names and generic names
- Extract directions exactly as written (including abbreviations)
- Include all visible medication details
- Provide confidence scores for medication safety
- Capture spatial coordinates for verification
`;
  }
}
```

---

## Quality Assurance and Validation

### Confidence Scoring Framework
```typescript
class GPT4oMiniQualityAssurance {
  async validateExtraction(
    extractionResult: GPT4oMiniResult,
    originalDocument: PreparedDocument
  ): Promise<QualityValidationResult> {
    
    const validationChecks: QualityCheck[] = [];
    
    // Text extraction completeness
    const completenessCheck = await this.validateCompleteness(
      extractionResult,
      originalDocument
    );
    validationChecks.push(completenessCheck);
    
    // Medical terminology accuracy
    const terminologyCheck = await this.validateMedicalTerminology(
      extractionResult.extractedContent
    );
    validationChecks.push(terminologyCheck);
    
    // Spatial coordinate accuracy
    const spatialCheck = await this.validateSpatialCoordinates(
      extractionResult.spatialData,
      originalDocument
    );
    validationChecks.push(spatialCheck);
    
    // Clinical logic consistency
    const logicCheck = await this.validateClinicalLogic(
      extractionResult.extractedContent
    );
    validationChecks.push(logicCheck);
    
    // Overall quality assessment
    const overallQuality = this.calculateOverallQuality(validationChecks);
    
    return {
      isValid: overallQuality.score > 0.7,
      qualityScore: overallQuality.score,
      validationChecks,
      recommendedAction: this.determineRecommendedAction(overallQuality),
      improvementSuggestions: this.generateImprovementSuggestions(validationChecks)
    };
  }

  private async validateMedicalTerminology(
    extractedContent: ExtractedContent
  ): Promise<TerminologyValidationCheck> {
    
    const terminologyIssues: TerminologyIssue[] = [];
    
    // Validate medical condition names
    for (const condition of extractedContent.conditions) {
      const validation = await this.medicalKnowledge.validateCondition(condition.name);
      
      if (!validation.isValid) {
        terminologyIssues.push({
          type: 'invalid_condition',
          text: condition.name,
          suggestion: validation.suggestions[0],
          confidence: condition.confidence,
          location: condition.spatialLocation
        });
      }
    }
    
    // Validate medication names and dosages
    for (const medication of extractedContent.medications) {
      const validation = await this.medicalKnowledge.validateMedication(
        medication.name,
        medication.dosage
      );
      
      if (!validation.isValid) {
        terminologyIssues.push({
          type: 'invalid_medication',
          text: `${medication.name} ${medication.dosage}`,
          suggestion: validation.suggestions[0],
          confidence: medication.confidence,
          location: medication.spatialLocation
        });
      }
    }
    
    // Validate procedure names
    for (const procedure of extractedContent.procedures) {
      const validation = await this.medicalKnowledge.validateProcedure(procedure.name);
      
      if (!validation.isValid) {
        terminologyIssues.push({
          type: 'invalid_procedure',
          text: procedure.name,
          suggestion: validation.suggestions[0],
          confidence: procedure.confidence,
          location: procedure.spatialLocation
        });
      }
    }
    
    const terminologyScore = terminologyIssues.length === 0 ? 1.0 :
      Math.max(0.1, 1.0 - (terminologyIssues.length * 0.1));
    
    return {
      checkType: 'medical_terminology',
      passed: terminologyIssues.length === 0,
      score: terminologyScore,
      issues: terminologyIssues,
      confidence: 0.85,
      description: terminologyIssues.length === 0 ? 
        'All medical terminology validated' : 
        `${terminologyIssues.length} terminology issues detected`
    };
  }

  private async validateSpatialCoordinates(
    spatialData: SpatialCoordinate[],
    originalDocument: PreparedDocument
  ): Promise<SpatialValidationCheck> {
    
    const spatialIssues: SpatialIssue[] = [];
    
    for (const coordinate of spatialData) {
      // Validate coordinate bounds
      if (coordinate.x < 0 || coordinate.x > 100 ||
          coordinate.y < 0 || coordinate.y > 100) {
        spatialIssues.push({
          type: 'out_of_bounds',
          coordinate,
          description: 'Coordinate outside document bounds'
        });
      }
      
      // Validate coordinate precision
      if (coordinate.width < 1 || coordinate.height < 1) {
        spatialIssues.push({
          type: 'insufficient_precision',
          coordinate,
          description: 'Coordinate region too small for accurate click-to-zoom'
        });
      }
      
      // Validate coordinate overlap (should be minimal)
      const overlaps = this.findOverlappingCoordinates(coordinate, spatialData);
      if (overlaps.length > 1) { // Coordinate overlaps with others
        spatialIssues.push({
          type: 'excessive_overlap',
          coordinate,
          description: `Coordinate overlaps with ${overlaps.length - 1} other regions`
        });
      }
    }
    
    const spatialScore = spatialIssues.length === 0 ? 1.0 :
      Math.max(0.3, 1.0 - (spatialIssues.length * 0.05));
    
    return {
      checkType: 'spatial_coordinates',
      passed: spatialIssues.length === 0,
      score: spatialScore,
      issues: spatialIssues,
      confidence: 0.9,
      description: spatialIssues.length === 0 ? 
        'All spatial coordinates valid' : 
        `${spatialIssues.length} spatial coordinate issues detected`
    };
  }
}
```

---

## Cost Optimization Strategies

### Intelligent Cost Management
```typescript
class GPT4oMiniCostOptimizer {
  private readonly costTracker: CostTracker;
  private readonly usagePredictor: UsagePredictor;
  
  async optimizeProcessingCost(
    documents: PreparedDocument[],
    budgetConstraints: BudgetConstraints
  ): Promise<OptimizedProcessingPlan> {
    
    // Analyze documents for processing complexity
    const complexityAnalysis = await this.analyzeDocumentComplexity(documents);
    
    // Group documents by similarity for batch processing
    const documentGroups = await this.groupSimilarDocuments(documents);
    
    // Generate cost-optimized processing plan
    const processingPlan = await this.generateProcessingPlan(
      documentGroups,
      complexityAnalysis,
      budgetConstraints
    );
    
    // Estimate total cost and processing time
    const costEstimate = await this.estimateTotalCost(processingPlan);
    
    return {
      processingPlan,
      estimatedCost: costEstimate.totalCost,
      estimatedTime: costEstimate.totalTime,
      costBreakdown: costEstimate.breakdown,
      optimizationStrategies: costEstimate.appliedOptimizations
    };
  }

  private async analyzeDocumentComplexity(
    documents: PreparedDocument[]
  ): Promise<ComplexityAnalysis[]> {
    
    return Promise.all(documents.map(async doc => {
      const complexity = await this.calculateDocumentComplexity(doc);
      
      return {
        documentId: doc.metadata.id,
        complexityScore: complexity.score,
        complexityFactors: complexity.factors,
        recommendedStrategy: this.getRecommendedStrategy(complexity.score),
        estimatedCost: this.estimateCostForComplexity(complexity.score),
        estimatedTime: this.estimateTimeForComplexity(complexity.score)
      };
    }));
  }

  private async calculateDocumentComplexity(
    document: PreparedDocument
  ): Promise<DocumentComplexity> {
    
    const complexityFactors: ComplexityFactor[] = [];
    let complexityScore = 0.5; // Base complexity
    
    // Image quality and clarity
    const imageQuality = await this.assessImageQuality(document.imageData);
    if (imageQuality.score < 0.7) {
      complexityScore += 0.2;
      complexityFactors.push({
        factor: 'poor_image_quality',
        impact: 0.2,
        description: 'Low image quality requires enhanced processing'
      });
    }
    
    // Document type complexity
    const documentType = document.documentType;
    if (documentType === 'handwritten_notes' || documentType === 'complex_report') {
      complexityScore += 0.3;
      complexityFactors.push({
        factor: 'complex_document_type',
        impact: 0.3,
        description: 'Document type requires advanced AI processing'
      });
    }
    
    // Text density and layout complexity
    const layoutComplexity = await this.assessLayoutComplexity(document.imageData);
    if (layoutComplexity.score > 0.7) {
      complexityScore += 0.15;
      complexityFactors.push({
        factor: 'complex_layout',
        impact: 0.15,
        description: 'Complex document layout increases processing requirements'
      });
    }
    
    // Medical terminology density
    const terminologyDensity = await this.assessTerminologyDensity(document);
    if (terminologyDensity.score > 0.8) {
      complexityScore += 0.1;
      complexityFactors.push({
        factor: 'high_terminology_density',
        impact: 0.1,
        description: 'High medical terminology density requires specialized processing'
      });
    }
    
    return {
      score: Math.min(complexityScore, 1.0),
      factors: complexityFactors,
      totalFactors: complexityFactors.length,
      assessmentConfidence: 0.8
    };
  }

  private getRecommendedStrategy(complexityScore: number): ProcessingStrategy {
    if (complexityScore < 0.3) {
      return {
        strategy: 'basic_ocr',
        description: 'Simple document - use basic OCR extraction',
        estimatedCost: 0.001,
        aiModelUsage: 'none'
      };
    } else if (complexityScore < 0.6) {
      return {
        strategy: 'gpt4o_mini_standard',
        description: 'Standard GPT-4o Mini processing',
        estimatedCost: 0.02,
        aiModelUsage: 'gpt-4o-mini'
      };
    } else if (complexityScore < 0.8) {
      return {
        strategy: 'gpt4o_mini_enhanced',
        description: 'Multi-pass GPT-4o Mini with specialized prompts',
        estimatedCost: 0.04,
        aiModelUsage: 'gpt-4o-mini-multipass'
      };
    } else {
      return {
        strategy: 'premium_fallback',
        description: 'Complex document - fallback to premium model if needed',
        estimatedCost: 0.25,
        aiModelUsage: 'gpt-4-vision-premium'
      };
    }
  }

  async monitorCostUsage(
    processingSession: ProcessingSession
  ): Promise<CostMonitoringResult> {
    
    const currentUsage = await this.costTracker.getCurrentUsage(processingSession.sessionId);
    const budgetStatus = await this.costTracker.checkBudgetStatus(processingSession.userId);
    
    // Predict future costs based on remaining documents
    const remainingDocuments = processingSession.totalDocuments - processingSession.processedDocuments;
    const predictedCost = await this.usagePredictor.predictCost(
      remainingDocuments,
      processingSession.averageComplexity
    );
    
    // Generate cost alerts if necessary
    const alerts = await this.generateCostAlerts(currentUsage, budgetStatus, predictedCost);
    
    // Recommend cost optimization actions
    const optimizationRecommendations = await this.generateOptimizationRecommendations(
      processingSession,
      budgetStatus
    );
    
    return {
      currentCost: currentUsage.totalCost,
      budgetRemaining: budgetStatus.remainingBudget,
      predictedTotalCost: currentUsage.totalCost + predictedCost.estimatedCost,
      costAlerts: alerts,
      optimizationRecommendations,
      costBreakdown: currentUsage.breakdown,
      utilizationMetrics: {
        documentsProcessed: processingSession.processedDocuments,
        averageCostPerDocument: currentUsage.totalCost / processingSession.processedDocuments,
        processingEfficiency: processingSession.successRate
      }
    };
  }
}
```

---

## Error Handling and Resilience

### Robust Error Recovery
```typescript
class GPT4oMiniErrorHandler {
  async handleProcessingError(
    error: ProcessingError,
    document: PreparedDocument,
    retryAttempt: number = 0
  ): Promise<ErrorHandlingResult> {
    
    const maxRetries = 3;
    
    switch (error.type) {
      case 'rate_limit_exceeded':
        return this.handleRateLimitError(error, document, retryAttempt);
        
      case 'content_policy_violation':
        return this.handleContentPolicyError(error, document);
        
      case 'model_unavailable':
        return this.handleModelUnavailableError(error, document, retryAttempt);
        
      case 'parsing_error':
        return this.handleParsingError(error, document, retryAttempt);
        
      case 'low_confidence_result':
        return this.handleLowConfidenceError(error, document);
        
      default:
        return this.handleUnknownError(error, document, retryAttempt);
    }
  }

  private async handleRateLimitError(
    error: RateLimitError,
    document: PreparedDocument,
    retryAttempt: number
  ): Promise<ErrorHandlingResult> {
    
    if (retryAttempt >= 3) {
      return {
        success: false,
        errorType: 'rate_limit_exceeded',
        message: 'Maximum retry attempts exceeded for rate limit',
        recommendedAction: 'queue_for_later_processing',
        fallbackStrategy: 'ocr_extraction'
      };
    }
    
    // Calculate intelligent backoff delay
    const backoffDelay = this.calculateExponentialBackoff(retryAttempt, error.retryAfter);
    
    // Queue document for retry with delay
    await this.queueForRetry(document, backoffDelay);
    
    return {
      success: false,
      errorType: 'rate_limit_exceeded',
      message: `Rate limit exceeded, retrying in ${backoffDelay}ms`,
      recommendedAction: 'retry_with_backoff',
      retryDelay: backoffDelay,
      retryAttempt: retryAttempt + 1
    };
  }

  private async handleModelUnavailableError(
    error: ModelUnavailableError,
    document: PreparedDocument,
    retryAttempt: number
  ): Promise<ErrorHandlingResult> {
    
    // Check if alternative models are available
    const alternativeModels = await this.getAvailableAlternativeModels();
    
    if (alternativeModels.length > 0 && retryAttempt < 2) {
      const fallbackModel = alternativeModels[0];
      
      return {
        success: false,
        errorType: 'model_unavailable',
        message: `Primary model unavailable, switching to ${fallbackModel.name}`,
        recommendedAction: 'use_alternative_model',
        alternativeModel: fallbackModel,
        costImpact: this.calculateCostImpact(fallbackModel)
      };
    }
    
    // No alternative models available - use OCR fallback
    const ocrResult = await this.performOCRFallback(document);
    
    return {
      success: true,
      errorType: 'model_unavailable',
      message: 'Used OCR fallback due to model unavailability',
      recommendedAction: 'ocr_fallback_completed',
      result: ocrResult,
      qualityWarning: 'OCR fallback may have lower accuracy than AI processing'
    };
  }

  private async handleLowConfidenceError(
    error: LowConfidenceError,
    document: PreparedDocument
  ): Promise<ErrorHandlingResult> {
    
    // Try multi-pass processing with different prompts
    const multiPassResult = await this.tryMultiPassProcessing(document);
    
    if (multiPassResult.confidence > error.minimumConfidence) {
      return {
        success: true,
        errorType: 'low_confidence_resolved',
        message: 'Multi-pass processing improved confidence',
        recommendedAction: 'accept_multipass_result',
        result: multiPassResult
      };
    }
    
    // Flag for human review
    await this.flagForHumanReview(document, error.confidence);
    
    return {
      success: false,
      errorType: 'low_confidence_result',
      message: `Confidence ${error.confidence} below threshold ${error.minimumConfidence}`,
      recommendedAction: 'human_review_required',
      humanReviewQueued: true,
      partialResult: error.partialResult
    };
  }

  private async tryMultiPassProcessing(
    document: PreparedDocument
  ): Promise<MultiPassResult> {
    
    const passes: ProcessingPass[] = [
      { strategy: 'standard_prompt', temperature: 0.1 },
      { strategy: 'detailed_prompt', temperature: 0.05 },
      { strategy: 'medical_specialist_prompt', temperature: 0.0 }
    ];
    
    const results: PassResult[] = [];
    
    for (const pass of passes) {
      try {
        const prompt = await this.generatePromptForStrategy(pass.strategy, document);
        const result = await this.callGPT4oMini(
          document.imageData,
          prompt,
          { temperature: pass.temperature }
        );
        
        results.push({
          strategy: pass.strategy,
          result,
          confidence: result.confidence,
          cost: result.estimatedCost
        });
        
        // Early exit if we achieve high confidence
        if (result.confidence > 0.85) {
          break;
        }
        
      } catch (passError) {
        console.warn(`Multi-pass strategy ${pass.strategy} failed:`, passError);
        continue;
      }
    }
    
    // Select best result or combine results
    const bestResult = this.selectBestResult(results);
    const combinedResult = await this.combineResults(results);
    
    return combinedResult.confidence > bestResult.confidence ? combinedResult : bestResult;
  }
}
```

---

*GPT-4o Mini Vision Processing provides Guardian with cost-effective, high-quality medical document analysis, delivering 85-90% cost savings while maintaining clinical accuracy through intelligent processing strategies, comprehensive quality assurance, and robust error handling mechanisms.*