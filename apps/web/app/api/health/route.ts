import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServerClient'

export async function GET() {
  try {
    const startTime = Date.now()
    
    // Check Supabase connection
    const supabase = await createClient()
    const { error } = await supabase
      .from('user_profiles')
      .select('count')
      .limit(1)
      .single()

    const responseTime = Date.now() - startTime

    // Basic health metrics
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      region: process.env.VERCEL_REGION || 'local',
      deployment: {
        id: process.env.VERCEL_DEPLOYMENT_ID || 'local',
        url: process.env.VERCEL_URL || 'localhost:3000'
      },
      checks: {
        database: {
          status: error ? 'unhealthy' : 'healthy',
          responseTime: `${responseTime}ms`,
          error: error?.message || null
        },
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal,
          rss: process.memoryUsage().rss
        }
      },
      uptime: process.uptime()
    }

    // Return 503 if any critical service is down
    if (error) {
      return NextResponse.json(
        { ...health, status: 'unhealthy' },
        { status: 503 }
      )
    }

    return NextResponse.json(health, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('Health check failed:', error)
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        checks: {
          database: { status: 'unhealthy', error: 'Connection failed' }
        }
      },
      { status: 503 }
    )
  }
}