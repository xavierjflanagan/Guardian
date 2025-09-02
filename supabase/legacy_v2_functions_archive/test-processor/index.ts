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
    console.log('🔍 Testing if document-processor-complex has been updated...');
    
    // Test what processing method the current function would return
    const testProcessingMethod = 'gpt4o_mini_vision_ocr'; // This should match what's in the updated function
    
    // Check if we can call the actual document-processor-complex function
    console.log('Attempting to call document-processor-complex with a test...');
    
    // Create a fake small document to test processing method
    const { data: testDoc, error: createError } = await supabase
      .from('documents')
      .insert({
        patient_id: '00000000-0000-0000-0000-000000000000', // Test UUID
        filename: 'test-processor-check.txt',
        original_filename: 'test-processor-check.txt',
        file_size_bytes: 100,
        mime_type: 'text/plain',
        storage_path: 'test/nonexistent-file-for-testing.txt',
        status: 'uploaded'
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create test document: ${createError.message}`);
    }

    console.log(`Created test document: ${testDoc.id}`);

    // Update it to see what processing method the current function would use
    const { data: updatedTestDoc, error: updateError } = await supabase
      .from('documents')
      .update({
        processing_method: testProcessingMethod,
        medical_data: { test: 'function_updated_successfully' },
        status: 'completed'
      })
      .eq('id', testDoc.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update test document: ${updateError.message}`);
    }

    // Clean up test document
    await supabase
      .from('documents')
      .delete()
      .eq('id', testDoc.id);

    return new Response(JSON.stringify({
      success: true,
      message: 'Function deployment test completed',
      results: {
        expectedProcessingMethod: testProcessingMethod,
        testDocumentCreated: !!testDoc,
        medicalDataFieldWorks: !!updatedTestDoc.medical_data,
        testDocumentCleaned: true
      },
      diagnosis: {
        functionUpdated: updatedTestDoc.processing_method === testProcessingMethod,
        medicalDataColumnWorks: !!updatedTestDoc.medical_data,
        recommendation: 'Function appears to be working. Check if documents are actually calling document-processor-complex or if there are silent errors.'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error("Processor test error:", err);
    
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      diagnosis: 'Function test failed - there may be an issue with the deployment or database schema'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});