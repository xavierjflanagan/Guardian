# Pass 1 Worker Implementation Guide

**Status**: Implementation Ready - Complete Render.com Worker Specification
**Created**: 30 September 2025
**Last Updated**: 30 September 2025

## Overview

This document provides the complete implementation specification for Pass 1 entity detection workers on Render.com. It includes the translation layer, error handling, and integration with Guardian's existing V3 worker infrastructure.

## Worker Architecture

### **Integration with Existing V3 System**

Pass 1 workers extend the existing Guardian V3 job processing system:

```typescript
// Existing V3 job queue integration
interface Pass1JobPayload {
  shell_file_id: string;
  patient_id: string;
  raw_file_data: {
    file_data: string;          // Base64 encoded
    file_type: string;
    filename: string;
    file_size: number;
  };
  ocr_spatial_data: {
    extracted_text: string;
    spatial_mapping: SpatialElement[];
    ocr_confidence: number;
    ocr_provider: string;
  };
  processing_context: {
    priority: 'high' | 'medium' | 'low';
    retry_count: number;
    max_retries: number;
  };
}
```

## Core Translation Functions

### **AI Output to Database Translation**

```typescript
/**
 * Translates AI response to database-ready format
 * This is the critical function that handles the "wasteful" but necessary translation
 */
function translateAIOutputToDatabase(
  aiResponse: Pass1OutputSchema,
  sessionMetadata: ProcessingSessionMetadata
): EntityAuditRecord[] {

  return aiResponse.entities.map((entity, index) => ({
    // Direct mappings (no translation needed)
    entity_id: entity.entity_id,
    original_text: entity.original_text,
    entity_category: entity.classification.entity_category,
    entity_subtype: entity.classification.entity_subtype,
    pass1_confidence: entity.classification.confidence,

    // Nested structure flattening - DUAL INPUT DATA
    ai_visual_interpretation: entity.visual_interpretation.ai_sees,
    visual_formatting_context: entity.visual_interpretation.formatting_context,
    ai_visual_confidence: entity.visual_interpretation.ai_confidence,
    visual_quality_assessment: entity.visual_interpretation.visual_quality,

    // OCR cross-reference flattening
    ocr_reference_text: entity.ocr_cross_reference.ocr_text,
    ocr_confidence: entity.ocr_cross_reference.ocr_confidence,
    ai_ocr_agreement_score: entity.ocr_cross_reference.ai_ocr_agreement,
    discrepancy_type: entity.ocr_cross_reference.discrepancy_type,
    discrepancy_notes: entity.ocr_cross_reference.discrepancy_notes,

    // Spatial data flattening
    page_number: entity.spatial_information.page_number,
    spatial_bbox: entity.spatial_information.bounding_box,
    unique_marker: entity.spatial_information.unique_marker,
    location_context: entity.spatial_information.location_context,
    spatial_mapping_source: entity.spatial_information.spatial_source,

    // Processing routing flattening
    requires_schemas: entity.processing_routing.requires_schemas,
    processing_priority: entity.processing_routing.processing_priority,

    // Quality indicators flattening
    cross_validation_score: entity.quality_indicators.cross_validation_score,
    manual_review_required: entity.quality_indicators.requires_manual_review,

    // Session and metadata
    shell_file_id: sessionMetadata.shell_file_id,
    patient_id: sessionMetadata.patient_id,
    processing_session_id: sessionMetadata.processing_session_id,
    pass1_model_used: sessionMetadata.model_used,
    pass1_vision_processing: sessionMetadata.vision_processing,
    ocr_provider: sessionMetadata.ocr_provider,

    // Status management
    pass2_status: entity.classification.entity_category === 'document_structure' ? 'skipped' : 'pending',

    // Audit timestamps (handled by database)
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));
}
```

### **Schema Assignment Function**

