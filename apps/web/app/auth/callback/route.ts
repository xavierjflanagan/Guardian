import { createClient } from '@/lib/supabaseServerClient'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  console.log('Auth callback received:', {
    url: requestUrl.toString(),
    code: code ? 'present' : 'missing',
    next: next,
    origin: requestUrl.origin
  });

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.session) {
      console.log('Auth callback success:', {
        user: data.user?.email || 'unknown',
        sessionExists: !!data.session,
        redirectTo: next
      });
      
      // URL to redirect to after successful auth exchange
      const redirectUrl = new URL(next, request.url);
      console.log('Redirecting to:', redirectUrl.toString());
      return NextResponse.redirect(redirectUrl);
    }
    
    console.error('Auth callback error:', error);
    // Redirect to error page with error info
    const url = new URL('/auth/auth-error', request.url)
    url.searchParams.set('message', error?.message || 'Session exchange failed')
    return NextResponse.redirect(url)
  }

  // Redirect to error page if there's no code
  console.error('Auth callback: No code found');
  const url = new URL('/auth/auth-error', request.url)
  url.searchParams.set('message', 'No code found in auth callback request')
  return NextResponse.redirect(url)
} 