import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import OpenAI from 'openai'

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Initialize OpenAI client for GPT-4o Mini
const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')!,
});

// Validate required environment variables
const requiredEnvVars = {
  'OPENAI_API_KEY': Deno.env.get('OPENAI_API_KEY'),
  'GOOGLE_CLOUD_API_KEY': Deno.env.get('GOOGLE_CLOUD_API_KEY'),
  'SUPABASE_URL': Deno.env.get('SUPABASE_URL'),
  'SUPABASE_SERVICE_ROLE_KEY': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
};

for (const [name, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

console.log('🔑 Environment validation passed - all required API keys configured');

// Google Cloud Vision OCR integration
async function extractWithGoogleVisionOCR(documentBuffer: Uint8Array): Promise<{ extractedText: string; confidence: number | null }> {
  console.log('🔍 Starting Google Cloud Vision OCR processing...');
  
  try {
    // Convert buffer to base64
    const base64Document = btoa(String.fromCharCode(...documentBuffer));
    
    // Google Cloud Vision API request
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Document
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 1
            }
          ]
        }
      ]
    };

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${Deno.env.get('GOOGLE_CLOUD_API_KEY')}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Vision API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.responses || !result.responses[0]) {
      throw new Error('No response from Google Vision API');
    }

    const textAnnotations = result.responses[0].textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      throw new Error('No text detected by Google Vision OCR');
    }

    // First annotation contains all detected text
    const extractedText = textAnnotations[0].description || '';
    
    // Calculate average confidence if available
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    for (const annotation of textAnnotations) {
      if (annotation.confidence) {
        totalConfidence += annotation.confidence * 100; // Convert to percentage
        confidenceCount++;
      }
    }
    
    // Use actual confidence if available, null if Google doesn't provide it
    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : null;
    
    const confidenceText = averageConfidence !== null ? `${averageConfidence.toFixed(1)}% confidence` : 'no confidence provided';
    console.log(`✅ Google Vision OCR completed: ${extractedText.length} characters, ${confidenceText}`);
    
    return {
      extractedText: extractedText.trim(),
      confidence: averageConfidence
    };
    
  } catch (error) {
    console.error('❌ Google Vision OCR error:', error);
    throw error;
  }
}

// GPT-4o Mini Vision Analysis with OCR cross-validation
async function analyzeWithGPT4oMiniVision(
  documentBuffer: Uint8Array, 
  ocrText: string, 
  filename: string
): Promise<{ medicalData: any; confidence: number | null }> {
  console.log('🧠 Starting GPT-4o Mini vision analysis with OCR cross-validation...');
  
  try {
    // Convert buffer to base64 for vision analysis
    const base64Image = btoa(String.fromCharCode(...documentBuffer));
    const mimeType = filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 
                     filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    
    const messages = [
      {
        role: "system" as const,
        content: `You are a medical document analysis AI that extracts structured data from healthcare documents. You have access to both the original document image and OCR text for cross-validation.

TASK: Extract medical information and return as JSON.

OUTPUT FORMAT (strict JSON only):
{
  "documentType": "string", // e.g., "lab_results", "prescription", "medical_record", "insurance_card"
  "patientInfo": {
    "name": "string or null",
    "dateOfBirth": "YYYY-MM-DD or null",
    "mrn": "string or null",
    "insuranceId": "string or null"
  },
  "medicalData": {
    // Flexible object containing relevant medical information
    // Examples: vitals, lab values, medications, diagnoses, procedures
  },
  "dates": {
    "documentDate": "YYYY-MM-DD or null",
    "serviceDate": "YYYY-MM-DD or null"
  },
  "provider": {
    "name": "string or null",
    "facility": "string or null",
    "phone": "string or null"
  },
  "confidence": {
    "overall": 0.95, // 0.0 to 1.0
    "ocrMatch": 0.98, // How well vision analysis matches OCR text
    "extraction": 0.92 // Confidence in extracted medical data
  },
  "notes": "Any important observations or warnings"
}

VALIDATION RULES:
- Cross-check your vision analysis against the provided OCR text
- If OCR text conflicts with vision, note in "notes" field
- Only extract information you can clearly see/read
- Use null for missing information
- Maintain HIPAA compliance (no assumptions, only visible data)`
      },
      {
        role: "user" as const,
        content: [
          {
            type: "text",
            text: `Please analyze this medical document. Here is the OCR text for cross-validation:\n\n${ocrText}\n\nPlease analyze the image and extract medical information, cross-checking against the OCR text.`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          }
        ]
      }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 2000,
      temperature: 0.1 // Low temperature for consistent medical data extraction
    });

    const responseText = response.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from GPT-4o Mini');
    }

    // Parse JSON response
    let medicalData;
    try {
      // Extract JSON from response (in case there's additional text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      medicalData = JSON.parse(jsonString);
    } catch (parseError) {
      throw new Error(`Failed to parse GPT-4o Mini response as JSON: ${parseError}. Response: ${responseText}`);
    }

    // Extract confidence score - use actual AI confidence or null if not provided
    const confidence = medicalData.confidence?.overall || null;
    
    const confText = confidence !== null ? `${(confidence * 100).toFixed(1)}% confidence` : 'no confidence provided';
    console.log(`✅ GPT-4o Mini analysis completed with ${confText}`);
    
    return {
      medicalData,
      confidence: confidence !== null ? confidence * 100 : null // Convert to percentage or keep null
    };
    
  } catch (error) {
    console.error('❌ GPT-4o Mini vision analysis error:', error);
    throw error;
  }
}

