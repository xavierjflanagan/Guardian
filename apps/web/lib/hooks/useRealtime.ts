'use client'

import { useEffect, useRef, useCallback } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabaseClientSSR'
import { useProfile } from '@/app/providers/ProfileProvider'

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface UseRealtimeOptions {
  onDocumentUpdate?: (payload: any) => void
  onTimelineUpdate?: (payload: any) => void
  onStatusChange?: (status: RealtimeStatus) => void
  enabled?: boolean
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { currentProfile, allowedPatients } = useProfile()
  const supabase = createClient()
  const channelsRef = useRef<RealtimeChannel[]>([])
  const statusRef = useRef<RealtimeStatus>('disconnected')

  const {
    onDocumentUpdate,
    onTimelineUpdate,
    onStatusChange,
    enabled = true
  } = options

  const updateStatus = useCallback((newStatus: RealtimeStatus) => {
    if (statusRef.current !== newStatus) {
      statusRef.current = newStatus
      onStatusChange?.(newStatus)
    }
  }, [onStatusChange])

  const cleanup = useCallback(() => {
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel)
    })
    channelsRef.current = []
  }, [supabase])

  useEffect(() => {
    if (!enabled || !currentProfile) {
      cleanup()
      updateStatus('disconnected')
      return
    }

    updateStatus('connecting')

    // Get patient IDs that this profile has access to
    const patientIds = allowedPatients?.map(p => p.patient_id) || [currentProfile.id]

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
            onDocumentUpdate?.(payload)
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            updateStatus('connected')
          } else if (status === 'CLOSED') {
            updateStatus('disconnected')
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
              onTimelineUpdate?.(payload)
            }
          )
          .subscribe()

        channelsRef.current.push(timelineChannel)
      }

      // Monitor connection status
      const heartbeatInterval = setInterval(() => {
        const hasActiveChannels = channelsRef.current.some(
          channel => channel.state === 'joined'
        )
        if (!hasActiveChannels && statusRef.current === 'connected') {
          updateStatus('disconnected')
        }
      }, 30000) // Check every 30 seconds

      return () => {
        clearInterval(heartbeatInterval)
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
    allowedPatients,
    onDocumentUpdate,
    onTimelineUpdate,
    cleanup,
    updateStatus,
    supabase
  ])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    status: statusRef.current,
    cleanup,
    reconnect: () => {
      cleanup()
      // Re-trigger the effect by updating a dependency
    }
  }
}

// Connection monitoring hook
export function useRealtimeStatus() {
  const statusRef = useRef<RealtimeStatus>('disconnected')

  const handleStatusChange = useCallback((status: RealtimeStatus) => {
    statusRef.current = status
  }, [])

  const realtime = useRealtime({
    onStatusChange: handleStatusChange,
    enabled: true
  })

  return statusRef.current
}