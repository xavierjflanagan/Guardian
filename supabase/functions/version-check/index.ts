import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    const requestHeaders = req.headers.get('access-control-request-headers');
    const corsHeaders = getCorsHeaders(origin, true, requestHeaders);
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const corsHeaders = getCorsHeaders(origin);

  return new Response(JSON.stringify({
    success: true,
    version: "2.0",
    functionName: "document-processor-complex",
    timestamp: new Date().toISOString(),
    processingMethod: "gpt4o_mini_vision_ocr",
    medicalDataEnabled: true,
    message: "This confirms the updated function is deployed and accessible"
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
});