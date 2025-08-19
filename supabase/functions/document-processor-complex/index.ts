import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders } from '../_shared/cors.ts'
import OpenAI from 'https://esm.sh/openai@4.24.1'

// Quality Guardian Engine import (will be loaded dynamically)
interface QualityGuardianEngine {
  checkDataQuality(extractedData: any, documentId: string, profileId: string, profile: any): Promise<any[]>;
  storeFlags(flags: any[]): Promise<string[]>;
}

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Initialize OpenAI client for GPT-4o Mini
const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')!,
});

// Validate required environment variables with detailed logging
console.log('🚀 Document Processor Complex v2.0 - Medical Data Storage Enabled');
console.log('Starting environment validation...');

try {
  const requiredEnvVars = {
    'OPENAI_API_KEY': Deno.env.get('OPENAI_API_KEY'),
    'GOOGLE_CLOUD_API_KEY': Deno.env.get('GOOGLE_CLOUD_API_KEY'),
    'SUPABASE_URL': Deno.env.get('SUPABASE_URL'),
    'SUPABASE_SERVICE_ROLE_KEY': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  };

  for (const [name, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      console.error(`❌ Missing environment variable: ${name}`);
      throw new Error(`Missing required environment variable: ${name}`);
    } else {
      console.log(`✅ ${name}: ${value.substring(0, 8)}...`);
    }
  }

  console.log('✅ Environment validation passed - all required API keys configured');
} catch (envError) {
  console.error('❌ Environment validation failed:', envError);
  throw envError;
}

// Google Cloud Vision OCR integration
async function extractWithGoogleVisionOCR(documentBuffer: Uint8Array): Promise<{ extractedText: string; confidence: number | null }> {
  console.log('Starting Google Cloud Vision OCR processing...');
  
  try {
    // Convert buffer to base64
    const base64Document = btoa(String.fromCharCode(...documentBuffer));
    
    // Google Cloud Vision API request
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Document
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 1
            }
          ]
        }
      ]
    };

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${Deno.env.get('GOOGLE_CLOUD_API_KEY')}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Vision API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.responses || !result.responses[0]) {
      throw new Error('No response from Google Vision API');
    }

    const textAnnotations = result.responses[0].textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      throw new Error('No text detected by Google Vision OCR');
    }

    // First annotation contains all detected text
    const extractedText = textAnnotations[0].description || '';
    
    // Calculate average confidence if available
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    for (const annotation of textAnnotations) {
      if (annotation.confidence) {
        totalConfidence += annotation.confidence * 100; // Convert to percentage
        confidenceCount++;
      }
    }
    
    // Use actual confidence if available, null if Google doesn't provide it
    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : null;
    
    const confidenceText = averageConfidence !== null ? `${averageConfidence.toFixed(1)}% confidence` : 'no confidence provided';
    console.log(`Google Vision OCR completed: ${extractedText.length} characters, ${confidenceText}`);
    
    return {
      extractedText: extractedText.trim(),
      confidence: averageConfidence
    };
    
  } catch (error) {
    console.error('Google Vision OCR error:', error);
    throw error;
  }
}

