import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCorsHeaders } from '../_shared/cors.ts'
import OpenAI from 'https://esm.sh/openai@4.24.1'

// Simple diagnostic function to test AI processing components
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
    const diagnostics: Record<string, any> = {};

    // Test 1: Environment Variables
    console.log('🔍 Testing environment variables...');
    const envVars = {
      'OPENAI_API_KEY': Deno.env.get('OPENAI_API_KEY'),
      'GOOGLE_CLOUD_API_KEY': Deno.env.get('GOOGLE_CLOUD_API_KEY'),
      'SUPABASE_URL': Deno.env.get('SUPABASE_URL'),
      'SUPABASE_SERVICE_ROLE_KEY': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    };

    diagnostics.environment = {};
    for (const [name, value] of Object.entries(envVars)) {
      diagnostics.environment[name] = {
        present: !!value,
        length: value ? value.length : 0,
        prefix: value ? value.substring(0, 8) + '...' : 'missing'
      };
    }

    // Test 2: Supabase Connection
    console.log('🔍 Testing Supabase connection...');
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { data, error } = await supabase
        .from('documents')
        .select('count')
        .limit(1);

      diagnostics.supabase = {
        connected: !error,
        error: error?.message || null
      };
    } catch (supabaseError) {
      diagnostics.supabase = {
        connected: false,
        error: supabaseError.message
      };
    }

    // Test 3: OpenAI API
    console.log('🔍 Testing OpenAI API...');
    try {
      const openai = new OpenAI({
        apiKey: Deno.env.get('OPENAI_API_KEY')!,
      });

      const response = await openai.models.list();
      diagnostics.openai = {
        connected: true,
        modelsCount: response.data.length,
        hasGPT4oMini: response.data.some(model => model.id.includes('gpt-4o-mini'))
      };
    } catch (openaiError) {
      diagnostics.openai = {
        connected: false,
        error: openaiError.message
      };
    }

    // Test 4: Google Cloud Vision API
    console.log('🔍 Testing Google Cloud Vision API...');
    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${Deno.env.get('GOOGLE_CLOUD_API_KEY')}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [{
              image: { content: '' },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
            }]
          })
        }
      );

      if (response.ok) {
        diagnostics.googleVision = {
          connected: true,
          status: response.status
        };
      } else {
        const errorText = await response.text();
        diagnostics.googleVision = {
          connected: false,
          status: response.status,
          error: errorText
        };
      }
    } catch (visionError) {
      diagnostics.googleVision = {
        connected: false,
        error: visionError.message
      };
    }

    // Test 5: Simple GPT-4o Mini call
    console.log('🔍 Testing GPT-4o Mini call...');
    try {
      const openai = new OpenAI({
        apiKey: Deno.env.get('OPENAI_API_KEY')!,
      });

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "Say 'AI diagnostic test successful' and nothing else."
          }
        ],
        max_tokens: 10,
        temperature: 0
      });

      diagnostics.gpt4oMiniTest = {
        success: true,
        response: response.choices[0]?.message?.content,
        usage: response.usage
      };
    } catch (gptError) {
      diagnostics.gpt4oMiniTest = {
        success: false,
        error: gptError.message
      };
    }

    console.log('✅ Diagnostics completed successfully');

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      diagnostics
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error("Diagnostic error:", err);
    
    return new Response(JSON.stringify({
      success: false,
      error: "Diagnostic failed",
      details: err instanceof Error ? err.message : String(err)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});