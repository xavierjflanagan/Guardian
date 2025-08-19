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
    console.log('🔍 MINIMAL PROCESSOR: Starting test...');
    
    // Step 1: Parse request
    const { filePath } = await req.json();
    if (!filePath) {
      throw new Error("Missing 'filePath' in request body");
    }
    console.log(`✅ Step 1: Request parsed, filePath: ${filePath}`);

    // Step 2: Update document status to processing
    const { data, error } = await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('storage_path', filePath)
      .select()
      .single();

    if (error) {
      throw new Error(`Document not found or access denied: ${error.message}`);
    }
    console.log(`✅ Step 2: Document found and updated: ${data.id}`);

    // Step 3: Simulate successful processing with medical data
    const mockMedicalData = {
      documentType: "test_document",
      patientInfo: {
        name: "Test Patient",
        dateOfBirth: "1990-01-01"
      },
      medicalData: {
        test: "Mock AI extraction successful"
      },
      dates: {
        documentDate: "2025-08-19"
      },
      provider: {
        name: "Test Provider"
      },
      confidence: {
        overall: 0.95,
        ocrMatch: 0.98,
        extraction: 0.92
      }
    };

    // Step 4: Update document with mock medical data
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update({ 
        status: 'completed',
        extracted_text: 'Mock extracted text from minimal processor',
        medical_data: mockMedicalData,
        ocr_confidence: 95.5,
        vision_confidence: 92.3,
        confidence_score: 94.0,
        processing_method: 'minimal_test_processor',
        processing_completed_at: new Date().toISOString(),
        processing_error: null
      })
      .eq('storage_path', filePath)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log(`✅ Step 4: Document updated with mock medical data`);

    return new Response(JSON.stringify({ 
      success: true,
      message: "Minimal processor test completed successfully",
      document: updatedDoc,
      mockData: mockMedicalData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error("❌ Minimal processor error:", err);
    
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      processor: "minimal-test"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});