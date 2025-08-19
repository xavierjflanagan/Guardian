import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    const requestHeaders = req.headers.get('access-control-request-headers');
    const corsHeaders = getCorsHeaders(origin, true, requestHeaders);
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const corsHeaders = getCorsHeaders(origin);

  try {
    console.log('🔍 DEBUG: Getting full document details...');
    
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select(`
        id, document_type, document_subtype, provider_name, facility_name, 
        service_date, processing_method, medical_data, vision_confidence,
        confidence_score, status, created_at
      `)
      .order('created_at', { ascending: false })
      .limit(3);

    if (docsError) {
      throw new Error(`Documents query failed: ${docsError.message}`);
    }

    console.log(`Found ${docs?.length || 0} documents`);

    return new Response(JSON.stringify({
      success: true,
      documents: docs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error("Debug docs error:", err);
    
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});