import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders } from '../_shared/cors.ts'

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Simple test function to isolate the exact failure point
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const requestHeaders = req.headers.get('access-control-request-headers');
    const corsHeaders = getCorsHeaders(origin, true, requestHeaders);
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const corsHeaders = getCorsHeaders(origin);

  try {
    console.log('🔍 Starting simplified document processor test...');
    
    // Step 1: Parse request
    const { filePath } = await req.json();
    if (!filePath) {
      throw new Error("Missing 'filePath' in request body");
    }
    console.log(`✅ Step 1: Request parsed, filePath: ${filePath}`);

    // Step 2: Update document status
    const { data, error } = await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('storage_path', filePath)
      .select()
      .single();

    if (error) {
      throw new Error(`Document not found or access denied: ${error.message}`);
    }
    console.log(`✅ Step 2: Document updated to processing, ID: ${data.id}`);

    // Step 3: Test file download
    console.log('🔍 Step 3: Testing file download...');
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('medical-docs')
      .download(filePath);
    
    if (downloadError) {
      throw new Error(`File download failed: ${downloadError.message}`);
    }
    console.log(`✅ Step 3: File downloaded successfully`);

    // Step 4: Test file conversion
    console.log('🔍 Step 4: Testing file conversion...');
    const fileBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(fileBuffer);
    console.log(`✅ Step 4: File converted to buffer, size: ${uint8Array.length} bytes`);

    // Step 5: Test file format validation
    console.log('🔍 Step 5: Testing file format validation...');
    const extension = filePath.split('.').pop()?.toLowerCase();
    const supportedFormats = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif'];
    
    if (!extension || !supportedFormats.includes(extension)) {
      throw new Error(`Unsupported file format: ${extension}`);
    }
    console.log(`✅ Step 5: File format valid: ${extension}`);

    // Step 6: Test file size validation
    console.log('🔍 Step 6: Testing file size validation...');
    if (uint8Array.length > 20 * 1024 * 1024) {
      throw new Error(`File too large: ${uint8Array.length} bytes (max 20MB)`);
    }
    console.log(`✅ Step 6: File size acceptable: ${(uint8Array.length / 1024 / 1024).toFixed(2)}MB`);

    // Update document to completed (for now)
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update({ 
        status: 'completed',
        extracted_text: 'Test successful - no processing performed',
        processing_completed_at: new Date().toISOString(),
        processing_error: null
      })
      .eq('storage_path', filePath)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log('✅ All steps completed successfully!');

    return new Response(JSON.stringify({ 
      success: true,
      message: "Simplified processing test completed successfully",
      document: updatedDoc,
      steps: [
        "Request parsed",
        "Document status updated", 
        "File downloaded",
        "File converted to buffer",
        "File format validated",
        "File size validated",
        "Database updated"
      ]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error("❌ Error in simplified processor:", err);
    
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      step: "Failed during processing"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});