// GPT-4o Mini Vision Analysis with OCR cross-validation
async function analyzeWithGPT4oMiniVision(
  documentBuffer: Uint8Array, 
  ocrText: string, 
  filename: string
): Promise<{ medicalData: any; confidence: number | null }> {
  console.log('Starting GPT-4o Mini vision analysis with OCR cross-validation...');
  
  try {
    // Convert buffer to base64 for vision analysis
    const base64Image = btoa(String.fromCharCode(...documentBuffer));
    const mimeType = filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 
                     filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    
    const messages = [
      {
        role: "system" as const,
        content: `You are a medical document analysis AI that extracts structured data from healthcare documents. You have access to both the original document image and OCR text for cross-validation.

TASK: Extract medical information and return as JSON.

OUTPUT FORMAT (strict JSON only):
{
  "documentType": "string", // e.g., "lab_results", "prescription", "medical_record", "insurance_card"
  "patientInfo": {
    "name": "string or null",
    "dateOfBirth": "YYYY-MM-DD or null",
    "mrn": "string or null",
    "insuranceId": "string or null"
  },
  "medicalData": {
    // Flexible object containing relevant medical information
    // Examples: vitals, lab values, medications, diagnoses, procedures
  },
  "dates": {
    "documentDate": "YYYY-MM-DD or null",
    "serviceDate": "YYYY-MM-DD or null"
  },
  "provider": {
    "name": "string or null",
    "facility": "string or null",
    "phone": "string or null"
  },
  "confidence": {
    "overall": 0.95, // 0.0 to 1.0
    "ocrMatch": 0.98, // How well vision analysis matches OCR text
    "extraction": 0.92 // Confidence in extracted medical data
  },
  "notes": "Any important observations or warnings"
}

VALIDATION RULES:
- Cross-check your vision analysis against the provided OCR text
- If OCR text conflicts with vision, note in "notes" field
- Only extract information you can clearly see/read
- Use null for missing information
- Maintain HIPAA compliance (no assumptions, only visible data)`
      },
      {
        role: "user" as const,
        content: [
          {
            type: "text",
            text: `Please analyze this medical document. Here is the OCR text for cross-validation:\n\n${ocrText}\n\nPlease analyze the image and extract medical information, cross-checking against the OCR text.`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          }
        ]
      }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 2000,
      temperature: 0.1 // Low temperature for consistent medical data extraction
    });

    const responseText = response.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from GPT-4o Mini');
    }

    // Parse JSON response
    let medicalData;
    try {
      // Extract JSON from response (in case there's additional text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      medicalData = JSON.parse(jsonString);
    } catch (parseError) {
      throw new Error(`Failed to parse GPT-4o Mini response as JSON: ${parseError}. Response: ${responseText}`);
    }

    // Extract confidence score - use actual AI confidence or null if not provided
    const confidence = medicalData.confidence?.overall || null;
    
    const confText = confidence !== null ? `${(confidence * 100).toFixed(1)}% confidence` : 'no confidence provided';
    console.log(`GPT-4o Mini analysis completed with ${confText}`);
    
    return {
      medicalData,
      confidence: confidence !== null ? confidence * 100 : null // Convert to percentage or keep null
    };
    
  } catch (error) {
    console.error('GPT-4o Mini vision analysis error:', error);
    throw error;
  }
}

