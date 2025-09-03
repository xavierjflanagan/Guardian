// =============================================================================
// V3 SUPABASE CLIENT - Edge Functions Database Connection
// =============================================================================
// PURPOSE: Centralized Supabase client setup for V3 Edge Functions
// SECURITY: Service role client for system operations, anon client for user operations
// =============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { EdgeFunctionEnv } from './types.ts';

/**
 * Create Supabase client with service role key (bypasses RLS)
 * USE FOR: System operations, job coordination, analytics tracking
 */
export function createServiceRoleClient(env: EdgeFunctionEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'x-application-name': 'v3-edge-function',
      },
    },
  });
}

/**
 * Create Supabase client with anon key (respects RLS)
 * USE FOR: User-facing operations that need RLS protection
 */
export function createAnonClient(env: EdgeFunctionEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'x-application-name': 'v3-edge-function',
      },
    },
  });
}

/**
 * Validate database connection and get database info
 */
export async function validateConnection(client: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await client
      .from('user_profiles')
      .select('id')
      .limit(1);
      
    if (error) {
      console.error('Database connection validation failed:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}

/**
 * Get environment variables with validation
 */
export function getEdgeFunctionEnv(): EdgeFunctionEnv {
  const env = {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
  };
  
  // Validate required environment variables
  const missing = Object.entries(env)
    .filter(([key, value]) => !value)
    .map(([key]) => key);
    
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return env as EdgeFunctionEnv;
}