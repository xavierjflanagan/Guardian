'use client'

import { useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabaseClientSSR'
import { useProfile } from '@/app/providers/ProfileProvider'

export interface UserEvent {
  action: string
  metadata: Record<string, any>
  profile_id: string
  session_id: string
  privacy_level: 'public' | 'internal' | 'sensitive'
}

export type EventCategory = 'navigation' | 'interaction' | 'data_access' | 'profile' | 'system'

// Client-side rate limiting implementation
class EventLogger {
  private eventCounts = new Map<string, { count: number; resetTime: number }>()
  private readonly RATE_LIMIT = 100 // events per minute
  private readonly WINDOW_MS = 60000 // 1 minute

  canLog(profileId: string): boolean {
    const now = Date.now()
    const key = profileId
    const bucket = this.eventCounts.get(key) || { count: 0, resetTime: now + this.WINDOW_MS }
    
    if (now > bucket.resetTime) {
      bucket.count = 0
      bucket.resetTime = now + this.WINDOW_MS
    }
    
    if (bucket.count >= this.RATE_LIMIT) {
      console.warn(`Event logging rate limit exceeded for profile ${profileId}`)
      return false
    }
    
    bucket.count++
    this.eventCounts.set(key, bucket)
    return true
  }

  reset(profileId: string) {
    this.eventCounts.delete(profileId)
  }
}

const eventLogger = new EventLogger()

// Privacy-aware metadata sanitization
function sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
  const sanitized = { ...metadata }
  
  // Remove potential PII fields
  const piiFields = ['email', 'phone', 'ssn', 'medical_record_number', 'name', 'address']
  piiFields.forEach(field => {
    if (field in sanitized) {
      delete sanitized[field]
    }
  })
  
  // Truncate long strings to prevent data leaks
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 200) {
      sanitized[key] = sanitized[key].substring(0, 200) + '...[truncated]'
    }
  })
  
  return sanitized
}

export function useEventLogging() {
  const { currentProfile } = useProfile()
  const supabase = createClient()
  const sessionIdRef = useRef<string | undefined>(undefined)

  // Generate or reuse session ID
  const getSessionId = useCallback(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = crypto.randomUUID()
    }
    return sessionIdRef.current
  }, [])

  const logEvent = useCallback(async (
    category: EventCategory,
    action: string, 
    metadata: Record<string, any> = {},
    privacyLevel: 'public' | 'internal' | 'sensitive' = 'internal'
  ) => {
    if (!currentProfile) {
      console.warn('Cannot log event: no current profile')
      return
    }

    // Rate limiting check
    if (!eventLogger.canLog(currentProfile.id)) {
      return // Skip if rate limited
    }

    try {
      const event: UserEvent = {
        action: `${category}.${action}`,
        metadata: sanitizeMetadata({
          ...metadata,
          category,
          user_agent: navigator.userAgent.substring(0, 100), // Truncated for privacy
          timestamp: new Date().toISOString()
        }),
        profile_id: currentProfile.id,
        session_id: getSessionId(),
        privacy_level: privacyLevel
      }

      await supabase.from('user_events').insert(event)
    } catch (error) {
      console.error('Event logging failed:', error)
    }
  }, [currentProfile, supabase, getSessionId])

  // Convenience methods for different event categories
  const logNavigation = useCallback((action: string, metadata?: Record<string, any>) => {
    return logEvent('navigation', action, metadata, 'internal')
  }, [logEvent])

  const logInteraction = useCallback((action: string, metadata?: Record<string, any>) => {
    return logEvent('interaction', action, metadata, 'internal')
  }, [logEvent])

  const logDataAccess = useCallback((action: string, metadata?: Record<string, any>) => {
    return logEvent('data_access', action, metadata, 'sensitive')
  }, [logEvent])

  const logProfile = useCallback((action: string, metadata?: Record<string, any>) => {
    return logEvent('profile', action, metadata, 'internal')
  }, [logEvent])

  const logSystem = useCallback((action: string, metadata?: Record<string, any>) => {
    return logEvent('system', action, metadata, 'public')
  }, [logEvent])

  // Reset rate limiting (useful when switching profiles)
  const resetRateLimit = useCallback(() => {
    if (currentProfile) {
      eventLogger.reset(currentProfile.id)
    }
  }, [currentProfile])

  return {
    logEvent,
    logNavigation,
    logInteraction,
    logDataAccess,
    logProfile,
    logSystem,
    resetRateLimit,
    canLog: currentProfile ? () => eventLogger.canLog(currentProfile.id) : () => false
  }
}