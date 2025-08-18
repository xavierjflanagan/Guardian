# Google Cloud Vision API Integration

**Purpose:** Technical implementation details for Google Cloud Vision OCR provider  
**Status:** ✅ Operational - Primary OCR provider  
**Last updated:** August 18, 2025

---

## 🎯 **Overview**

Google Cloud Vision API serves as Guardian's primary OCR provider, delivering cost-effective text extraction with 83% cost reduction compared to AWS Textract while maintaining high accuracy for medical document processing.

## 🏗️ **Technical Architecture**

### **API Integration**
```typescript
import { ImageAnnotatorClient } from '@google-cloud/vision';

interface GoogleVisionConfig {
  // Authentication
  projectId: string;
  keyFilename?: string;        // Service account key file
  credentials?: object;        // Service account credentials object
  
  // Processing options
  features: {
    textDetection: boolean;     // Basic OCR
    documentTextDetection: boolean; // Enhanced for documents
    handwritingOcr?: boolean;   // Handwriting recognition
  };
  
  // Performance settings
  maxRetries: number;          // Default: 3
  timeout: number;             // Default: 30000ms
  concurrency: number;         // Default: 5
  
  // Cost controls
  enableBilling: boolean;      // Monitor API costs
  dailyBudget: number;         // Daily spending limit
  alertThreshold: number;      // Alert when approaching limit
}

class GoogleVisionProvider {
  private client: ImageAnnotatorClient;
  private config: GoogleVisionConfig;
  private costTracker: CostTracker;

  constructor(config: GoogleVisionConfig) {
    this.config = config;
    this.client = new ImageAnnotatorClient({
      projectId: config.projectId,
      keyFilename: config.keyFilename,
      credentials: config.credentials
    });
    this.costTracker = new CostTracker(config.dailyBudget);
  }

  async extractText(
    imageBuffer: Buffer, 
    options: ExtractionOptions = {}
  ): Promise<VisionExtractionResult> {
    
    // Check daily budget before processing
    if (!await this.costTracker.canAffordRequest()) {
      throw new Error('Daily OCR budget exceeded');
    }

    const startTime = Date.now();
    
    try {
      // Prepare request based on document type
      const request = this.buildVisionRequest(imageBuffer, options);
      
      // Call Google Cloud Vision API
      const [response] = await this.client.annotateImage(request);
      
      // Process and structure the response
      const result = this.processVisionResponse(response, options);
      
      // Track costs and performance
      const processingTime = Date.now() - startTime;
      const cost = this.calculateRequestCost(imageBuffer.length, result.pageCount);
      
      await this.costTracker.recordRequest(cost, processingTime);
      
      return {
        ...result,
        cost,
        processingTime,
        provider: 'google-cloud-vision'
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Log error for monitoring
      await this.logError(error, {
        imageSize: imageBuffer.length,
        processingTime,
        options
      });
      
      throw new VisionExtractionError(
        `Google Vision OCR failed: ${error.message}`,
        error.code,
        processingTime
      );
    }
  }

  private buildVisionRequest(
    imageBuffer: Buffer, 
    options: ExtractionOptions
  ): AnnotateImageRequest {
    
    const features: Feature[] = [];
    
    // Select appropriate feature based on document type
    if (options.documentType === 'handwritten' || options.enhanceHandwriting) {
      features.push({ type: 'DOCUMENT_TEXT_DETECTION' });
    } else {
      features.push({ type: 'TEXT_DETECTION' });
    }
    
    // Add image properties detection if needed
    if (options.detectImageProperties) {
      features.push({ type: 'IMAGE_PROPERTIES' });
    }

    return {
      image: { content: imageBuffer },
      features,
      imageContext: this.buildImageContext(options)
    };
  }

  private buildImageContext(options: ExtractionOptions): ImageContext {
    const context: ImageContext = {};
    
    // Language hints for better OCR accuracy
    if (options.languageHints) {
      context.languageHints = options.languageHints;
    } else {
      // Default to English for medical documents
      context.languageHints = ['en'];
    }
    
    // Text detection parameters
    context.textDetectionParams = {
      enableTextDetectionConfidenceScore: true
    };
    
    return context;
  }
}
```

