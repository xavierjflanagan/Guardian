// =============================================================================
// SHELL-FILE-PROCESSOR-V3 - V3 Document Upload Processing Edge Function
// =============================================================================
// PURPOSE: Process document uploads with V3 job coordination and analytics
// INTEGRATION: Uses shell_files table, enqueue_job_v3 RPC, usage tracking
// SECURITY: Service role for system operations, proper patient_id validation
// 
// SCHEMA AUDIT VERIFIED (2025-09-03):
// - shell_files.status column (NOT upload_status/processing_status)
// - enqueue_job_v3(job_type, job_name, job_payload, job_category, priority, p_scheduled_at)
// - job_category must be: 'critical', 'high_priority', 'standard', 'background', 'maintenance'
// - track_shell_file_upload_usage(p_profile_id, p_shell_file_id, p_file_size_bytes, p_estimated_pages)
// =============================================================================

// REMOVED: encodeBase64 import no longer needed (OCR moved to worker)
import { createServiceRoleClient, getEdgeFunctionEnv } from '../_shared/supabase-client.ts';
import { handlePreflight, addCORSHeaders } from '../_shared/cors.ts';
import {
  createErrorResponse,
  createSuccessResponse,
  handleError,
  validateMethod,
  getCorrelationId,
  getIdempotencyKey,
  ErrorCode
} from '../_shared/error-handling.ts';
import {
  ShellFileUploadRequest,
  UploadProcessingResponse,
  JobPayload,
  EnqueueJobResponse,
  ShellFileRecord
} from '../_shared/types.ts';

// =============================================================================
// OCR INTEGRATION - MOVED TO WORKER FOR INSTANT UPLOAD RESPONSE
// =============================================================================
// OCR processing moved to worker to eliminate 2-4 minute upload delays
// Worker downloads from storage and runs OCR in background

/*
// REMOVED: OCR processing now handled in worker
interface OCRSpatialData {
  extracted_text: string;
  spatial_mapping: Array<{
    text: string;
    bounding_box: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    confidence: number;
  }>;
  ocr_confidence: number;
  processing_time_ms: number;
  ocr_provider: string;
}

// REMOVED: OCR function moved to worker
async function processWithGoogleVisionOCR(
  base64Data: string,
  mimeType: string
): Promise<OCRSpatialData> {
  const googleApiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
  if (!googleApiKey) {
    throw new Error('GOOGLE_CLOUD_API_KEY not configured');
  }

  const startTime = Date.now();

  // Call Google Cloud Vision API
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${googleApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Data },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google Vision API failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const annotation = result.responses?.[0]?.fullTextAnnotation;

  if (!annotation) {
    throw new Error('No text detected in document');
  }

  // Extract full text
  const extractedText = annotation.text || '';

  // Build spatial mapping from pages
  const spatialMapping: OCRSpatialData['spatial_mapping'] = [];
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const page of (annotation.pages || [])) {
    for (const block of (page.blocks || [])) {
      for (const paragraph of (block.paragraphs || [])) {
        const words = paragraph.words || [];
        const text = words
          .map((w: any) => w.symbols?.map((s: any) => s.text).join('') || '')
          .join(' ');

        if (text && paragraph.boundingBox?.vertices) {
          const vertices = paragraph.boundingBox.vertices;
          const x = Math.min(...vertices.map((v: any) => v.x || 0));
          const y = Math.min(...vertices.map((v: any) => v.y || 0));
          const maxX = Math.max(...vertices.map((v: any) => v.x || 0));
          const maxY = Math.max(...vertices.map((v: any) => v.y || 0));

          spatialMapping.push({
            text,
            bounding_box: {
              x,
              y,
              width: maxX - x,
              height: maxY - y,
            },
            confidence: paragraph.confidence || 0.85,
          });

          if (paragraph.confidence) {
            totalConfidence += paragraph.confidence;
            confidenceCount++;
          }
        }
      }
    }
  }

  const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0.85;
  const processingTime = Date.now() - startTime;

  return {
    extracted_text: extractedText,
    spatial_mapping: spatialMapping,
    ocr_confidence: avgConfidence,
    processing_time_ms: processingTime,
    ocr_provider: 'google_cloud_vision',
  };
}
*/

/**
 * Main Edge Function Handler
 */
