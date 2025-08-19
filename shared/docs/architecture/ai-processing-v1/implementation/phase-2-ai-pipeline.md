# Phase 2: AI-First Processing Pipeline

**Purpose:** Implement core AI-first multimodal processing with OCR adjunct capabilities  
**Duration:** 2 days 
**Status:** Design Phase - Ready for development  
**Last updated:** August 18, 2025

---

## **Overview**

Phase 2 establishes the core AI-first processing pipeline that processes raw documents directly with multimodal AI models while using OCR as optional adjunct context. This phase builds on Phase 1's intake screening to provide high-quality medical data extraction with cost optimization.

## **Objectives**

### **Primary Goals**
1. **Multimodal AI Processing**: Direct processing of document images with AI vision models
2. **OCR Adjunct Integration**: Optional OCR context injection for enhanced accuracy
3. **Provider Routing**: Cost-based selection between GPT-4o Mini, Azure OpenAI, and Document AI
4. **Quality Assurance**: Confidence scoring and human review workflows
5. **Data Storage**: Structured medical entity extraction and storage

### **Success Criteria**
- AI processing pipeline handles >95% of health documents successfully
- Average processing time <2 minutes per document
- Medical data accuracy >98% on test dataset
- Cost per document <$0.03 (including AI and OCR when used)
- Zero PHI exposure in logs or debug output

---

## **Architecture Components**

### **AI Processing Workers**
```typescript
// Worker architecture on Render.com
class AIProcessingWorker {
  private aiProvider: AIProviderInterface;
  private ocrProvider: GoogleVisionProvider;
  private qualityValidator: QualityValidator;
  private entityExtractor: MedicalEntityExtractor;

  async processDocument(job: DocumentProcessingJob): Promise<ProcessingResult> {
    // 1. Download document from Supabase Storage
    const documentBuffer = await this.downloadDocument(job.storage_path);
    
    // 2. Select processing strategy
    const strategy = await this.selectProcessingStrategy(job.metadata);
    
    // 3. Execute AI-first processing
    const aiResult = await this.executeAIProcessing(documentBuffer, strategy);
    
    // 4. Execute OCR adjunct (if enabled)
    const ocrResult = strategy.useOCR ? 
      await this.executeOCRProcessing(documentBuffer) : null;
    
    // 5. Fuse results and validate quality
    const fusedResult = await this.fuseAndValidate(aiResult, ocrResult);
    
    // 6. Extract and normalize medical entities
    const entities = await this.extractMedicalEntities(fusedResult);
    
    // 7. Store results and update status
    await this.storeProcessingResults(job.document_id, entities, fusedResult);
    
    return fusedResult;
  }
}
```

### **AI Provider Interface**
```typescript
interface AIProviderInterface {
  name: string;
  costPerRequest: number;
  maxDocumentSize: number;
  supportsMultipage: boolean;
  
  async extractMedicalData(input: AIProcessingInput): Promise<AIExtractionResult>;
}

// Provider implementations
class GPT4oMiniProvider implements AIProviderInterface {
  name = 'gpt4o-mini';
  costPerRequest = 0.015; // ~$15 per 1K documents
  maxDocumentSize = 10 * 1024 * 1024; // 10MB
  supportsMultipage = false;
  
  async extractMedicalData(input: AIProcessingInput): Promise<AIExtractionResult> {
    const response = await this.openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: this.buildMedicalExtractionPrompt(input.context) },
            { type: 'image_url', image_url: { url: input.imageDataUrl } }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.1
    });
    
    return this.parseAIResponse(response);
  }
}

class AzureOpenAIProvider implements AIProviderInterface {
  name = 'azure-openai';
  costPerRequest = 0.020; // Slightly higher for HIPAA compliance
  maxDocumentSize = 10 * 1024 * 1024;
  supportsMultipage = false;
  
  // HIPAA-compliant processing with BAA
  async extractMedicalData(input: AIProcessingInput): Promise<AIExtractionResult> {
    // Use Azure OpenAI with signed BAA for PHI processing
    // Implementation similar to GPT4oMiniProvider but with Azure endpoint
  }
}
```

