'use client'

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabaseClientSSR'
import { useProfile } from '@/app/providers/ProfileProvider'

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

// Branded ID types to prevent mix-ups
export type PatientId = string & { readonly __brand: 'PatientId' }
export type ProfileId = string & { readonly __brand: 'ProfileId' }

// Document and timeline record types  
export type DocumentRecord = {
  id: string
  patient_id: PatientId
  file_name: string
  processing_status: string
  created_at: string
}

export type TimelineRecord = {
  id: string  
  patient_id: PatientId
  event_type: string
  title: string
  date: string
  created_at: string
}

// Discriminated union for event payloads
export type DocumentEventPayload = {
  type: 'document'
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new?: DocumentRecord
  old?: DocumentRecord
}

export type TimelineEventPayload = {
  type: 'timeline'  
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new?: TimelineRecord
  old?: TimelineRecord
}

export type RealtimeEventPayload = DocumentEventPayload | TimelineEventPayload

export interface UseRealtimeOptions {
  onDocumentUpdate?: (payload: DocumentEventPayload) => void
  onTimelineUpdate?: (payload: TimelineEventPayload) => void
  onStatusChange?: (status: RealtimeStatus) => void
  enabled?: boolean
  // Performance optimization options
  heartbeatInterval?: number  // Default: 30000ms (30 seconds)
  reconnectDelay?: number     // Default: 1000ms (1 second)
  maxReconnectAttempts?: number // Default: 5 attempts
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { currentProfile, allowedPatients } = useProfile()
  const supabase = createClient()
  const channelsRef = useRef<RealtimeChannel[]>([])
  const statusRef = useRef<RealtimeStatus>('disconnected')
  const reconnectAttemptsRef = useRef<number>(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  
  // Fix #1: Add recreateFlag to avoid infinite loops
  const [recreateFlag, setRecreateFlag] = useState(0)
  
  // Stabilize allowedPatients dependency to avoid array identity issues
  const allowedPatientIds = useMemo(() => 
    allowedPatients?.map(p => p.patient_id).sort().join(',') || '', 
    [allowedPatients]
  )

  const {
    onDocumentUpdate,
    onTimelineUpdate,
    onStatusChange,
    enabled = true,
    heartbeatInterval = 30000,      // 30 seconds (optimized for healthcare workflows)
    reconnectDelay = 1000,          // 1 second initial delay
    maxReconnectAttempts = 5        // Max 5 attempts before giving up
  } = options

  const updateStatus = useCallback((newStatus: RealtimeStatus) => {
    if (statusRef.current !== newStatus) {
      statusRef.current = newStatus
      onStatusChange?.(newStatus)
    }
  }, [onStatusChange])

  const cleanup = useCallback(() => {
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = undefined
    }
    
    // Fix: Copy array before iteration to avoid concurrent modification
    const channelsToCleanup = [...channelsRef.current]
    channelsRef.current = []
    
    // Clean up all channels safely
    channelsToCleanup.forEach(channel => {
      try {
        supabase.removeChannel(channel)
      } catch (error) {
        console.warn('Error removing channel:', error)
      }
    })
    
    reconnectAttemptsRef.current = 0
  }, [supabase])

  // Enhanced reconnection logic with jitter, capped wait, and online/offline awareness
  const attemptReconnection = useCallback(() => {
    // Check if browser is online before attempting reconnection
    if (!navigator.onLine) {
      console.log('Browser offline - deferring reconnection until online')
      updateStatus('disconnected')
      return
    }
    
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.warn('Max reconnection attempts reached')
      updateStatus('error')
      return
    }

    reconnectAttemptsRef.current += 1
    
    // Add jitter (±25%) and cap total wait at 30 seconds
    const baseDelay = Math.min(
      reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1), 
      30000 // Cap at 30 seconds max
    )
    const jitter = baseDelay * 0.25 * (Math.random() - 0.5) // ±25% jitter
    const backoffDelay = Math.max(baseDelay + jitter, 100) // Minimum 100ms
    
    console.log(`Reconnection attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${Math.round(backoffDelay)}ms`)
    