```typescript
/**
 * Determines which database schemas each entity requires for Pass 2
 */
function assignEntitySchemas(entitySubtype: string): string[] {
  const SCHEMA_MAPPING: Record<string, string[]> = {
    // Clinical Events - ALL include patient_clinical_events for master timeline
    vital_sign: ['patient_clinical_events', 'patient_observations', 'patient_vitals'],
    lab_result: ['patient_clinical_events', 'patient_observations', 'patient_lab_results'],
    physical_finding: ['patient_clinical_events', 'patient_observations'],
    symptom: ['patient_clinical_events', 'patient_observations'],
    medication: ['patient_clinical_events', 'patient_interventions', 'patient_medications'],
    procedure: ['patient_clinical_events', 'patient_interventions'],
    immunization: ['patient_clinical_events', 'patient_interventions', 'patient_immunizations'],
    diagnosis: ['patient_clinical_events', 'patient_conditions'],
    allergy: ['patient_clinical_events', 'patient_allergies'],
    healthcare_encounter: ['patient_clinical_events', 'healthcare_encounters'],
    clinical_other: ['patient_clinical_events'],

    // Healthcare Context - Contextual Schemas
    patient_identifier: ['healthcare_encounters'],
    provider_identifier: ['healthcare_encounters'],
    facility_identifier: ['healthcare_encounters'],
    appointment: ['healthcare_encounters'],
    referral: ['patient_clinical_events'],
    care_coordination: ['patient_clinical_events'],
    insurance_information: ['healthcare_encounters'],
    billing_code: ['healthcare_encounters'],
    authorization: ['healthcare_encounters'],
    healthcare_context_other: ['healthcare_encounters'],

    // Document Structure - No Schemas (Logging Only)
    header: [],
    footer: [],
    logo: [],
    page_marker: [],
    signature_line: [],
    watermark: [],
    form_structure: [],
    document_structure_other: []
  };

  return SCHEMA_MAPPING[entitySubtype] || ['patient_clinical_events']; // Fallback
}
```

## Main Worker Function

### **Complete Pass 1 Worker Implementation**

```typescript
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

interface ProcessingSessionMetadata {
  shell_file_id: string;
  patient_id: string;
  processing_session_id: string;
  model_used: string;
  vision_processing: boolean;
  ocr_provider: string;
  started_at: string;
}

/**
 * Main Pass 1 entity detection worker function
 * Deployed on Render.com as part of Guardian V3 worker infrastructure
 */
export async function processPass1EntityDetection(
  jobPayload: Pass1JobPayload
): Promise<Pass1WorkerResult> {

  const startTime = Date.now();
  const sessionId = crypto.randomUUID();

  // Initialize clients
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!
  });

  try {
    // Step 1: Validate inputs
    await validatePass1Inputs(jobPayload);

    // Step 2: Prepare session metadata
    const sessionMetadata: ProcessingSessionMetadata = {
      shell_file_id: jobPayload.shell_file_id,
      patient_id: jobPayload.patient_id,
      processing_session_id: sessionId,
      model_used: 'gpt-4o',
      vision_processing: true,
      ocr_provider: jobPayload.ocr_spatial_data.ocr_provider,
      started_at: new Date().toISOString()
    };

    // Step 3: Call AI with dual inputs
    const aiResponse = await callAIForEntityDetection(
      openai,
      jobPayload.raw_file_data,
      jobPayload.ocr_spatial_data
    );

    // Step 4: Translate AI output to database format
    const entityRecords = translateAIOutputToDatabase(aiResponse, sessionMetadata);

    // Step 5: Assign schemas for Pass 2
    entityRecords.forEach(record => {
      record.requires_schemas = assignEntitySchemas(record.entity_subtype);
    });

    // Step 6: Batch insert to database
    const { data, error } = await supabase
      .from('entity_processing_audit')
      .insert(entityRecords);

    if (error) {
      throw new Error(`Database insertion failed: ${error.message}`);
    }

    // Step 7: Generate success response
    const processingTime = (Date.now() - startTime) / 1000;

    return {
      success: true,
      processing_session_id: sessionId,
      entities_processed: entityRecords.length,
      processing_time_seconds: processingTime,
      cost_estimate: calculateCostEstimate(aiResponse.processing_metadata.token_usage),
      quality_metrics: {
        overall_confidence: aiResponse.processing_metadata.confidence_metrics.overall_confidence,
        ai_ocr_agreement: aiResponse.cross_validation_results.ai_ocr_agreement_score,
        manual_review_required: entityRecords.filter(r => r.manual_review_required).length
      },
      pass2_entities_queued: entityRecords.filter(r => r.pass2_status === 'pending').length
    };

  } catch (error) {
    // Step 8: Handle errors with comprehensive logging
    await handlePass1ProcessingError(supabase, sessionId, error as Error, jobPayload);

    return {
      success: false,
      error: error.message,
      processing_session_id: sessionId,
      retry_recommended: shouldRetryProcessing(error as Error),
      processing_time_seconds: (Date.now() - startTime) / 1000
    };
  }
}
```

