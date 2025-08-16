import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders } from '../_shared/cors.ts'

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Validate required environment variables
const requiredEnvVars = {
  'SUPABASE_URL': Deno.env.get('SUPABASE_URL'),
  'SUPABASE_SERVICE_ROLE_KEY': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
};

for (const [name, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

console.log('🔑 Document processor (simplified) initialized successfully');

/**
 * Guardian v7 Phase 1 Document Processor
 * 
 * Simplified architecture: Just enqueue processing jobs for background workers
 * Heavy processing (OCR, Vision AI, Quality checks) handled by Render workers
 */
Deno.serve(async (req: Request) => {
  // Get secure CORS headers based on origin
  const origin = req.headers.get('origin');
  
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(origin, true); // true = preflight
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

    console.log(`📥 Processing request for document: ${filePath}`);

    // 2. Update the document status to 'processing'
    const { data: document, error: docError } = await supabase
      .from('documents')
      .update({ 
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('storage_path', filePath)
      .select('id, patient_id, filename, source_system')
      .single();

    if (docError || !document) {
      console.error("Error updating document:", docError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Document not found or access denied" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // 3. Enqueue job for background processing
    const { data: jobId, error: queueError } = await supabase
      .rpc('enqueue_job', {
        p_job_type: 'document_processing',
        p_job_data: {
          document_id: document.id,
          patient_id: document.patient_id,
          file_path: filePath,
          filename: document.filename,
          processing_method: 'vision_plus_ocr',
          source_system: document.source_system || 'guardian_native',
          enqueued_by: 'edge_function'
        },
        p_priority: 1,
        p_scheduled_for: new Date().toISOString()
      });

    if (queueError) {
      console.error("Error enqueueing job:", queueError);
      
      // Revert document status
      await supabase
        .from('documents')
        .update({ 
          status: 'failed',
          processing_error: JSON.stringify({
            error: 'Failed to enqueue processing job',
            details: queueError.message,
            timestamp: new Date().toISOString()
          })
        })
        .eq('id', document.id);

      return new Response(JSON.stringify({ 
        success: false, 
        error: "Failed to enqueue document processing job" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    console.log(`✅ Document queued for processing: ${filePath} (Job ID: ${jobId})`);

    // 4. Return immediately - processing will happen in background
    return new Response(JSON.stringify({ 
      success: true,
      message: "Document queued for processing",
      document_id: document.id,
      job_id: jobId,
      status: "queued",
      estimated_processing_time: "2-5 minutes"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 202, // 202 Accepted - processing will happen asynchronously
    });

  } catch (err) {
    console.error("Unexpected error in document processor:", err);
    
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    return new Response(JSON.stringify({
      success: false,
      error: "Internal server error",
      details: errorMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});