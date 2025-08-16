// CORS configuration with environment-driven allowlist strategy
const ALLOWED_ORIGINS = Deno.env.get('CORS_ALLOWED_ORIGINS')?.split(',').map(origin => origin.trim()) || [
  // Default allowlist for development and production
  'http://localhost:3000',
  'https://exorahealth.com.au',
  'https://www.exorahealth.com.au',
  'https://exora-guardian-healthcare.vercel.app',
  'https://exora-guardian-healthcare-xaviers-projects-f7976c44.vercel.app'
];

export function getCorsHeaders(origin: string | null, isPreflightRequest: boolean = false, requestHeaders?: string | null) {
  const baseHeaders = {
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
  };

  // On preflight, dynamically echo requested headers if provided
  if (isPreflightRequest && requestHeaders) {
    baseHeaders['Access-Control-Allow-Headers'] = requestHeaders;
  }

  // Add preflight-specific headers
  if (isPreflightRequest) {
    baseHeaders['Access-Control-Max-Age'] = '86400'; // 24 hours
  }

  // Check if origin is in allowlist
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      ...baseHeaders,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true'
    };
  }
  
  // Deny by default - return headers without Access-Control-Allow-Origin
  return baseHeaders;
}

// Backward compatibility - deprecated, use getCorsHeaders() instead
export const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