### **Response Processing**
```typescript
interface VisionResponseProcessor {
  async processVisionResponse(
    response: AnnotateImageResponse,
    options: ExtractionOptions
  ): Promise<ProcessedVisionResult> {
    
    const textAnnotations = response.textAnnotations || [];
    const fullTextAnnotation = response.fullTextAnnotation;
    
    if (textAnnotations.length === 0) {
      return {
        success: false,
        reason: 'No text detected in image',
        fullText: '',
        pages: [],
        confidence: 0
      };
    }

    // Extract full text (first annotation contains complete text)
    const fullText = textAnnotations[0]?.description || '';
    
    // Process page-level information
    const pages = this.extractPageInformation(fullTextAnnotation);
    
    // Calculate confidence scores
    const confidence = this.calculateConfidenceScores(textAnnotations);
    
    // Detect language
    const detectedLanguage = this.detectLanguage(textAnnotations);
    
    // Extract structured elements
    const structuredElements = await this.extractStructuredElements(
      fullTextAnnotation, 
      options
    );

    return {
      success: true,
      fullText,
      pages,
      confidence,
      language: detectedLanguage,
      structuredElements,
      wordCount: fullText.split(/\s+/).length,
      boundingBoxes: this.extractBoundingBoxes(textAnnotations)
    };
  }

  private extractPageInformation(
    fullTextAnnotation?: TextAnnotation
  ): PageInformation[] {
    
    if (!fullTextAnnotation?.pages) {
      return [];
    }

    return fullTextAnnotation.pages.map((page, index) => ({
      pageNumber: index + 1,
      text: this.extractPageText(page),
      confidence: this.calculatePageConfidence(page),
      dimensions: {
        width: page.width || 0,
        height: page.height || 0
      },
      blocks: this.extractTextBlocks(page.blocks || []),
      paragraphs: this.extractParagraphs(page.blocks || [])
    }));
  }

  private calculateConfidenceScores(
    textAnnotations: EntityAnnotation[]
  ): ConfidenceMetrics {
    
    // Skip the first annotation (full text) for word-level confidence
    const wordAnnotations = textAnnotations.slice(1);
    
    if (wordAnnotations.length === 0) {
      return { overall: 0, wordLevel: 0, pageLevel: 0 };
    }

    // Calculate word-level confidence
    const wordConfidences = wordAnnotations
      .map(annotation => annotation.confidence || 0)
      .filter(conf => conf > 0);
    
    const wordLevel = wordConfidences.length > 0
      ? wordConfidences.reduce((a, b) => a + b) / wordConfidences.length
      : 0;

    // Calculate overall confidence (weighted by text length)
    const textLengths = wordAnnotations.map(annotation => 
      annotation.description?.length || 0
    );
    
    const totalLength = textLengths.reduce((a, b) => a + b, 0);
    
    let weightedConfidence = 0;
    if (totalLength > 0) {
      for (let i = 0; i < wordAnnotations.length; i++) {
        const confidence = wordAnnotations[i].confidence || 0;
        const weight = textLengths[i] / totalLength;
        weightedConfidence += confidence * weight;
      }
    }

    return {
      overall: weightedConfidence,
      wordLevel,
      pageLevel: wordLevel, // Simplified for single-page processing
      wordCount: wordAnnotations.length,
      confidenceDistribution: this.calculateConfidenceDistribution(wordConfidences)
    };
  }

  private extractStructuredElements(
    fullTextAnnotation: TextAnnotation,
    options: ExtractionOptions
  ): StructuredElements {
    
    const elements: StructuredElements = {
      headers: [],
      tables: [],
      lists: [],
      signatures: [],
      dates: [],
      numbers: []
    };

    if (!fullTextAnnotation?.pages) {
      return elements;
    }

    for (const page of fullTextAnnotation.pages) {
      if (!page.blocks) continue;

      for (const block of page.blocks) {
        // Analyze block layout and content
        const blockText = this.extractBlockText(block);
        const blockType = this.classifyBlock(block, blockText);

        switch (blockType) {
          case 'header':
            elements.headers.push({
              text: blockText,
              level: this.determineHeaderLevel(block),
              boundingBox: this.extractBoundingBox(block.boundingBox)
            });
            break;

          case 'table':
            const table = this.extractTableStructure(block);
            if (table) elements.tables.push(table);
            break;

          case 'list':
            const list = this.extractListStructure(block);
            if (list) elements.lists.push(list);
            break;
        }

        // Extract dates and numbers regardless of block type
        elements.dates.push(...this.extractDates(blockText));
        elements.numbers.push(...this.extractNumbers(blockText));
      }
    }

    return elements;
  }
}
```

## 💰 **Cost Management**