### **OCR Adjunct System**
```typescript
class OCRAdjunctProcessor {
  async processWithStrategy(
    document: DocumentBuffer,
    strategy: OCRAdjunctStrategy
  ): Promise<OCRResult | null> {
    
    switch (strategy) {
      case 'validation':
        // Use OCR to validate AI extractions
        return await this.validateWithOCR(document);
        
      case 'enhancement':
        // Provide OCR context to improve AI processing
        return await this.enhanceWithOCR(document);
        
      case 'fallback':
        // Use OCR when AI fails or has low confidence
        return await this.fallbackToOCR(document);
        
      case 'redundancy':
        // Run both AI and OCR for maximum accuracy
        return await this.redundantProcessing(document);
        
      default:
        return null;
    }
  }
  
  private async validateWithOCR(document: DocumentBuffer): Promise<OCRResult> {
    const ocrText = await this.googleVision.extractText(document);
    
    return {
      strategy: 'validation',
      fullText: ocrText.text,
      confidence: ocrText.confidence,
      boundingBoxes: ocrText.boundingBoxes,
      structuredData: this.extractStructuredElements(ocrText),
      processingTime: ocrText.processingTime,
      cost: 0.0015 // ~$1.50 per 1K documents
    };
  }
}
```

---

## **Implementation Schedule**

### **AI Provider Infrastructure**
**Deliverables:**
- AI provider interface and base classes
- GPT-4o Mini provider implementation  
- Azure OpenAI provider with HIPAA compliance
- Provider routing and fallback logic
- Cost tracking and budget controls

**Tasks:**
```typescript
// Provider factory with cost-based routing
class AIProviderFactory {
  static selectProvider(
    document: DocumentMetadata,
    budget: ProcessingBudget,
    userPreferences: UserPreferences
  ): AIProviderInterface {
    
    // Cost-based routing logic
    if (budget.remainingDaily < 0.02) {
      return new GPT4oMiniProvider(); // Cheapest option
    }
    
    // HIPAA requirement for PHI documents
    if (document.containsPHI || userPreferences.requireHIPAA) {
      return new AzureOpenAIProvider();
    }
    
    // Default to cost-optimized provider
    return new GPT4oMiniProvider();
  }
}

// Medical data extraction prompt engineering
const MEDICAL_EXTRACTION_PROMPT = `
Extract medical information from this document with high precision:

REQUIRED FIELDS:
- Patient demographics (name, DOB, MRN if visible)
- Document type and date
- Healthcare provider information
- Medical conditions and diagnoses
- Medications with dosages and frequencies
- Laboratory results with values and units
- Procedures and treatments
- Allergies and adverse reactions

OUTPUT FORMAT: Return structured JSON with confidence scores for each field.
CONFIDENCE SCORING: Use 0.0-1.0 scale based on text clarity and medical validity.
PHI HANDLING: Extract necessary clinical data while noting privacy sensitivity.

Document image follows:
`;
```

### **OCR Adjunct Integration**
**Deliverables:**
- Google Cloud Vision OCR integration
- OCR adjunct strategy implementations
- AI-OCR fusion algorithms
- Quality comparison and confidence boosting