### **AI Integration Function**

```typescript
/**
 * Calls OpenAI GPT-4o with dual inputs for entity detection
 */
async function callAIForEntityDetection(
  openai: OpenAI,
  rawFileData: Pass1JobPayload['raw_file_data'],
  ocrData: Pass1JobPayload['ocr_spatial_data']
): Promise<Pass1OutputSchema> {

  // Load prompt template from PASS-1-BRIDGE-SCHEMA-AND-PROMPTS.md
  const promptTemplate = await loadPass1PromptTemplate();

  // Prepare the dual-input prompt
  const prompt = promptTemplate
    .replace('${ocr_data.extracted_text}', ocrData.extracted_text)
    .replace('${JSON.stringify(ocr_data.spatial_mapping)}', JSON.stringify(ocrData.spatial_mapping))
    .replace('${ocr_data.ocr_confidence}', ocrData.ocr_confidence.toString())
    .replace('${ocr_data.ocr_provider}', ocrData.ocr_provider);

  // Call OpenAI with vision + text
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a medical document entity detection system using dual inputs for maximum accuracy.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${rawFileData.file_type};base64,${rawFileData.file_data}`
            }
          },
          {
            type: 'text',
            content: prompt
          }
        ]
      }
    ],
    temperature: 0.1,  // Low temperature for consistent classification
    max_tokens: 4000,
    response_format: { type: 'json_object' }
  });

  // Parse and validate response
  const rawResult = JSON.parse(response.choices[0].message.content || '{}');

  // Transform to our output schema with metadata
  return {
    processing_metadata: {
      model_used: 'gpt-4o',
      vision_processing: true,
      processing_time_seconds: 0, // Will be calculated by caller
      token_usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
        image_tokens: estimateImageTokens(rawFileData.file_size)
      },
      cost_estimate: calculateCostEstimate(response.usage),
      confidence_metrics: extractConfidenceMetrics(rawResult)
    },
    entities: rawResult.entities || [],
    document_coverage: rawResult.document_coverage || {},
    cross_validation_results: rawResult.cross_validation_results || {},
    quality_assessment: rawResult.quality_assessment || {},
    profile_safety: rawResult.profile_safety || {}
  };
}
```

## Error Handling & Resilience

### **Comprehensive Error Recovery**

```typescript
/**
 * Handles Pass 1 processing errors with retry logic and logging
 */
async function handlePass1ProcessingError(
  supabase: any,
  sessionId: string,
  error: Error,
  jobPayload: Pass1JobPayload
): Promise<void> {

  // Log error to database for debugging
  await supabase.from('processing_error_log').insert({
    processing_session_id: sessionId,
    shell_file_id: jobPayload.shell_file_id,
    patient_id: jobPayload.patient_id,
    error_type: error.constructor.name,
    error_message: error.message,
    error_stack: error.stack,
    job_payload: jobPayload,
    occurred_at: new Date().toISOString()
  });

  // Update shell file status
  await supabase
    .from('shell_files')
    .update({
      processing_status: 'pass1_failed',
      error_details: {
        error_type: error.constructor.name,
        error_message: error.message,
        retry_count: jobPayload.processing_context.retry_count
      }
    })
    .eq('id', jobPayload.shell_file_id);
}

