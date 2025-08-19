import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  console.log('🔍 HELLO TEST: Function started');
  
  const origin = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    console.log('🔍 HELLO TEST: Handling CORS preflight');
    const requestHeaders = req.headers.get('access-control-request-headers');
    const corsHeaders = getCorsHeaders(origin, true, requestHeaders);
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const corsHeaders = getCorsHeaders(origin);

  try {
    console.log('🔍 HELLO TEST: Processing request');
    
    // Test parsing request body
    let requestData;
    try {
      requestData = await req.json();
      console.log('✅ HELLO TEST: Request body parsed:', requestData);
    } catch (parseError) {
      console.log('❌ HELLO TEST: Failed to parse JSON:', parseError);
      throw new Error(`JSON parse error: ${parseError.message}`);
    }

    console.log('✅ HELLO TEST: All checks passed');

    return new Response(JSON.stringify({ 
      success: true,
      message: "Hello test function works!",
      timestamp: new Date().toISOString(),
      receivedData: requestData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error("❌ HELLO TEST error:", err);
    
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      function: "hello-test"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});