**Tasks:**
```typescript
// OCR-AI fusion for enhanced accuracy
class ResultFusionEngine {
  async fuseResults(
    aiResult: AIExtractionResult,
    ocrResult: OCRResult | null,
    strategy: FusionStrategy
  ): Promise<FusedResult> {
    
    if (!ocrResult) {
      return { ...aiResult, fusionMethod: 'ai_only' };
    }
    
    const fusedData: MedicalExtraction = {
      medications: await this.fuseMedications(aiResult.medications, ocrResult),
      conditions: await this.fuseConditions(aiResult.conditions, ocrResult),
      labResults: await this.fuseLabResults(aiResult.labResults, ocrResult),
      procedures: await this.fuseProcedures(aiResult.procedures, ocrResult),
      demographics: await this.fuseDemographics(aiResult.demographics, ocrResult)
    };
    
    const confidenceScore = this.calculateFusedConfidence(aiResult, ocrResult, fusedData);
    
    return {
      ...fusedData,
      overallConfidence: confidenceScore,
      fusionMethod: strategy,
      aiConfidence: aiResult.overallConfidence,
      ocrConfidence: ocrResult.confidence,
      agreementScore: this.calculateAgreementScore(aiResult, ocrResult)
    };
  }
  
  private async fuseMedications(
    aiMeds: Medication[],
    ocrResult: OCRResult
  ): Promise<Medication[]> {
    
    const fusedMedications: Medication[] = [];
    
    for (const aiMed of aiMeds) {
      // Cross-validate medication names with OCR text
      const ocrValidation = this.validateMedicationInText(aiMed, ocrResult.fullText);
      
      const fusedMed: Medication = {
        ...aiMed,
        confidence: ocrValidation.found ? 
          Math.min(aiMed.confidence + 0.1, 1.0) : // Boost confidence if validated
          aiMed.confidence * 0.9, // Slight penalty if not found
        validationMethod: ocrValidation.found ? 'ai_ocr_validated' : 'ai_only',
        ocrValidation: {
          found: ocrValidation.found,
          similarity: ocrValidation.similarity,
          extractedText: ocrValidation.matchedText
        }
      };
      
      fusedMedications.push(fusedMed);
    }
    
    return fusedMedications;
  }
}
```

### **Quality Assurance & Medical Entity Extraction**
**Deliverables:**
- Medical entity normalization system
- Quality validation algorithms
- Human review workflow triggers
- Structured data storage schemas

**Tasks:**
```typescript
// Medical entity extraction and normalization
class MedicalEntityExtractor {
  async extractAndNormalize(
    fusedResult: FusedResult
  ): Promise<NormalizedMedicalData> {
    
    const normalized: NormalizedMedicalData = {
      medications: await this.normalizeMedications(fusedResult.medications),
      conditions: await this.normalizeConditions(fusedResult.conditions),
      labResults: await this.normalizeLabResults(fusedResult.labResults),
      procedures: await this.normalizeProcedures(fusedResult.procedures),
      demographics: await this.normalizeDemographics(fusedResult.demographics)
    };
    
    // Add SNOMED-CT and ICD-10 codes where possible
    await this.addMedicalCodes(normalized);
    
    return normalized;
  }
  
  private async normalizeMedications(medications: Medication[]): Promise<NormalizedMedication[]> {
    const normalized: NormalizedMedication[] = [];
    
    for (const med of medications) {
      // Normalize medication names using drug database
      const drugInfo = await this.drugDatabase.lookup(med.name);
      
      const normalizedMed: NormalizedMedication = {
        originalName: med.name,
        genericName: drugInfo?.genericName || med.name,
        brandNames: drugInfo?.brandNames || [],
        rxcui: drugInfo?.rxcui, // RxNorm identifier
        ndc: drugInfo?.ndc, // National Drug Code
        dosage: this.normalizeDosage(med.dosage),
        frequency: this.normalizeFrequency(med.frequency),
        route: this.normalizeRoute(med.route),
        confidence: med.confidence,
        extractionMethod: med.validationMethod
      };
      
      normalized.push(normalizedMed);
    }
    
    return normalized;
  }
}

// Quality validation for medical accuracy
class MedicalQualityValidator {
  async validateExtraction(
    normalized: NormalizedMedicalData,
    originalDocument: DocumentMetadata
  ): Promise<QualityValidationResult> {
    
    const validations: ValidationCheck[] = [];
    
    // Medication safety checks
    for (const med of normalized.medications) {
      validations.push(await this.validateMedicationSafety(med));
      validations.push(await this.validateDosageReasonableness(med));
    }
    
    // Lab result sanity checks
    for (const lab of normalized.labResults) {
      validations.push(await this.validateLabValueRanges(lab));
      validations.push(await this.validateLabUnits(lab));
    }
    
    // Demographic consistency checks
    validations.push(await this.validateDemographicConsistency(normalized.demographics));
    
    const overallQuality = this.calculateQualityScore(validations);
    const requiresReview = this.shouldTriggerHumanReview(overallQuality, validations);
    
    return {
      overallScore: overallQuality,
      requiresHumanReview: requiresReview,
      validationChecks: validations,
      criticalIssues: validations.filter(v => v.severity === 'critical'),
      recommendations: this.generateQualityRecommendations(validations)
    };
  }
}
```