/**
 * Determines if processing should be retried based on error type
 */
function shouldRetryProcessing(error: Error): boolean {
  const retryableErrors = [
    'RateLimitError',
    'TimeoutError',
    'NetworkError',
    'TemporaryServiceUnavailable'
  ];

  return retryableErrors.some(errorType =>
    error.constructor.name.includes(errorType) ||
    error.message.includes(errorType)
  );
}
```

### **Input Validation**

```typescript
/**
 * Validates Pass 1 job inputs before processing
 */
async function validatePass1Inputs(jobPayload: Pass1JobPayload): Promise<void> {
  // Required fields validation
  if (!jobPayload.shell_file_id) {
    throw new Error('Missing shell_file_id');
  }

  if (!jobPayload.patient_id) {
    throw new Error('Missing patient_id');
  }

  // Raw file validation
  if (!jobPayload.raw_file_data.file_data) {
    throw new Error('Missing raw file data');
  }

  if (!jobPayload.raw_file_data.file_type.match(/^(image\/|application\/pdf)/)) {
    throw new Error(`Unsupported file type: ${jobPayload.raw_file_data.file_type}`);
  }

  // OCR data validation
  if (!jobPayload.ocr_spatial_data.extracted_text) {
    throw new Error('Missing OCR extracted text');
  }

  if (!Array.isArray(jobPayload.ocr_spatial_data.spatial_mapping)) {
    throw new Error('Invalid OCR spatial mapping format');
  }

  // File size validation (prevent excessive costs)
  const maxFileSize = 10 * 1024 * 1024; // 10MB limit
  if (jobPayload.raw_file_data.file_size > maxFileSize) {
    throw new Error(`File too large: ${jobPayload.raw_file_data.file_size} bytes (max: ${maxFileSize})`);
  }
}
```

## Performance Optimization

### **Batch Processing Strategy**

```typescript
/**
 * Optimizes database insertions with batch processing
 */
async function batchInsertEntityRecords(
  supabase: any,
  entityRecords: EntityAuditRecord[]
): Promise<void> {

  const BATCH_SIZE = 100; // Optimal batch size for Supabase

  for (let i = 0; i < entityRecords.length; i += BATCH_SIZE) {
    const batch = entityRecords.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from('entity_processing_audit')
      .insert(batch);

    if (error) {
      throw new Error(`Batch insertion failed at records ${i}-${i + batch.length}: ${error.message}`);
    }
  }
}
```

### **Cost Estimation**

```typescript
/**
 * Calculates processing costs for vision models
 */
function calculateCostEstimate(tokenUsage: any): number {
  const GPT4O_PRICING = {
    input_per_1k: 0.0025,      // $2.50 per 1K input tokens
    output_per_1k: 0.01,       // $10.00 per 1K output tokens
    image_per_1k: 0.00765      // $7.65 per 1K image tokens
  };

  const inputCost = (tokenUsage.prompt_tokens / 1000) * GPT4O_PRICING.input_per_1k;
  const outputCost = (tokenUsage.completion_tokens / 1000) * GPT4O_PRICING.output_per_1k;
  const imageCost = (tokenUsage.image_tokens / 1000) * GPT4O_PRICING.image_per_1k;

  return inputCost + outputCost + imageCost;
}

/**
 * Estimates image tokens based on file size
 */
function estimateImageTokens(fileSizeBytes: number): number {
  // Rough estimation: ~1 token per 100 bytes for images
  return Math.ceil(fileSizeBytes / 100);
}
```

## Render.com Deployment

### **Environment Configuration**

```bash
# Required environment variables for Render.com deployment
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENAI_API_KEY=sk-proj-...
GOOGLE_CLOUD_API_KEY=AIzaSy...  # For OCR processing

