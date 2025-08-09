'use client'

import { useState } from 'react'
import { useRealtime, type RealtimeStatus } from '@/lib/hooks/useRealtime'

interface ConnectionStatusProps {
  className?: string
  showText?: boolean
}

export function ConnectionStatus({ className = '', showText = true }: ConnectionStatusProps) {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const { reconnect } = useRealtime({
    onStatusChange: (newStatus) => setStatus(newStatus),
    onDocumentUpdate: () => setLastUpdate(new Date()),
    onTimelineUpdate: () => setLastUpdate(new Date()),
    enabled: true
  })

  const getStatusConfig = (status: RealtimeStatus) => {
    switch (status) {
      case 'connected':
        return {
          color: 'text-green-600',
          bg: 'bg-green-100',
          dot: 'bg-green-500',
          text: 'Connected'
        }
      case 'connecting':
        return {
          color: 'text-yellow-600',
          bg: 'bg-yellow-100',
          dot: 'bg-yellow-500 animate-pulse',
          text: 'Connecting...'
        }
      case 'error':
        return {
          color: 'text-red-600',
          bg: 'bg-red-100',
          dot: 'bg-red-500',
          text: 'Error'
        }
      default:
        return {
          color: 'text-gray-600',
          bg: 'bg-gray-100',
          dot: 'bg-gray-400',
          text: 'Disconnected'
        }
    }
  }

  const config = getStatusConfig(status)

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        <div className={`w-2 h-2 rounded-full ${config.dot}`} />
        {status === 'connected' && (
          <div className="absolute -inset-1 w-4 h-4 rounded-full bg-green-500 opacity-25 animate-ping" />
        )}
      </div>
      
      {showText && (
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${config.color}`}>
            {config.text}
          </span>
          {lastUpdate && status === 'connected' && (
            <span className="text-xs text-gray-500">
              Last update: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
      
      {(status === 'error' || status === 'disconnected') && (
        <button
          onClick={reconnect}
          className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}