Deno.serve(async (request: Request) => {
  const correlationId = getCorrelationId(request);
  
  try {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handlePreflight(request);
    }
    
    // Validate method
    const methodError = validateMethod(request, ['POST']);
    if (methodError) {
      return addCORSHeaders(
        createErrorResponse(methodError, 405, correlationId),
        request.headers.get('origin') || undefined
      );
    }
    
    // Initialize environment and database
    const env = getEdgeFunctionEnv();
    const supabase = createServiceRoleClient(env);
    
    // Parse request body
    let requestData: ShellFileUploadRequest;
    try {
      requestData = await request.json();
    } catch (error) {
      return addCORSHeaders(
        createErrorResponse({
          code: ErrorCode.INVALID_REQUEST,
          message: 'Invalid JSON in request body',
          correlation_id: correlationId,
        }, 400, correlationId),
        request.headers.get('origin') || undefined
      );
    }
    
    // Validate required fields
    const validationError = validateUploadRequest(requestData);
    if (validationError) {
      return addCORSHeaders(
        createErrorResponse({
          ...validationError,
          correlation_id: correlationId,
        }, 400, correlationId),
        request.headers.get('origin') || undefined
      );
    }
    
    // Extract and verify JWT
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return addCORSHeaders(
        createErrorResponse({ 
          code: ErrorCode.UNAUTHORIZED, 
          message: 'Missing authorization header', 
          correlation_id: correlationId 
        }, 401, correlationId),
        request.headers.get('origin') || undefined
      );
    }
    
    const jwt = authHeader.slice('Bearer '.length);
    const { data: authUser, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !authUser?.user) {
      return addCORSHeaders(
        createErrorResponse({ 
          code: ErrorCode.UNAUTHORIZED, 
          message: 'Invalid authentication token', 
          correlation_id: correlationId 
        }, 401, correlationId),
        request.headers.get('origin') || undefined
      );
    }

    // Verify patient_id belongs to caller
    const { data: hasAccess, error: accessErr } = await supabase
      .rpc('has_profile_access', { 
        p_user_id: authUser.user.id, 
        p_profile_id: requestData.patient_id 
      });
      
    if (accessErr || !hasAccess) {
      return addCORSHeaders(
        createErrorResponse({ 
          code: ErrorCode.FORBIDDEN, 
          message: 'Access denied to specified patient profile', 
          correlation_id: correlationId 
        }, 403, correlationId),
        request.headers.get('origin') || undefined
      );
    }
    
    // Get or generate idempotency key
    const idempotencyKey = getIdempotencyKey(request) || 
                          requestData.idempotency_key || 
                          crypto.randomUUID();
    
    // Process the shell file upload
    const response = await processShellFileUpload(
      supabase,
      requestData,
      idempotencyKey,
      correlationId
    );
    
    return addCORSHeaders(
      createSuccessResponse(response, correlationId, 201),
      request.headers.get('origin')
    );
    
  } catch (error) {
    const processedError = handleError(error, 'shell-file-processor-v3', correlationId);
    return addCORSHeaders(
      createErrorResponse(processedError, 500, correlationId),
      request.headers.get('origin')
    );
  }
});

/**
 * Validate upload request data
 */
function validateUploadRequest(data: ShellFileUploadRequest): any {
  const required = ['filename', 'file_path', 'file_size_bytes', 'mime_type', 'patient_id'];
  
  for (const field of required) {
    if (!data[field]) {
      return {
        code: ErrorCode.MISSING_REQUIRED_FIELD,
        message: `Missing required field: ${field}`,
      };
    }
  }
  
  // Validate file size (50MB limit)
  if (data.file_size_bytes > 50 * 1024 * 1024) {
    return {
      code: ErrorCode.FILE_TOO_LARGE,
      message: 'File size exceeds 50MB limit',
    };
  }

  // MIME type validation removed (October 31, 2025)
  // Rationale: Let Google Cloud Vision OCR handle format validation
  // - OCR supports many formats (JPEG, PNG, GIF, BMP, WebP, ICO, HEIC, HEIF, PDF, TIFF, RAW)
  // - Whitelist creates maintenance burden and blocks valid formats
  // - OCR will return clear error for truly unsupported formats
  // - Size limit (50MB) provides sufficient protection

  return null;
}

/**
 * Process shell file upload with V3 integration
 * SCHEMA VERIFIED: Uses actual V3 table structures and function signatures
 */
