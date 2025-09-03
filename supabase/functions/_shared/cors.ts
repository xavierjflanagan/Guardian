// =============================================================================
// V3 CORS HANDLER - Edge Functions CORS Configuration
// =============================================================================
// PURPOSE: Standardized CORS handling for V3 Edge Functions
// SECURITY: Configured for healthcare application requirements
// =============================================================================

import { CORSConfig, HTTPMethod } from './types.ts';

// Production CORS Configuration
const CORS_CONFIG: CORSConfig = {
  origin: [
    'https://exorahealth.com.au',           // Production domain
    'https://staging.exorahealth.com.au',   // Staging domain
    'http://localhost:3000',                // Local development
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  headers: [
    'Content-Type',
    'Authorization', 
    'x-client-info',
    'apikey',
    'x-correlation-id',
    'x-idempotency-key'
  ],
  credentials: true,
};

/**
 * Create CORS headers for Edge Function responses
 */
export function createCORSHeaders(origin?: string): Headers {
  const headers = new Headers();
  
  // Determine allowed origin
  let allowedOrigin = 'https://exorahealth.com.au'; // Default to production
  
  if (origin && CORS_CONFIG.origin.includes(origin)) {
    allowedOrigin = origin;
  }
  
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', CORS_CONFIG.methods.join(', '));
  headers.set('Access-Control-Allow-Headers', CORS_CONFIG.headers.join(', '));
  headers.set('Access-Control-Allow-Credentials', CORS_CONFIG.credentials.toString());
  headers.set('Access-Control-Max-Age', '86400'); // 24 hours preflight cache
  
  return headers;
}

/**
 * Handle preflight OPTIONS requests
 */
export function handlePreflight(request: Request): Response {
  const origin = request.headers.get('origin');
  const corsHeaders = createCORSHeaders(origin);
  
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Add CORS headers to existing response
 */
export function addCORSHeaders(response: Response, origin?: string): Response {
  const corsHeaders = createCORSHeaders(origin);
  
  // Copy existing headers
  const newHeaders = new Headers(response.headers);
  
  // Add CORS headers
  for (const [key, value] of corsHeaders.entries()) {
    newHeaders.set(key, value);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Validate origin against allowed origins
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return CORS_CONFIG.origin.includes(origin);
}