// Check if file format is supported
function validateFileFormat(buffer: Uint8Array, filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase();
  const supportedFormats = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif'];
  
  if (!extension || !supportedFormats.includes(extension)) {
    return false;
  }
  
  // Basic file signature validation
  const header = Array.from(buffer.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  if (extension === 'pdf' && !header.startsWith('25504446')) return false; // %PDF
  if (extension === 'png' && !header.startsWith('89504e47')) return false; // PNG
  if ((extension === 'jpg' || extension === 'jpeg') && !header.startsWith('ffd8ff')) return false; // JPEG
  
  return true;
}

// Quality checking with data quality flags
async function performQualityChecks(
  extractedData: any, 
  documentId: string, 
  document: any
): Promise<{
  flags: any[];
  shouldBlock: boolean;
  flagIds: string[];
}> {
  console.log('Starting data quality validation...');
  
  try {
    // Get profile information for quality checking
    // Note: In current schema, documents are linked to patient_id (auth.users)
    // For now, we'll skip profile-specific quality checks and use basic validation
    const flags = await performBasicQualityChecks(extractedData, documentId, document.patient_id, null);
    
    // Check if any critical flags should block processing
    const criticalFlags = flags.filter(flag => flag.severity === 'critical');
    const shouldBlock = criticalFlags.length > 0;
    
    // Store flags in canonical audit system
    const flagIds: string[] = [];
    for (const flag of flags) {
      const { data: flagId, error } = await supabase.rpc('log_audit_event', {
        p_table_name: flag.record_table,
        p_record_id: flag.document_id,
        p_operation: 'QUALITY_FLAG',
        p_old_values: null,
        p_new_values: {
          severity: flag.severity,
          category: flag.category,
          problem_code: flag.problem_code,
          field_name: flag.field_name,
          raw_value: flag.raw_value,
          suggested_correction: flag.suggested_correction,
          confidence_score: flag.confidence_score,
          auto_resolvable: flag.auto_resolvable
        },
        p_reason: `Quality validation flag: ${flag.problem_code}`,
        p_compliance_category: 'clinical_data',
        p_patient_id: flag.profile_id
      });
      
      if (!error && flagId) {
        flagIds.push(flagId);
      }
    }
    
    if (flags.length > 0) {
      console.log(`Quality validation completed: ${flags.length} flags created (${criticalFlags.length} critical)`);
    } else {
      console.log('Quality validation passed: no issues detected');
    }
    
    return { flags, shouldBlock, flagIds };
    
  } catch (error) {
    console.error('Quality validation error:', error);
    // Don't block processing on quality check errors
    return { flags: [], shouldBlock: false, flagIds: [] };
  }
}

// Basic quality checks (simplified version of QualityGuardianEngine)
async function performBasicQualityChecks(
  extractedData: any,
  documentId: string,
  patientId: string,
  profile: any | null
): Promise<any[]> {
  const flags = [];
  const currentDate = new Date();
  
  // Check for future dates in extracted data
  if (extractedData.dates) {
    if (extractedData.dates.documentDate) {
      const docDate = new Date(extractedData.dates.documentDate);
      if (docDate > currentDate) {
        const monthsAhead = (docDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
        if (monthsAhead > 1) {
          flags.push({
            profile_id: patientId,
            document_id: documentId,
            record_table: 'documents',
            record_id: documentId,
            severity: 'warning',
            category: 'temporal',
            problem_code: 'future_date_check',
            field_name: 'document_date',
            raw_value: extractedData.dates.documentDate,
            suggested_correction: currentDate.toISOString().split('T')[0],
            confidence_score: 0.85,
            auto_resolvable: false
          });
        }
      }
    }
  }
  
  // Check for name mismatch between document and profile
  // Note: Skipping name validation since we don't have profile information in this simplified version
  if (extractedData.patientInfo?.name && profile?.display_name) {
    const similarity = calculateSimpleNameSimilarity(
      extractedData.patientInfo.name.toLowerCase(),
      profile.display_name.toLowerCase()
    );
    
    if (similarity < 0.6) {
      flags.push({
        profile_id: patientId,
        document_id: documentId,
        record_table: 'documents',
        record_id: documentId,
        severity: 'critical',
        category: 'demographic',
        problem_code: 'name_similarity_check',
        field_name: 'patient_name',
        raw_value: extractedData.patientInfo.name,
        suggested_correction: profile.display_name,
        confidence_score: 1 - similarity,
        auto_resolvable: false
      });
    }
  }
  
  // Check for incomplete extraction
  const completenessScore = calculateExtractionCompleteness(extractedData);
  if (completenessScore < 0.4) {
    flags.push({
      profile_id: patientId,
      document_id: documentId,
      record_table: 'documents',
      record_id: documentId,
      severity: 'warning',
      category: 'extraction_quality',
      problem_code: 'incomplete_extraction',
      field_name: 'extraction_completeness',
      raw_value: completenessScore,
      suggested_correction: null,
      confidence_score: 0.8,
      auto_resolvable: false
    });
  }
  
  return flags;
}

// Helper function for simple name similarity
function calculateSimpleNameSimilarity(name1: string, name2: string): number {
  const words1 = name1.split(' ');
  const words2 = name2.split(' ');
  let matches = 0;
  
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1.includes(word2) || word2.includes(word1)) {
        matches++;
        break;
      }
    }
  }
  
  return matches / Math.max(words1.length, words2.length);
}

// Helper function to calculate extraction completeness
function calculateExtractionCompleteness(extractedData: any): number {
  let totalFields = 0;
  let filledFields = 0;
  
  const sections = [
    { data: extractedData.patientInfo, weight: 2 },
    { data: extractedData.medicalData, weight: 1.5 },
    { data: extractedData.dates, weight: 1 },
    { data: extractedData.provider, weight: 1 }
  ];
  
  for (const section of sections) {
    totalFields += section.weight;
    if (section.data && Object.keys(section.data).some(key => section.data[key] !== null && section.data[key] !== '')) {
      filledFields += section.weight;
    }
  }
  
  return totalFields > 0 ? filledFields / totalFields : 0;
}

