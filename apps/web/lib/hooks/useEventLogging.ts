'use client'

import { useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabaseClientSSR'
import { useProfile } from '@/app/providers/ProfileProvider'

// Healthcare-specific metadata types
export interface BaseEventMetadata {
  category: string
  user_agent: string
  timestamp: string
  // Server-side audit tracking
  server_side_attempted?: boolean
  fallback_reason?: string
  integrity_verified?: boolean
  audit_id?: string
}

export interface NavigationMetadata extends BaseEventMetadata {
  page?: string
  from?: string
  to?: string
  route?: string
}

export interface InteractionMetadata extends BaseEventMetadata {
  element?: string
  action_type?: string
  component?: string
}

export interface DataAccessMetadata extends BaseEventMetadata {
  document_id?: string
  patient_id?: string
  data_type?: string
  access_level?: string
}

export interface ProfileMetadata extends BaseEventMetadata {
  to_profile?: string
  profile_name?: string
  profile_type?: string
}

export interface SystemMetadata extends BaseEventMetadata {
  version?: string
  error?: string
  performance_metric?: string
  // Test and development fields
  long_field?: string
  count?: number
}

export type EventMetadata = 
  | NavigationMetadata 
  | InteractionMetadata 
  | DataAccessMetadata 
  | ProfileMetadata 
  | SystemMetadata 
  | BaseEventMetadata

export interface UserEvent {
  action: string
  metadata: EventMetadata
  profile_id: string
  session_id: string
  privacy_level: 'public' | 'internal' | 'sensitive'
}

export type EventCategory = 'navigation' | 'interaction' | 'data_access' | 'profile' | 'system'

// Critical events that require server-side logging with integrity verification
const CRITICAL_EVENTS = [
  'data_access.document_view',
  'data_access.document_download', 
  'data_access.document_export',
  'profile.switch',
  'profile.access_granted',
  'system.authentication_success',
  'system.authentication_failure',
  'data_access.medical_record_edit',
  'interaction.consent_change',
  'data_access.provider_access_grant',
  'system.security_violation',
  'system.unauthorized_access_attempt',
  'navigation.restricted_area_access'
];

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
function sanitizeMetadata(metadata: Partial<EventMetadata>): EventMetadata {
  const sanitized = { ...metadata } as EventMetadata
  
  // Remove potential PII fields
  const piiFields = ['email', 'phone', 'ssn', 'medical_record_number', 'name', 'address']
  piiFields.forEach(field => {
    if (field in sanitized) {
      delete (sanitized as unknown as Record<string, unknown>)[field]
    }
  })
  
  // Truncate long strings to prevent data leaks
  Object.keys(sanitized).forEach(key => {
    const value = (sanitized as unknown as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.length > 200) {
      (sanitized as unknown as Record<string, unknown>)[key] = value.substring(0, 200) + '...[truncated]'
    }
  })
  
  return sanitized
}

// Server-side critical audit logging via Edge Function
async function logCriticalAuditEvent(
  category: EventCategory,
  action: string,
  currentProfile: { id: string; patient_id?: string },
  metadata: Partial<EventMetadata>,
  privacyLevel: 'public' | 'internal' | 'sensitive',
  sessionId: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ success: boolean; audit_id?: string; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('No valid session for critical audit logging');
    }

    const auditEvent = {
      event_type: category,
      action,
      profile_id: currentProfile.id,
      patient_id: currentProfile.patient_id,
      metadata: sanitizeMetadata({
        ...metadata,
        category,
        timestamp: new Date().toISOString()
      }),
      privacy_level: privacyLevel,
      session_id: sessionId,
      compliance_category: privacyLevel === 'sensitive' ? 'hipaa' : 'gdpr'
    };

    const response = await fetch('/api/v1/functions/audit-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(auditEvent)
    });

    const result = await response.json();
    
    if (!response.ok) {
      // If server says to use client logging, that's not an error
      if (result.should_use_client_logging) {
        return { success: false, error: 'Not a critical event' };
      }
      throw new Error(result.error || 'Server-side audit logging failed');
    }

    return { 
      success: true, 
      audit_id: result.audit_id 
    };
  } catch (error) {
    console.warn('Critical audit logging failed, will fallback to client-side:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Injection interface for server-side audit logging
interface UseEventLoggingOptions {
  auditLogger?: typeof logCriticalAuditEvent
}

export function useEventLogging(options?: UseEventLoggingOptions) {
  const { currentProfile } = useProfile()
  const supabase = createClient()
  const sessionIdRef = useRef<string | undefined>(undefined)
  
  // Use injected audit logger or default implementation
  const auditLogger = options?.auditLogger || logCriticalAuditEvent

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
    metadata: Partial<EventMetadata> = {},
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

    const eventKey = `${category}.${action}`;
    const isCriticalEvent = CRITICAL_EVENTS.includes(eventKey);

    try {
      // For critical events, try server-side logging first
      if (isCriticalEvent) {
        const serverResult = await auditLogger(
          category, action, currentProfile, metadata, privacyLevel, getSessionId(), supabase
        );
        
        if (serverResult.success) {
          console.log(`Critical audit event logged server-side: ${eventKey}`, serverResult.audit_id);
          return; // Success - no need for client-side fallback
        }
        
        // If not actually a critical event (server decision), fall through to client logging
        if (serverResult.error === 'Not a critical event') {
          console.log(`Event ${eventKey} classified as non-critical by server, using client logging`);
        } else {
          console.warn(`Server-side critical audit failed: ${serverResult.error}, falling back to client`);
        }
      }

      // Client-side logging (fallback for critical events, primary for non-critical)
      const event: UserEvent = {
        action: eventKey,
        metadata: sanitizeMetadata({
          ...metadata,
          category,
          user_agent: navigator.userAgent.substring(0, 100), // Truncated for privacy
          timestamp: new Date().toISOString(),
          // Mark if this was a fallback from server-side logging
          server_side_attempted: isCriticalEvent,
          fallback_reason: isCriticalEvent ? 'Server-side audit unavailable' : undefined
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
  const logNavigation = useCallback((action: string, metadata?: Partial<NavigationMetadata>) => {
    return logEvent('navigation', action, metadata, 'internal')
  }, [logEvent])

  const logInteraction = useCallback((action: string, metadata?: Partial<InteractionMetadata>) => {
    return logEvent('interaction', action, metadata, 'internal')
  }, [logEvent])

  const logDataAccess = useCallback((action: string, metadata?: Partial<DataAccessMetadata>) => {
    return logEvent('data_access', action, metadata, 'sensitive')
  }, [logEvent])

  const logProfile = useCallback((action: string, metadata?: Partial<ProfileMetadata>) => {
    return logEvent('profile', action, metadata, 'internal')
  }, [logEvent])

  const logSystem = useCallback((action: string, metadata?: Partial<SystemMetadata>) => {
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