async function processShellFileUpload(
  supabase: any,
  data: ShellFileUploadRequest,
  idempotencyKey: string,
  correlationId: string
): Promise<UploadProcessingResponse> {
  
  // Step 1: Check for existing record with same idempotency key
  const { data: existingFile, error: checkError } = await supabase
    .from('shell_files')
    .select('id, status')
    .eq('idempotency_key', idempotencyKey)
    .single();
    
  if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
    throw new Error(`Database check failed: ${checkError.message}`);
  }
  
  let shellFileId: string;
  
  // Step 2: Create or update shell_files record
  if (existingFile) {
    // Idempotent response - return existing record
    shellFileId = existingFile.id;
    console.log(`[${correlationId}] Idempotent request for shell_file: ${shellFileId}`);
  } else {
    // Create new shell_files record using ACTUAL schema
    const { data: newFile, error: insertError } = await supabase
      .from('shell_files')
      .insert({
        patient_id: data.patient_id,
        filename: data.filename,
        original_filename: data.filename,
        file_size_bytes: data.file_size_bytes,
        mime_type: data.mime_type,
        storage_path: data.file_path,
        page_count: data.estimated_pages || estimatePages(data.file_size_bytes, data.mime_type),
        status: 'uploaded', // VERIFIED: Uses 'status' column
        idempotency_key: idempotencyKey,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();
      
    if (insertError) {
      throw new Error(`Shell file creation failed: ${insertError.message}`);
    }
    
    shellFileId = newFile.id;
    console.log(`[${correlationId}] Created shell_file: ${shellFileId}`);
  }
  
  // Step 3: Check if job already enqueued for this file
  const { data: existingJob, error: jobCheckError } = await supabase
    .from('job_queue')
    .select('id, status')
    .eq('job_type', 'ai_processing')              // FIXED: Use correct job type
    .contains('job_payload', { shell_file_id: shellFileId })
    .in('status', ['pending', 'processing'])
    .single();
    
  if (jobCheckError && jobCheckError.code !== 'PGRST116') {
    throw new Error(`Job check failed: ${jobCheckError.message}`);
  }
  
  let jobId: string;
  
  if (existingJob) {
    // Job already exists
    jobId = existingJob.id;
    console.log(`[${correlationId}] Job already exists: ${jobId}`);
  } else {
    // Step 3: Enqueue Pass 1 entity detection job with storage reference (OCR moved to worker)
    const jobPayload = {
      shell_file_id: shellFileId,
      patient_id: data.patient_id,
      storage_path: data.file_path,
      mime_type: data.mime_type,
      file_size_bytes: data.file_size_bytes,
      uploaded_filename: data.filename,
      correlation_id: correlationId
      // NO ocr_spatial_data anymore - worker will load from storage
      // NO raw_file.file_data anymore - worker downloads from storage
    };

    // Create Pass 1 entity detection job (ai_processing type)
    const { data: jobResponse, error: enqueueError } = await supabase
      .rpc('enqueue_job_v3', {
        job_type: 'ai_processing',
        job_name: `Pass 1: ${data.filename}`,
        job_payload: jobPayload,
        job_category: 'standard',
        priority: 5,
        p_scheduled_at: new Date().toISOString()
        // REMOVED: p_job_lane - not a parameter of this function
      });
      
    if (enqueueError) {
      throw new Error(`Job enqueue failed: ${enqueueError.message}`);
    }
    
    // Handle both array and object response formats
    const responseData = Array.isArray(jobResponse) ? jobResponse[0] : jobResponse;
    jobId = responseData?.job_id;
    
    if (!jobId) {
      throw new Error('Job enqueuing succeeded but no job_id returned');
    }
    
    console.log(`[${correlationId}] Enqueued job: ${jobId} for shell_file: ${shellFileId}`);
  }
  
  // Step 5: Track usage analytics using VERIFIED function signature
  try {
    // VERIFIED: track_shell_file_upload_usage(p_profile_id, p_shell_file_id, p_file_size_bytes, p_estimated_pages)
    const { error: usageError } = await supabase
      .rpc('track_shell_file_upload_usage', {
        p_profile_id: data.patient_id, // In V3, patient_id references user_profiles.id
        p_shell_file_id: shellFileId,
        p_file_size_bytes: data.file_size_bytes,
        p_estimated_pages: data.estimated_pages || estimatePages(data.file_size_bytes, data.mime_type),
      });
      
    if (usageError) {
      // Log but don't fail the request - analytics is not critical
      console.warn(`[${correlationId}] Usage tracking failed (non-critical): ${usageError.message}`);
    } else {
      console.log(`[${correlationId}] Usage tracked for profile: ${data.patient_id}`);
    }
  } catch (error) {
    console.warn(`[${correlationId}] Usage tracking error (non-critical):`, error);
  }
  
  // Step 6: Return success response
  return {
    shell_file_id: shellFileId,
    job_id: jobId,
    status: 'enqueued',
    estimated_processing_time: '2-5 minutes',
  };
}

/**
 * Estimate token usage for AI processing based on file characteristics
 */
function estimateTokensFromFile(fileSizeBytes: number, mimeType: string): number {
  // Base estimation: ~1000 tokens per MB for PDFs, ~500 for images
  const sizeMB = fileSizeBytes / (1024 * 1024);
  
  if (mimeType === 'application/pdf') {
    return Math.ceil(sizeMB * 1000); // PDFs have more text content
  } else if (mimeType.startsWith('image/')) {
    return Math.ceil(sizeMB * 500); // Images need OCR + analysis
  } else {
    return Math.ceil(sizeMB * 750); // Default estimation
  }
}

/**
 * Estimate page count for analytics
 */
function estimatePages(fileSizeBytes: number, mimeType: string): number {
  // Rough estimation based on file type and size
  const sizeMB = fileSizeBytes / (1024 * 1024);
  
  if (mimeType === 'application/pdf') {
    return Math.ceil(sizeMB * 10); // ~10 pages per MB for PDFs
  } else if (mimeType.startsWith('image/')) {
    return 1; // Images are typically 1 page
  } else {
    return Math.ceil(sizeMB * 5); // Conservative estimate for other types
  }
}