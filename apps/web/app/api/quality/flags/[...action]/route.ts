import { createClient } from '@/lib/supabaseServerClient';
import { NextResponse } from 'next/server';
import { validateInputWithSize, validateQualityPath, type ValidationFailure, z } from '@guardian/utils';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Remove unused service role key - using createClient() instead

// Proxy to Supabase Edge Function
export async function GET(
  request: Request, 
  { params }: { params: Promise<{ action: string[] }> }
) {
  try {
    const { action: actionArray } = await params;
    
    // Validate and construct the action path for Edge Function
    // The Edge Function expects paths like: flags/resolve/flag-id or flags (for list)
    let action: string;
    try {
      action = validateQualityPath({ action: actionArray });
    } catch (_error) {
      return NextResponse.json(
        { error: 'Invalid action path' },
        { status: 400 }
      );
    }
    
    // Ensure the path starts with 'flags' for the quality-guardian Edge Function
    if (!action.startsWith('flags')) {
      action = `flags/${action}`;
    }
    
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const urlObj = new URL(request.url);
    const searchParams = urlObj.searchParams;
    
    const url = new URL(`${SUPABASE_URL}/functions/v1/quality-guardian/${action}`);
    searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Quality API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string[] }> }
) {
  try {
    const { action: actionArray } = await params;
    
    // Validate and construct the action path for Edge Function
    // The Edge Function expects paths like: flags/resolve/flag-id or flags (for list)
    let action: string;
    try {
      action = validateQualityPath({ action: actionArray });
    } catch (_error) {
      return NextResponse.json(
        { error: 'Invalid action path' },
        { status: 400 }
      );
    }
    
    // Ensure the path starts with 'flags' for the quality-guardian Edge Function
    if (!action.startsWith('flags')) {
      action = `flags/${action}`;
    }
    
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Extract and validate the request body (only validate body size, not schema)
    const rawBody = await request.json();
    
    // Validate request size only - let Edge Function handle business logic validation
    const sizeValidation = validateInputWithSize(
      z.object({}).passthrough(), // Accept any object structure
      rawBody, 
      request, 
      { maxSize: 1024 * 100 } // 100KB limit for quality flag operations
    );
    
    if (!sizeValidation.success) {
      const failure = sizeValidation as ValidationFailure;
      return NextResponse.json(
        { 
          error: failure.error,
          details: failure.details
        },
        { status: failure.status }
      );
    }
    
    const body = rawBody;
    
    const url = `${SUPABASE_URL}/functions/v1/quality-guardian/${action}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Quality API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}