### **Integration Testing & Performance Optimization**
**Deliverables:**
- End-to-end processing pipeline testing
- Performance benchmarking and optimization
- Error handling and retry mechanisms
- Cost tracking and reporting

**Tasks:**
```typescript
// Integration testing framework
class PipelineIntegrationTester {
  async testEndToEndProcessing(): Promise<TestResults> {
    const testDocuments = await this.loadTestDocuments();
    const results: ProcessingTestResult[] = [];
    
    for (const testDoc of testDocuments) {
      const startTime = Date.now();
      
      try {
        // Simulate complete pipeline
        const intakeResult = await this.testIntakeScreening(testDoc);
        const processingResult = await this.testAIProcessing(testDoc);
        const qualityResult = await this.testQualityValidation(processingResult);
        
        const processingTime = Date.now() - startTime;
        
        results.push({
          documentType: testDoc.type,
          success: true,
          processingTime,
          accuracy: await this.calculateAccuracy(processingResult, testDoc.groundTruth),
          cost: processingResult.totalCost,
          qualityScore: qualityResult.overallScore
        });
        
      } catch (error) {
        results.push({
          documentType: testDoc.type,
          success: false,
          error: error.message,
          processingTime: Date.now() - startTime
        });
      }
    }
    
    return this.generateTestReport(results);
  }
}

// Performance monitoring and optimization
class PerformanceMonitor {
  async trackProcessingMetrics(
    job: DocumentProcessingJob,
    result: ProcessingResult
  ): Promise<void> {
    
    const metrics: ProcessingMetrics = {
      documentId: job.document_id,
      patientId: job.patient_id,
      processingTime: result.processingTime,
      aiProcessingTime: result.aiProcessingTime,
      ocrProcessingTime: result.ocrProcessingTime,
      totalCost: result.totalCost,
      qualityScore: result.qualityScore,
      strategy: result.processingStrategy,
      providerUsed: result.aiProvider,
      timestamp: new Date()
    };
    
    // Store metrics for analysis
    await this.storeMetrics(metrics);
    
    // Check for performance alerts
    await this.checkPerformanceThresholds(metrics);
    
    // Update cost budgets
    await this.updateCostTracking(metrics);
  }
}
```

---

## **Database Schema Updates**

### **AI Processing Results**
```sql
-- Store AI processing outputs with full provenance
CREATE TABLE document_ai_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  patient_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Processing metadata
  ai_provider TEXT NOT NULL, -- 'gpt4o-mini', 'azure-openai', etc.
  processing_strategy TEXT NOT NULL,
  processing_time_ms INTEGER NOT NULL,
  total_cost_cents INTEGER NOT NULL,
  
  -- Extracted medical data
  extracted_data JSONB NOT NULL,
  normalized_entities JSONB,
  quality_score DECIMAL(3,2) NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  
  -- OCR adjunct data (when used)
  ocr_text TEXT,
  ocr_confidence DECIMAL(3,2),
  fusion_method TEXT, -- 'ai_only', 'ai_ocr_validated', 'ai_ocr_fused'
  
  -- Quality and review
  requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_reasons TEXT[],
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_document_ai_results_document ON document_ai_results(document_id);
CREATE INDEX idx_document_ai_results_patient ON document_ai_results(patient_id);
CREATE INDEX idx_document_ai_results_review ON document_ai_results(requires_human_review, created_at);
CREATE INDEX idx_document_ai_results_provider ON document_ai_results(ai_provider, created_at);

-- RLS policies
ALTER TABLE document_ai_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI results" ON document_ai_results
  FOR SELECT USING (
    patient_id IN (
      SELECT patient_id FROM get_allowed_patient_ids(
        (SELECT id FROM user_profiles WHERE account_owner_id = auth.uid() LIMIT 1)
      )
    )
  );
```

