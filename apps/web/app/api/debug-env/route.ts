import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Simple debug endpoint to check env vars
  const debug = {
    SITE_PASSWORD: process.env.SITE_PASSWORD ? 'SET' : 'NOT_SET',
    NODE_ENV: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  };

  return NextResponse.json(debug);
}