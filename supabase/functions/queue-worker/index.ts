import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Import our AI processing functions
// (We'll copy the key functions from document-processor-complex)

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    const requestHeaders = req.headers.get('access-control-request-headers');
    const corsHeaders = getCorsHeaders(origin, true, requestHeaders);
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const corsHeaders = getCorsHeaders(origin);

  try {
    console.log('🔍 Queue Worker: Processing pending jobs...');
    
    // 1. Get pending jobs from queue
    const { data: pendingJobs, error: jobError } = await supabase
      .from('job_queue')
      .select('*')
      .eq('status', 'pending')
      .eq('type', 'document_processing')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5); // Process 5 jobs at a time

    if (jobError) {
      throw new Error(`Failed to fetch jobs: ${jobError.message}`);
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No pending jobs found',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`Found ${pendingJobs.length} pending jobs to process`);

    const results = [];

    for (const job of pendingJobs) {
      try {
        console.log(`Processing job ${job.id}: ${job.type}`);
        
        // Mark job as processing
        await supabase
          .from('job_queue')
          .update({ 
            status: 'processing', 
            started_at: new Date().toISOString(),
            worker_id: 'queue-worker-v1'
          })
          .eq('id', job.id);

        // Extract file path from job payload
        const filePath = job.payload.file_path;
        
        if (!filePath) {
          throw new Error('No file_path in job payload');
        }

        // Call our AI processing function directly (same logic as document-processor-complex)
        console.log(`Calling document-processor-complex for: ${filePath}`);
        
        const { data: processResult, error: processError } = await supabase.functions.invoke(
          'document-processor-complex',
          {
            body: { filePath: filePath }
          }
        );

        if (processError) {
          throw new Error(`AI processing failed: ${processError.message}`);
        }

        // Mark job as completed
        await supabase
          .from('job_queue')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString(),
            result: processResult
          })
          .eq('id', job.id);

        console.log(`✅ Job ${job.id} completed successfully`);
        
        results.push({
          jobId: job.id,
          status: 'completed',
          filePath: filePath
        });

      } catch (jobError) {
        console.error(`❌ Job ${job.id} failed:`, jobError);
        
        // Mark job as failed
        await supabase
          .from('job_queue')
          .update({ 
            status: 'failed',
            completed_at: new Date().toISOString(),
            error: jobError.message,
            retry_count: (job.retry_count || 0) + 1
          })
          .eq('id', job.id);

        results.push({
          jobId: job.id,
          status: 'failed',
          error: jobError.message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${results.length} jobs`,
      results: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error("Queue worker error:", err);
    
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});