### **OCR Text Storage**
```sql
-- Store OCR text extraction when enabled
CREATE TABLE document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  patient_id UUID NOT NULL REFERENCES auth.users(id),
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  
  -- OCR data
  ocr_text TEXT NOT NULL,
  ocr_confidence DECIMAL(3,2) NOT NULL CHECK (ocr_confidence BETWEEN 0 AND 1),
  bounding_boxes JSONB, -- Text region coordinates
  
  -- Processing metadata
  ocr_provider TEXT NOT NULL DEFAULT 'google-cloud-vision',
  processing_time_ms INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX idx_document_pages_unique ON document_pages(document_id, page_number);
CREATE INDEX idx_document_pages_patient ON document_pages(patient_id);

-- RLS policies
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own OCR pages" ON document_pages
  FOR SELECT USING (
    patient_id IN (
      SELECT patient_id FROM get_allowed_patient_ids(
        (SELECT id FROM user_profiles WHERE account_owner_id = auth.uid() LIMIT 1)
      )
    )
  );
```

---

## **Testing & Validation**

### **Test Dataset Requirements**
- **Medical Document Types**: Lab reports, prescriptions, discharge summaries, imaging reports
- **Quality Variations**: High-quality scans, mobile photos, faxed documents, handwritten notes
- **Ground Truth Data**: Human-annotated medical entities for accuracy measurement
- **Edge Cases**: Multiple languages, unusual formats, corrupted files, non-medical content

### **Accuracy Benchmarks**
- **Overall Medical Accuracy**: >98% on structured medical data
- **Medication Extraction**: >99% accuracy (critical for patient safety)
- **Lab Value Extraction**: >98% accuracy with proper units
- **Demographic Matching**: >95% correct patient profile assignment
- **OCR Enhancement**: >5% accuracy improvement when OCR adjunct is beneficial

### **Performance Targets**
- **Processing Latency**: <2 minutes average, <5 minutes 95th percentile
- **Cost per Document**: <$0.03 average (including AI and OCR when used)
- **Queue Throughput**: >500 documents per hour
- **Error Rate**: <1% processing failures requiring manual intervention

---

## **Risk Mitigation**

### **Technical Risks**
1. **AI Provider Outages**: Multiple provider fallback with automatic switching
2. **Quality Degradation**: Continuous monitoring with automatic human review triggers
3. **Cost Overruns**: Hard budget limits with processing pause capabilities
4. **PHI Exposure**: Structured logging review and automated PHI detection

### **Business Risks**
1. **Medical Accuracy**: Extensive testing with healthcare professionals validation
2. **Regulatory Compliance**: Regular HIPAA and Privacy Act compliance audits
3. **User Adoption**: Gradual rollout with user feedback integration
4. **Provider Dependencies**: Multiple AI and OCR provider relationships

---

## **Success Metrics**

### **Technical Success**
- AI processing pipeline deployed and operational in staging
- >95% document processing success rate
- Performance targets met consistently
- All security and compliance checks passed

### **Quality Success**
- Medical accuracy exceeds benchmarks on test dataset
- User feedback indicates high satisfaction with extraction quality
- Human review rate <5% for high-confidence extractions
- Zero critical medical data errors detected

### **Cost Success**
- Processing costs <$0.03 per document average
- 85%+ cost reduction compared to previous AWS Textract pipeline
- Budget controls prevent cost overruns
- ROI positive within first month of operation

---

*Phase 2 establishes the core AI processing capabilities that will serve as the foundation for Guardian's advanced document processing pipeline, prioritizing medical accuracy, cost efficiency, and healthcare compliance.*