### **Pricing Structure**
```typescript
interface GoogleVisionPricing {
  // Current pricing (as of August 2025)
  textDetection: {
    first1000: 0.0015;        // $1.50 per 1,000 images
    next4000: 0.0012;         // $1.20 per 1,000 images  
    next15000: 0.0006;        // $0.60 per 1,000 images
    over20000: 0.0003;        // $0.30 per 1,000 images
  };

  documentTextDetection: {
    first1000: 0.0015;        // Same as text detection
    next4000: 0.0012;         
    next15000: 0.0006;        
    over20000: 0.0003;        
  };

  // Additional features
  imageProperties: 0.0001;    // $0.10 per 1,000 images
  safeSearch: 0.0001;         // $0.10 per 1,000 images
}

class CostTracker {
  private dailySpend: number = 0;
  private monthlySpend: number = 0;
  private requestCount: number = 0;
  private budget: CostBudget;

  constructor(budget: CostBudget) {
    this.budget = budget;
  }

  async canAffordRequest(): Promise<boolean> {
    // Check daily budget
    if (this.dailySpend >= this.budget.dailyLimit) {
      await this.sendBudgetAlert('daily_exceeded');
      return false;
    }

    // Check monthly budget
    if (this.monthlySpend >= this.budget.monthlyLimit) {
      await this.sendBudgetAlert('monthly_exceeded');
      return false;
    }

    // Check request rate limits
    if (this.requestCount >= this.budget.dailyRequestLimit) {
      await this.sendBudgetAlert('rate_limit_exceeded');
      return false;
    }

    return true;
  }

  async recordRequest(cost: number, processingTime: number): Promise<void> {
    this.dailySpend += cost;
    this.monthlySpend += cost;
    this.requestCount += 1;

    // Store metrics for analysis
    await this.storeMetrics({
      cost,
      processingTime,
      timestamp: new Date(),
      dailyTotal: this.dailySpend,
      monthlyTotal: this.monthlySpend
    });

    // Check if approaching budget limits
    if (this.dailySpend > this.budget.dailyLimit * 0.8) {
      await this.sendBudgetAlert('daily_warning');
    }

    if (this.monthlySpend > this.budget.monthlyLimit * 0.9) {
      await this.sendBudgetAlert('monthly_warning');
    }
  }

  calculateRequestCost(imageSize: number, pageCount: number = 1): number {
    // Base cost for text detection
    let cost = this.getPricingTier() * pageCount;
    
    // Additional costs for large images
    if (imageSize > 10 * 1024 * 1024) { // 10MB
      cost *= 1.2; // 20% surcharge for large files
    }
    
    return cost;
  }

  private getPricingTier(): number {
    const monthlyRequests = this.getMonthlyRequestCount();
    
    if (monthlyRequests <= 1000) return 0.0015;
    if (monthlyRequests <= 5000) return 0.0012;
    if (monthlyRequests <= 20000) return 0.0006;
    return 0.0003;
  }
}
```

## 🔧 **Error Handling & Reliability**

### **Retry Logic**
```typescript
class ReliabilityManager {
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,      // 1 second
    maxDelay: 10000,      // 10 seconds
    backoffMultiplier: 2,
    retryableErrors: [
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_ERROR', 
      'TIMEOUT',
      'NETWORK_ERROR'
    ]
  };

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Log successful retry if not first attempt
        if (attempt > 0) {
          await this.logRetrySuccess(context, attempt);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          await this.logNonRetryableError(context, error);
          throw error;
        }
        
        // Don't retry on last attempt
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }
        
        // Calculate delay and wait
        const delay = this.calculateDelay(attempt);
        await this.logRetryAttempt(context, attempt + 1, delay, error);
        await this.sleep(delay);
      }
    }
    
    // All retries exhausted
    await this.logRetryExhaustion(context, this.retryConfig.maxRetries, lastError);
    throw lastError;
  }

  private isRetryableError(error: any): boolean {
    // Check error code/type
    if (error.code && this.retryConfig.retryableErrors.includes(error.code)) {
      return true;
    }
    
    // Check error message patterns
    const message = error.message?.toLowerCase() || '';
    
    const retryablePatterns = [
      /rate limit/,
      /quota exceeded/,
      /timeout/,
      /network error/,
      /connection reset/,
      /internal server error/
    ];
    
    return retryablePatterns.some(pattern => pattern.test(message));
  }

  private calculateDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelay * 
      Math.pow(this.retryConfig.backoffMultiplier, attempt);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    
    return Math.min(delay + jitter, this.retryConfig.maxDelay);
  }
}
```

