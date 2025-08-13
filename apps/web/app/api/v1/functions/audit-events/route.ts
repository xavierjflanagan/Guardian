import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Extract the body
    const body = await request.json();

    // Get the Supabase URL and key for the Edge Function call
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('Missing Supabase configuration');
      return NextResponse.json(
        { success: false, error: 'Configuration error' },
        { status: 500 }
      );
    }

    // Forward to the Supabase Edge Function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/audit-events`;
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();

    // Forward the response from the Edge Function
    return NextResponse.json(result, { status: response.status });

  } catch (error) {
    console.error('Audit events API route error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        should_use_client_fallback: true
      },
      { status: 500 }
    );
  }
}