// New vision + OCR safety net pipeline
async function processWithVisionPlusOCR(documentBuffer: Uint8Array, filePath: string): Promise<{
  extractedText: string;
  medicalData: any;
  confidence: number | null;
  ocrConfidence: number | null;
  visionConfidence: number | null;
  processingMethod: string;
}> {
  console.log('Starting Vision + OCR Safety Net pipeline...');
  
  // Validate file format
  if (!validateFileFormat(documentBuffer, filePath)) {
    throw new Error(`Unsupported file format. Supported: PDF, PNG, JPG, JPEG, TIFF. File: ${filePath}`);
  }
  
  // Check file size (reasonable limits for both APIs)
  if (documentBuffer.length > 20 * 1024 * 1024) { // 20MB limit
    throw new Error(`File too large: ${documentBuffer.length} bytes. Maximum size is 20MB.`);
  }
  
  try {
    // Step 1: Google Cloud Vision OCR (safety net)
    console.log('Step 1: Extracting text with Google Cloud Vision OCR...');
    const { extractedText, confidence: ocrConfidence } = await extractWithGoogleVisionOCR(documentBuffer);
    
    // Step 2: GPT-4o Mini Vision Analysis with OCR cross-validation
    console.log('Step 2: Analyzing document with GPT-4o Mini Vision...');
    const { medicalData, confidence: visionConfidence } = await analyzeWithGPT4oMiniVision(
      documentBuffer, 
      extractedText, 
      filePath
    );
    
    // Step 3: Calculate overall confidence (handle null values gracefully)
    let overallConfidence = null;
    
    if (ocrConfidence !== null && visionConfidence !== null) {
      // Both APIs provided confidence - use minimum (conservative approach)
      overallConfidence = Math.min(ocrConfidence, visionConfidence);
    } else if (ocrConfidence !== null) {
      // Only OCR provided confidence
      overallConfidence = ocrConfidence;
    } else if (visionConfidence !== null) {
      // Only Vision provided confidence  
      overallConfidence = visionConfidence;
    }
    // If both are null, overallConfidence remains null
    
    // Healthcare accuracy threshold (only apply if we have confidence data)
    if (overallConfidence !== null && overallConfidence < 80) {
      throw new Error(`Combined confidence too low: ${overallConfidence.toFixed(1)}% (minimum 80% required for medical documents)`);
    }
    
    // Determine dynamic processing method based on what was actually used
    const processingMethod = 'gpt4o_mini_vision_ocr'; // GPT-4o Mini + Google Vision OCR
    
    console.log(`Vision + OCR pipeline completed successfully!`);
    console.log(`   Processing method: ${processingMethod}`);
    console.log(`   OCR confidence: ${ocrConfidence !== null ? ocrConfidence.toFixed(1) + '%' : 'not provided'}`);
    console.log(`   Vision confidence: ${visionConfidence !== null ? visionConfidence.toFixed(1) + '%' : 'not provided'}`);
    console.log(`   Overall confidence: ${overallConfidence !== null ? overallConfidence.toFixed(1) + '%' : 'not available'}`);
    
    return {
      extractedText,
      medicalData,
      confidence: overallConfidence,
      ocrConfidence,
      visionConfidence,
      processingMethod
    };
    
  } catch (error) {
    console.error('Vision + OCR pipeline error:', error);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  // Get secure CORS headers based on origin
  const origin = req.headers.get('origin');
  
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    const requestHeaders = req.headers.get('access-control-request-headers');
    const corsHeaders = getCorsHeaders(origin, true, requestHeaders); // true = preflight
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const corsHeaders = getCorsHeaders(origin);

  try {
    // 1. Extract file path from the request body
    const { filePath } = await req.json();
    if (!filePath) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Missing 'filePath' in request body" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 2. Update the document status to 'processing'
    const { data, error } = await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('storage_path', filePath)
      .select()
      .single();

    if (error) {
      console.error("Error updating document:", error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Document not found or access denied" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // 3. Core processing logic with new Vision + OCR pipeline
    try {
      console.log(`🔍 Step A: Starting file download for: ${filePath}`);
      
      // Download the document from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('medical-docs')
        .download(filePath);
      
      if (downloadError) {
        throw new Error(`File download failed: ${downloadError.message}`);
      }
      console.log(`✅ Step A: File download successful`);

      console.log(`🔍 Step B: Converting file to buffer...`);
      // Convert to buffer
      const fileBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(fileBuffer);
      console.log(`✅ Step B: File converted to buffer: ${uint8Array.length} bytes`);

      console.log(`🔍 Step C: Starting Vision + OCR processing for: ${filePath}`);
      // Process document with new Vision + OCR Safety Net pipeline
      const {
        extractedText,
        medicalData,
        confidence,
        ocrConfidence,
        visionConfidence,
        processingMethod
      } = await processWithVisionPlusOCR(uint8Array, filePath);
      
      console.log(`✅ Step C: Vision + OCR processing completed`);
      
      console.log(`Processing completed with ${confidence?.toFixed(1) || 'N/A'}% overall confidence`);

      // Perform quality validation checks
      const { flags, shouldBlock, flagIds } = await performQualityChecks(medicalData, data.id, data);
      
      // Determine final status based on quality validation
      let finalStatus = 'completed';
      if (shouldBlock) {
        finalStatus = 'flagged_critical';
        console.log('Document processing blocked due to critical quality issues');
      } else if (flags.length > 0) {
        finalStatus = 'flagged_review';
        console.log(`Document completed with ${flags.length} quality flags for review`);
      }

      // Update document with results (mapped to canonical schema fields)
      const { data: updatedDoc, error: updateError } = await supabase
        .from('documents')
        .update({ 
          status: finalStatus,
          extracted_text: extractedText,
          medical_data: medicalData,
          ocr_confidence: ocrConfidence,
          vision_confidence: visionConfidence,
          confidence_score: confidence,
          processing_method: processingMethod,
          processing_completed_at: new Date().toISOString(),
          processing_error: null // Clear any previous errors
        })
        .eq('storage_path', filePath)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      console.log(`Processing completed for document: ${filePath}`);
      console.log(`   OCR: ${ocrConfidence !== null ? ocrConfidence.toFixed(1) + '%' : 'not provided'}`);
      console.log(`   Vision: ${visionConfidence !== null ? visionConfidence.toFixed(1) + '%' : 'not provided'}`);
      console.log(`   Overall: ${confidence !== null ? confidence.toFixed(1) + '%' : 'not available'}`);

      return new Response(JSON.stringify({ 
        success: true, 
        document: updatedDoc,
        results: {
          extractedText,
          medicalData,
          confidence,
          ocrConfidence,
          visionConfidence,
          processingMethod: processingMethod
        },
        qualityValidation: {
          flagsCount: flags.length,
          hasCriticalFlags: shouldBlock,
          flagIds: flagIds,
          status: finalStatus
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });

    } catch (processingError) {
      // Handle processing failures
      console.error(`Processing failed for ${filePath}:`, processingError);
      
      const errorMessage = processingError instanceof Error ? processingError.message : String(processingError);
      
      // Update document status to failed with error log
      const { error: failureUpdateError } = await supabase
        .from('documents')
        .update({ 
          status: 'failed',
          processing_error: JSON.stringify({
            error: errorMessage,
            timestamp: new Date().toISOString(),
            stage: 'vision_plus_ocr_processing',
            processing_method: processingMethod || 'gpt4o_mini_vision_ocr'
          }),
          processing_completed_at: new Date().toISOString()
        })
        .eq('storage_path', filePath);

      if (failureUpdateError) {
        console.error("Failed to update document failure status:", failureUpdateError);
      }

      // Return appropriate error response
      const isClientError = errorMessage.includes('File size exceeds') || 
                           errorMessage.includes('No text detected') ||
                           errorMessage.includes('confidence too low') ||
                           errorMessage.includes('Unsupported file format');

      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMessage,
        filePath,
        processingMethod: 'vision_plus_ocr'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: isClientError ? 422 : 500,
      });
    }

  } catch (err) {
    // Handle unexpected errors
    console.error("❌ CRITICAL ERROR in document processor:", err);
    console.error("Error stack:", err instanceof Error ? err.stack : 'No stack trace');
    
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : 'No stack trace';
    
    // Log to database for debugging
    try {
      await supabase.rpc('log_audit_event', {
        p_table_name: 'documents',
        p_record_id: null,
        p_operation: 'CRITICAL_ERROR',
        p_old_values: null,
        p_new_values: {
          error: errorMessage,
          stack: errorStack,
          timestamp: new Date().toISOString(),
          function_version: 'v2.0'
        },
        p_reason: 'Critical error in document-processor-complex',
        p_compliance_category: 'system_error',
        p_patient_id: null
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }
    
    return new Response(JSON.stringify({
      success: false,
      error: "Internal server error",
      details: errorMessage,
      stack: errorStack,
      version: "v2.0",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});