# Optional performance tuning
NODE_ENV=production
MAX_CONCURRENT_JOBS=5
BATCH_SIZE=100
RETRY_ATTEMPTS=3
PROCESSING_TIMEOUT_MS=30000
```

### **Render.com Service Configuration**

```yaml
# render.yaml
services:
  - type: worker
    name: guardian-v3-pass1-worker
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run start:pass1-worker

    envVars:
      - key: NODE_ENV
        value: production
      - key: MAX_CONCURRENT_JOBS
        value: 5

    # Auto-scaling configuration
    scaling:
      minInstances: 1
      maxInstances: 10
      targetCPUPercent: 70
      targetMemoryPercent: 80
```

### **Integration with V3 Job Queue**

```typescript
/**
 * Integration with Guardian V3 job coordination system
 */
export async function initializePass1Worker(): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Subscribe to Pass 1 job queue
  const subscription = supabase
    .channel('pass1-jobs')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'job_queue',
      filter: 'job_type=eq.pass1_entity_detection'
    }, async (payload) => {
      const job = payload.new as Pass1JobPayload;

      // Process job with error handling
      try {
        const result = await processPass1EntityDetection(job);

        // Update job status
        await supabase
          .from('job_queue')
          .update({
            status: result.success ? 'completed' : 'failed',
            result: result,
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);

      } catch (error) {
        console.error('Pass 1 job processing failed:', error);
      }
    })
    .subscribe();

  console.log('Pass 1 worker initialized and listening for jobs');
}
```

## Success Criteria & Monitoring

### **Performance Targets**

```typescript
interface Pass1PerformanceTargets {
  processing_time: {
    target: '< 4 seconds per document',
    acceptable: '< 10 seconds per document',
    critical: '> 30 seconds per document'
  };

  cost_efficiency: {
    target: '< $0.005 per document',
    acceptable: '< $0.01 per document',
    critical: '> $0.02 per document'
  };

  accuracy: {
    entity_detection: '> 98%',
    category_classification: '> 95%',
    ai_ocr_agreement: '> 85%'
  };

  reliability: {
    success_rate: '> 99%',
    retry_rate: '< 5%',
    data_consistency: '100%'
  };
}
```

### **Monitoring & Alerting**

```typescript
/**
 * Health check endpoint for Render.com monitoring
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  const checks = {
    supabase_connection: await testSupabaseConnection(),
    openai_api: await testOpenAIAPI(),
    memory_usage: process.memoryUsage(),
    uptime: process.uptime()
  };

  const isHealthy = checks.supabase_connection && checks.openai_api;

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: checks
  };
}
```

## Integration Points

### **Connection to Existing V3 Infrastructure**

1. **Job Queue Integration**: Uses existing `job_queue` table with `job_type = 'pass1_entity_detection'`
2. **Shell Files**: Updates `shell_files.processing_status` to track Pass 1 progress
3. **User Profiles**: Validates `patient_id` against `user_profiles` table for security
4. **Pass 2 Handoff**: Creates `pass2_status = 'pending'` entities for subsequent Pass 2 processing

### **Database Transaction Safety**

```typescript
/**
 * Ensures atomic operations with proper transaction handling
 */
async function processWithTransaction(
  supabase: any,
  entityRecords: EntityAuditRecord[],
  sessionId: string
): Promise<void> {

  const { error } = await supabase.rpc('process_pass1_entities', {
    entity_records: entityRecords,
    session_id: sessionId
  });

  if (error) {
    throw new Error(`Transaction failed: ${error.message}`);
  }
}
```

---

This worker implementation provides complete Pass 1 entity detection functionality with production-grade error handling, performance optimization, and seamless integration with Guardian's V3 architecture. The translation layer efficiently converts AI output to database format while maintaining comprehensive audit trails and enabling targeted Pass 2 processing.