    reconnectTimeoutRef.current = setTimeout(() => {
      // Fix: Use recreateFlag instead of cleanup to avoid infinite loop
      setRecreateFlag(prev => prev + 1)
    }, backoffDelay)
  }, [maxReconnectAttempts, reconnectDelay, updateStatus])

  useEffect(() => {
    if (!enabled || !currentProfile) {
      cleanup()
      updateStatus('disconnected')
      return
    }

    updateStatus('connecting')

    // Get patient IDs that this profile has access to (use stable array)
    const patientIds = allowedPatientIds ? allowedPatientIds.split(',').filter(Boolean) : [currentProfile.id]

    try {
      // Subscribe to document processing updates
      const documentsChannel = supabase
        .channel(`documents_${currentProfile.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'documents',
            filter: patientIds.length > 1 
              ? `patient_id=in.(${patientIds.join(',')})` 
              : `patient_id=eq.${patientIds[0]}`
          },
          (payload) => {
            console.log('Document update:', payload)
            
            // Runtime guards as instructed
            if (!['INSERT', 'UPDATE', 'DELETE'].includes(payload.eventType)) {
              console.warn(`Invalid document eventType: ${payload.eventType}. Skipping callback.`)
              return
            }
            
            // Basic field validation - if invalid, skip callback and log once
            const hasValidNewRecord = !payload.new || (payload.new && typeof payload.new === 'object' && 'id' in payload.new)
            const hasValidOldRecord = !payload.old || (payload.old && typeof payload.old === 'object' && 'id' in payload.old)
            
            if (!hasValidNewRecord || !hasValidOldRecord) {
              console.warn(`Invalid document record structure. Skipping callback.`)
              return
            }
            
            onDocumentUpdate?.({
              type: 'document',
              eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
              new: payload.new as DocumentRecord | undefined,
              old: payload.old as DocumentRecord | undefined
            })
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            reconnectAttemptsRef.current = 0 // Reset on successful connection
            updateStatus('connected')
            console.log('Documents channel connected successfully')
          } else if (status === 'CLOSED') {
            updateStatus('disconnected')
            console.log('Documents channel closed, attempting reconnection...')
            attemptReconnection()
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Documents channel error')
            updateStatus('error')
            attemptReconnection()
          }
        })

      channelsRef.current.push(documentsChannel)

      // Subscribe to timeline events if we have patient access
      if (patientIds.length > 0) {
        const timelineChannel = supabase
          .channel(`timeline_${currentProfile.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'healthcare_timeline_events',
              filter: patientIds.length > 1
                ? `patient_id=in.(${patientIds.join(',')})` 
                : `patient_id=eq.${patientIds[0]}`
            },
            (payload) => {
              console.log('Timeline update:', payload)
              
              // Runtime guards as instructed
              if (!['INSERT', 'UPDATE', 'DELETE'].includes(payload.eventType)) {
                console.warn(`Invalid timeline eventType: ${payload.eventType}. Skipping callback.`)
                return
              }
              
              // Basic field validation - if invalid, skip callback and log once
              const hasValidNewRecord = !payload.new || (payload.new && typeof payload.new === 'object' && 'id' in payload.new)
              const hasValidOldRecord = !payload.old || (payload.old && typeof payload.old === 'object' && 'id' in payload.old)
              
              if (!hasValidNewRecord || !hasValidOldRecord) {
                console.warn(`Invalid timeline record structure. Skipping callback.`)
                return
              }
              
              onTimelineUpdate?.({
                type: 'timeline',
                eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
                new: payload.new as TimelineRecord | undefined,
                old: payload.old as TimelineRecord | undefined
              })
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('Timeline channel connected successfully')
            } else if (status === 'CLOSED') {
              console.log('Timeline channel closed')
            } else if (status === 'CHANNEL_ERROR') {
              console.error('Timeline channel error')
            }
          })

        channelsRef.current.push(timelineChannel)
      }

      // Enhanced connection monitoring with healthcare-optimized intervals
      const heartbeatIntervalId = setInterval(() => {
        const activeChannels = channelsRef.current.filter(
          channel => channel.state === 'joined'
        )
        
        if (activeChannels.length === 0 && statusRef.current === 'connected') {
          console.warn('No active channels detected, updating status to disconnected')
          updateStatus('disconnected')
          attemptReconnection()
        } else if (activeChannels.length > 0 && statusRef.current === 'disconnected') {
          console.log('Active channels detected, updating status to connected')
          updateStatus('connected')
          reconnectAttemptsRef.current = 0 // Reset attempts on recovery
        }
        
        // Log connection health for healthcare monitoring
        if (process.env.NODE_ENV === 'development') {
          console.log(`Heartbeat: ${activeChannels.length}/${channelsRef.current.length} channels active`)
        }
      }, heartbeatInterval)

      return () => {
        clearInterval(heartbeatIntervalId)
        cleanup()
      }

    } catch (error) {
      console.error('Realtime subscription error:', error)
      updateStatus('error')
    }

    return cleanup
  }, [
    enabled,
    currentProfile,
    allowedPatientIds, // Use stable string instead of array
    onDocumentUpdate,
    onTimelineUpdate,
    cleanup,
    updateStatus,
    supabase,
    heartbeatInterval,
    attemptReconnection,
    recreateFlag // Key addition to trigger reconnections
  ])

  // Browser online/offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      if (statusRef.current === 'error' || statusRef.current === 'disconnected') {
        console.log('Browser back online - attempting reconnection')
        reconnectAttemptsRef.current = 0 // Reset attempts on network recovery
        setRecreateFlag(prev => prev + 1)
      }
    }
    
    const handleOffline = () => {
      console.log('Browser offline - will defer reconnections')
      updateStatus('disconnected')
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [updateStatus])


  return {
    status: statusRef.current,
    cleanup,
    reconnect: useCallback(() => {
      console.log('Manual reconnection requested')
      cleanup()
      reconnectAttemptsRef.current = 0 // Reset attempts for manual reconnection
      setRecreateFlag(prev => prev + 1) // Actually trigger re-subscription
    }, [cleanup]),
    // Healthcare monitoring information
    connectionHealth: {
      reconnectAttempts: reconnectAttemptsRef.current,
      maxAttempts: maxReconnectAttempts,
      isHealthy: statusRef.current === 'connected' && reconnectAttemptsRef.current === 0
    }
  }
}

// Connection monitoring hook
export function useRealtimeStatus() {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected')

  useRealtime({
    onStatusChange: setStatus, // Triggers re-renders!
    enabled: true
  })

  return status // State, not ref
}