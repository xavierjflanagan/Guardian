import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const correctPassword = process.env.SITE_PASSWORD;
    
    // Check if password protection is enabled
    if (!correctPassword) {
      return NextResponse.json({ success: true }); // No password protection
    }
    
    // Validate password
    if (password === correctPassword) {
      const response = NextResponse.json({ success: true });
      
      // Set secure cookie
      response.cookies.set('site-access', password, {
        httpOnly: false, // Allow JavaScript access for client-side checks
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
      
      return response;
    } else {
      return NextResponse.json({ success: false }, { status: 401 });
    }
  } catch (_error) {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}