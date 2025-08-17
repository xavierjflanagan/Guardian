import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Check for password protection first
  const sitePassword = process.env.SITE_PASSWORD;
  const isPasswordProtected = !!sitePassword;
  
  if (isPasswordProtected) {
    // Allow access to auth callbacks, login page and static assets
    if (request.nextUrl.pathname === '/site-login' ||
        request.nextUrl.pathname.startsWith('/auth/') ||
        request.nextUrl.pathname.startsWith('/_next/') ||
        request.nextUrl.pathname.startsWith('/favicon.ico') ||
        request.nextUrl.pathname === '/_password-login.html') {
      
      // For auth callbacks, create a minimal response that preserves auth state
      if (request.nextUrl.pathname.startsWith('/auth/')) {
        const response = NextResponse.next();
        // Ensure auth callbacks bypass password protection completely
        console.log('Auth callback detected, bypassing password protection:', request.nextUrl.pathname);
        return response;
      }
      
      return NextResponse.next();
    }
    
    // Check if user has valid password cookie
    const passwordCookie = request.cookies.get('site-access');
    if (!passwordCookie || passwordCookie.value !== sitePassword) {
      // Don't redirect auth-related requests to password page
      if (request.nextUrl.pathname.includes('auth') || request.nextUrl.searchParams.has('code')) {
        console.log('Auth-related request detected, preserving auth flow');
        return NextResponse.next();
      }
      
      // Redirect to password page
      return NextResponse.rewrite(new URL('/_password-login.html', request.url));
    }
  }
  
  // Check for maintenance mode (disabled for now - using password protection instead)
  const maintenanceEnv = process.env.MAINTENANCE_MODE;
  const isMaintenanceMode = maintenanceEnv === 'true';
  if (isMaintenanceMode) {
    // Allow static assets and the maintenance file itself
    if (request.nextUrl.pathname.startsWith('/_next/') ||
        request.nextUrl.pathname.startsWith('/favicon.ico') ||
        request.nextUrl.pathname === '/_maintenance.html') {
      return NextResponse.next();
    }
    // Rewrite everything else to static maintenance page
    const maintenanceResponse = NextResponse.rewrite(new URL('/_maintenance.html', request.url));
    
    // Note: CORS headers are platform-level, can't be removed in middleware
    
    // Add security headers to maintenance page
    maintenanceResponse.headers.set('X-Frame-Options', 'DENY');
    maintenanceResponse.headers.set('X-Content-Type-Options', 'nosniff');
    maintenanceResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    maintenanceResponse.headers.set('x-maintenance-mode', 'active');
    
    return maintenanceResponse;
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // IMPORTANT: The `auth.getUser()` method must be called to refresh the session cookie.
  await supabase.auth.getUser()

  // Generate nonce for CSP
  const nonce = crypto.randomUUID();
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Add security headers for healthcare application protection
  const securityHeaders = {
    // HSTS - Force HTTPS (without preload until domain ready)
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    
    // Prevent iframe embedding (clickjacking protection)
    'X-Frame-Options': 'DENY',
    
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // Control referrer information
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Restrict dangerous browser features
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    
    // Cross-Origin policies - disabled until auth flows validated
    // 'Cross-Origin-Opener-Policy': 'same-origin',
    // 'Cross-Origin-Embedder-Policy': 'require-corp',
    
    // Content Security Policy (Report-Only during testing)
    'Content-Security-Policy-Report-Only': [
      "default-src 'self'",
      isProduction 
        ? `script-src 'self' 'nonce-${nonce}' https://*.supabase.co`
        : `script-src 'self' 'unsafe-eval' 'nonce-${nonce}' https://*.supabase.co https://vercel.live`,
      `style-src 'self' 'unsafe-inline' 'nonce-${nonce}'`, 
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      isProduction
        ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
        : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vercel.live",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; ')
  };

  // Store nonce for use in pages (if needed)
  response.headers.set('x-nonce', nonce);

  // Apply security headers to response (exclude some headers for API routes)
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
  
  Object.entries(securityHeaders).forEach(([key, value]) => {
    // Don't add Content-Security-Policy to API routes - they need to handle their own CORS
    if (isApiRoute && key === 'Content-Security-Policy') {
      return;
    }
    response.headers.set(key, value);
  });

  // Note: CORS headers handled at platform level, not in middleware

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
} 