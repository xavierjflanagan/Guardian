import { createClient } from '@/lib/supabaseServerClient'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // URL to redirect to after successful auth exchange
      return NextResponse.redirect(new URL(next, request.url))
    }
    
    console.error('Auth callback error:', error)
    // Redirect to error page with error info
    const url = new URL('/auth/auth-error', request.url)
    url.searchParams.set('message', error.message)
    return NextResponse.redirect(url)
  }

  // Redirect to error page if there's no code
  const url = new URL('/auth/auth-error', request.url)
  url.searchParams.set('message', 'No code found in auth callback request')
  return NextResponse.redirect(url)
} 