// Check if file format is supported
function validateFileFormat(buffer: Uint8Array, filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase();
  const supportedFormats = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif'];
  
  if (!extension || !supportedFormats.includes(extension)) {
    return false;
  }
  
  // Basic file signature validation
  const header = Array.from(buffer.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  if (extension === 'pdf' && !header.startsWith('25504446')) return false; // %PDF
  if (extension === 'png' && !header.startsWith('89504e47')) return false; // PNG
  if ((extension === 'jpg' || extension === 'jpeg') && !header.startsWith('ffd8ff')) return false; // JPEG
  
  return true;
}

// New vision + OCR safety net pipeline
async function processWithVisionPlusOCR(documentBuffer: Uint8Array, filePath: string): Promise<{
  extractedText: string;
  medicalData: any;
  confidence: number | null;
  ocrConfidence: number | null;
  visionConfidence: number | null;
}> {
  console.log('🔍 Starting Vision + OCR Safety Net pipeline...');
  
  // Validate file format
  if (!validateFileFormat(documentBuffer, filePath)) {
    throw new Error(`Unsupported file format. Supported: PDF, PNG, JPG, JPEG, TIFF. File: ${filePath}`);
  }
  
  // Check file size (reasonable limits for both APIs)
  if (documentBuffer.length > 20 * 1024 * 1024) { // 20MB limit
    throw new Error(`File too large: ${documentBuffer.length} bytes. Maximum size is 20MB.`);
  }
  
  try {
    // Step 1: Google Cloud Vision OCR (safety net)
    console.log('📝 Step 1: Extracting text with Google Cloud Vision OCR...');
    const { extractedText, confidence: ocrConfidence } = await extractWithGoogleVisionOCR(documentBuffer);
    
    // Step 2: GPT-4o Mini Vision Analysis with OCR cross-validation
    console.log('🧠 Step 2: Analyzing document with GPT-4o Mini Vision...');
    const { medicalData, confidence: visionConfidence } = await analyzeWithGPT4oMiniVision(
      documentBuffer, 
      extractedText, 
      filePath
    );
    
    // Step 3: Calculate overall confidence (handle null values gracefully)
    let overallConfidence = null;
    
    if (ocrConfidence !== null && visionConfidence !== null) {
      // Both APIs provided confidence - use minimum (conservative approach)
      overallConfidence = Math.min(ocrConfidence, visionConfidence);
    } else if (ocrConfidence !== null) {
      // Only OCR provided confidence
      overallConfidence = ocrConfidence;
    } else if (visionConfidence !== null) {
      // Only Vision provided confidence  
      overallConfidence = visionConfidence;
    }
    // If both are null, overallConfidence remains null
    
    // Healthcare accuracy threshold (only apply if we have confidence data)
    if (overallConfidence !== null && overallConfidence < 80) {
      throw new Error(`Combined confidence too low: ${overallConfidence.toFixed(1)}% (minimum 80% required for medical documents)`);
    }
    
    console.log(`🎉 Vision + OCR pipeline completed successfully!`);
    console.log(`   📊 OCR confidence: ${ocrConfidence !== null ? ocrConfidence.toFixed(1) + '%' : 'not provided'}`);
    console.log(`   👁️  Vision confidence: ${visionConfidence !== null ? visionConfidence.toFixed(1) + '%' : 'not provided'}`);
    console.log(`   ✅ Overall confidence: ${overallConfidence !== null ? overallConfidence.toFixed(1) + '%' : 'not available'}`);
    
    return {
      extractedText,
      medicalData,
      confidence: overallConfidence,
      ocrConfidence,
      visionConfidence
    };
    
  } catch (error) {
    console.error('❌ Vision + OCR pipeline error:', error);
    throw error;
  }
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

    // 3. Core processing logic with new Vision + OCR pipeline
    try {
      // Download the document from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('medical-docs')
        .download(filePath);
      
      if (downloadError) {
        throw new Error(`File download failed: ${downloadError.message}`);
      }

      // Convert to buffer
      const fileBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(fileBuffer);
      console.log(`File downloaded successfully: ${uint8Array.length} bytes`);

      // Process document with new Vision + OCR Safety Net pipeline
      console.log(`🚀 Starting Vision + OCR processing for document: ${filePath}`);
      
      const {
        extractedText,
        medicalData,
        confidence,
        ocrConfidence,
        visionConfidence
      } = await processWithVisionPlusOCR(uint8Array, filePath);
      
      console.log(`✅ Processing completed with ${confidence.toFixed(1)}% overall confidence`);

      // Update document with results
      const { data: updatedDoc, error: updateError } = await supabase
        .from('documents')
        .update({ 
          status: 'completed',
          extracted_text: extractedText,
          medical_data: medicalData,
          ocr_confidence: ocrConfidence,
          vision_confidence: visionConfidence,
          overall_confidence: confidence,
          processed_at: new Date().toISOString(),
          processing_method: 'vision_plus_ocr',
          error_log: null // Clear any previous errors
        })
        .eq('s3_key', filePath)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      console.log(`🎉 Processing completed for document: ${filePath}`);
      console.log(`   📊 OCR: ${ocrConfidence !== null ? ocrConfidence.toFixed(1) + '%' : 'not provided'}`);
      console.log(`   👁️  Vision: ${visionConfidence !== null ? visionConfidence.toFixed(1) + '%' : 'not provided'}`);
      console.log(`   ✅ Overall: ${confidence !== null ? confidence.toFixed(1) + '%' : 'not available'}`);

      return new Response(JSON.stringify({ 
        success: true, 
        document: updatedDoc,
        results: {
          extractedText,
          medicalData,
          confidence,
          ocrConfidence,
          visionConfidence,
          processingMethod: 'vision_plus_ocr'
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });

    } catch (processingError) {
      // Handle processing failures
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
            stage: 'vision_plus_ocr_processing',
            processing_method: 'vision_plus_ocr'
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
                           errorMessage.includes('confidence too low') ||
                           errorMessage.includes('Unsupported file format');

      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMessage,
        filePath,
        processingMethod: 'vision_plus_ocr'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: isClientError ? 422 : 500,
      });
    }

  } catch (err) {
    // Handle unexpected errors
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