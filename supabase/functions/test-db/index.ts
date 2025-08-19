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
    // Test 1: Check if documents table exists and has medical_data column
    console.log('Testing documents table access...');
    
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id, medical_data, processing_method, status, created_at')
      .order('created_at', { ascending: false })
      .limit(3);

    if (docsError) {
      throw new Error(`Documents query failed: ${docsError.message}`);
    }

    console.log(`Found ${docs?.length || 0} documents`);

    // Test 2: Try to insert a test record to verify column exists
    console.log('Testing medical_data column exists...');
    
    const testData = {
      documentType: "test",
      patientInfo: { name: "Test Patient" },
      medicalData: { test: "data" }
    };

    const { data: testInsert, error: insertError } = await supabase
      .from('documents')
      .select('medical_data')
      .limit(1);

    return new Response(JSON.stringify({
      success: true,
      tests: {
        documentsTableAccess: !docsError,
        documentsCount: docs?.length || 0,
        recentDocuments: docs,
        medicalDataColumnExists: !insertError,
        error: docsError?.message || insertError?.message || null
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error("Database test error:", err);
    
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});