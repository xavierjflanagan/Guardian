// Simple test script to validate OCR integration
// Run with: node test-ocr.js

const test_payload = {
  filePath: "test-user-id/1234567890_sample-medical-doc.pdf"
};

const EDGE_FUNCTION_URL = "https://your-project-ref.supabase.co/functions/v1/document-processor";

async function testOCRIntegration() {
  console.log("🧪 Testing OCR Integration...");
  console.log("📄 Test payload:", test_payload);
  
  // Load API key from environment variable
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseAnonKey) {
    console.log("❌ Missing SUPABASE_ANON_KEY environment variable");
    console.log("💡 Set it with: export SUPABASE_ANON_KEY=your_key_here");
    return;
  }
  
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify(test_payload)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log("✅ OCR Integration Test PASSED");
      console.log("📊 Results:");
      console.log(`   - Status: ${result.document?.status}`);
      console.log(`   - Confidence: ${result.confidence?.toFixed(2)}%`);
      console.log(`   - Text Length: ${result.extractedText?.length || 0} characters`);
      console.log(`   - Text Preview: "${result.extractedText?.substring(0, 100)}..."`);
    } else {
      console.log("❌ OCR Integration Test FAILED");
      console.log("🔍 Error:", result);
    }
    
  } catch (error) {
    console.log("❌ OCR Integration Test FAILED");
    console.log("🔍 Error:", error.message);
  }
}

// Instructions for running this test
console.log(`
📋 Before running this test:
1. Apply the database migration to remote Supabase
2. Set up AWS credentials in Supabase Edge Function secrets
3. Deploy the Edge Function: supabase functions deploy document-processor
4. Set environment variable: export SUPABASE_ANON_KEY=your_remote_anon_key
5. Upload a test document through the web app first, then use its s3_key as filePath

🚀 Run test: node test-ocr.js
`);

// Only run if called directly
if (require.main === module) {
  testOCRIntegration();
}