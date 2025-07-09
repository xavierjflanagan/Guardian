import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors'

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Extract file path from the request body
    const { filePath } = await req.json();
    if (!filePath) {
      throw new Error("Missing 'filePath' in request body");
    }

    // 2. Update the document status to 'processing'
    const { data, error } = await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('s3_key', filePath)
      .select()
      .single();

    if (error) {
      console.error("Error updating document:", error);
      throw new Error("Failed to update document status");
    }

    // 3. (Future Step) Add the actual OCR/AI processing logic here
    // For now, we just log that the process would start
    console.log(`Processing started for document: ${filePath}`);

    return new Response(JSON.stringify({ success: true, document: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    return new Response(String((err as Error)?.message ?? err), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