### **Health Monitoring**
```typescript
interface HealthMonitor {
  async checkServiceHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      // Test with minimal image
      const testImage = this.generateTestImage();
      const result = await this.client.annotateImage({
        image: { content: testImage },
        features: [{ type: 'TEXT_DETECTION' }]
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        lastChecked: new Date(),
        details: {
          apiReachable: true,
          responseValid: !!result,
          rateLimitOk: responseTime < 5000
        }
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        responseTime,
        lastChecked: new Date(),
        error: error.message,
        details: {
          apiReachable: false,
          errorType: this.classifyError(error)
        }
      };
    }
  }

  async monitorOngoingHealth(): Promise<void> {
    // Check health every 5 minutes
    setInterval(async () => {
      const health = await this.checkServiceHealth();
      
      if (health.status === 'unhealthy') {
        await this.handleUnhealthyService(health);
      }
      
      await this.recordHealthMetrics(health);
    }, 5 * 60 * 1000);
  }

  private async handleUnhealthyService(health: HealthStatus): Promise<void> {
    // Alert monitoring systems
    await this.sendHealthAlert({
      service: 'google-cloud-vision',
      status: health.status,
      error: health.error,
      responseTime: health.responseTime
    });
    
    // Consider fallback options
    if (health.error?.includes('quota') || health.error?.includes('rate limit')) {
      await this.activateRateLimitMitigation();
    }
  }
}
```

## 📊 **Performance Optimization**

### **Caching Strategy**
```typescript
class VisionCacheManager {
  private cache: Map<string, CachedResult> = new Map();
  private cacheConfig: CacheConfig = {
    maxSize: 1000,           // Maximum cached results
    ttlHours: 24,           // Time to live in hours
    compressionEnabled: true, // Compress cached text
    persistToDisk: true      // Persist cache across restarts
  };

  async getCachedResult(imageHash: string): Promise<CachedResult | null> {
    const cached = this.cache.get(imageHash);
    
    if (!cached) return null;
    
    // Check if expired
    const now = Date.now();
    if (now > cached.expiresAt) {
      this.cache.delete(imageHash);
      return null;
    }
    
    // Update access time for LRU
    cached.lastAccessed = now;
    
    return cached;
  }

  async cacheResult(
    imageHash: string, 
    result: VisionExtractionResult
  ): Promise<void> {
    
    // Don't cache failed results
    if (!result.success) return;
    
    // Don't cache if result is too large
    if (result.fullText.length > 100000) return; // 100KB limit
    
    const cached: CachedResult = {
      result,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      expiresAt: Date.now() + (this.cacheConfig.ttlHours * 60 * 60 * 1000),
      compressed: this.cacheConfig.compressionEnabled
    };
    
    // Compress if enabled
    if (this.cacheConfig.compressionEnabled) {
      cached.result.fullText = await this.compressText(result.fullText);
    }
    
    // Evict old entries if cache is full
    if (this.cache.size >= this.cacheConfig.maxSize) {
      await this.evictLeastRecentlyUsed();
    }
    
    this.cache.set(imageHash, cached);
    
    // Persist to disk if enabled
    if (this.cacheConfig.persistToDisk) {
      await this.persistCacheEntry(imageHash, cached);
    }
  }

  generateImageHash(imageBuffer: Buffer): string {
    // Use content-based hash for duplicate detection
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(imageBuffer).digest('hex');
  }
}
```

## 🔒 **Security & Compliance**

### **Data Protection**
```typescript
interface SecurityMeasures {
  dataTransit: {
    encryption: 'TLS 1.3';
    authentication: 'Service Account with minimal permissions';
    regionalization: 'Process in same region as storage';
  };

  dataResidency: {
    processing: 'Google Cloud regions only (AU/US)';
    storage: 'No persistent storage in Google Cloud';
    caching: 'Local encrypted cache only';
  };

  accessControl: {
    serviceAccount: 'vision-ocr-processor@guardian-health.iam.gserviceaccount.com';
    permissions: ['cloudvision.images.annotate'];
    ipRestrictions: 'Render.com IP ranges only';
  };

  auditLogging: {
    apiCalls: 'Log all requests with correlation IDs';
    errors: 'Log failures without image content';
    performance: 'Track processing times and costs';
    privacy: 'No PHI in logs';
  };
}
```

---

## 🧪 **Testing & Validation**

### **Test Suite**
1. **Accuracy Tests**: Medical document OCR accuracy validation
2. **Performance Tests**: Latency and throughput benchmarks  
3. **Cost Tests**: Verify pricing calculations and budget controls
4. **Error Handling**: Test retry logic and fallback mechanisms
5. **Security Tests**: Validate data protection and access controls

### **Quality Metrics**
- **Accuracy**: >99% for printed medical text
- **Performance**: <2 seconds average processing time
- **Reliability**: 99.9% success rate with retries
- **Cost Efficiency**: 83% reduction from AWS Textract

---

*For broader architecture context, see [OCR Integration Overview](./README.md)*