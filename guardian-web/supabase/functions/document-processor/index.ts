import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Validate AWS credentials are available
const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';

if (!awsAccessKeyId || !awsSecretAccessKey) {
  throw new Error(`AWS credentials not configured. ACCESS_KEY: ${!!awsAccessKeyId}, SECRET_KEY: ${!!awsSecretAccessKey}`);
}

// Temporary mock OCR function for testing
async function mockOCRProcessing(filePath: string) {
  console.log('🧪 Mock OCR processing for:', filePath);
  
  // Simulate OCR processing with realistic mock data
  const mockExtractedText = `Medical Document Analysis Report
  
Patient: John Doe
Date: ${new Date().toLocaleDateString()}
Document: ${filePath.split('/').pop()}

MOCK OCR RESULTS:
This is a simulated OCR extraction to test the document processing pipeline.
The actual AWS Textract integration will replace this mock data.

Key Information Extracted:
- Patient Name: John Doe  
- Date of Service: ${new Date().toLocaleDateString()}
- Blood Pressure: 120/80 mmHg
- Heart Rate: 72 bpm
- Temperature: 98.6°F

This mock demonstrates that the complete pipeline is working:
✅ Document upload
✅ Edge Function trigger
✅ Database updates
✅ Text extraction storage

Next step: Replace with real AWS Textract integration.`;

  const mockConfidence = 95.5; // Mock confidence score
  
  return {
    extractedText: mockExtractedText,
    confidence: mockConfidence
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    // 2. Update the document status to 'processing'
    const { data, error } = await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('s3_key', filePath)
      .select()
      .single();

    if (error) {
      console.error("Error updating document:", error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Document not found or access denied" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // 3. Core processing logic with comprehensive error handling
    try {
      // Download the document from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('medical-docs')
        .download(filePath);
      
      if (downloadError) {
        throw new Error(`File download failed: ${downloadError.message}`);
      }

      // Validate file exists and get basic info
      const fileBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(fileBuffer);

      console.log(`File downloaded successfully: ${uint8Array.length} bytes`);

      // Use mock OCR processing (temporary - will replace with real Textract)
      console.log(`🧪 Starting mock OCR processing for document: ${filePath}`);
      
      const { extractedText, confidence } = await mockOCRProcessing(filePath);
      
      console.log(`Mock OCR completed with ${confidence}% confidence`);

      // Update document with OCR results
      const { data: updatedDoc, error: updateError } = await supabase
        .from('documents')
        .update({ 
          status: 'completed',
          extracted_text: extractedText,
          ocr_confidence: confidence,
          processed_at: new Date().toISOString(),
          error_log: null // Clear any previous errors
        })
        .eq('s3_key', filePath)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      console.log(`OCR processing completed for document: ${filePath} (${confidence}% confidence)`);

      return new Response(JSON.stringify({ 
        success: true, 
        document: updatedDoc,
        extractedText,
        confidence
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });

    } catch (processingError) {
      // Handle processing failures - mark document as failed with error details
      console.error(`Processing failed for ${filePath}:`, processingError);
      
      const errorMessage = processingError instanceof Error ? processingError.message : String(processingError);
      
      // Update document status to failed with error log
      const { error: failureUpdateError } = await supabase
        .from('documents')
        .update({ 
          status: 'failed',
          error_log: JSON.stringify({
            error: errorMessage,
            timestamp: new Date().toISOString(),
            stage: 'ocr_processing'
          }),
          processed_at: new Date().toISOString()
        })
        .eq('s3_key', filePath);

      if (failureUpdateError) {
        console.error("Failed to update document failure status:", failureUpdateError);
      }

      // Return appropriate error response
      const isClientError = errorMessage.includes('File size exceeds') || 
                           errorMessage.includes('No text detected') ||
                           errorMessage.includes('confidence too low');

      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMessage,
        filePath
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: isClientError ? 422 : 500,
      });
    }

  } catch (err) {
    // Handle unexpected errors (should rarely reach here due to inner try/catch)
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
