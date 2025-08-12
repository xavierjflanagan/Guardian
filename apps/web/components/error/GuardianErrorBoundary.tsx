'use client'

import { Component, ReactNode } from 'react'
import { createClient } from '@/lib/supabaseClientSSR'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: { componentStack: string }) => void
  level?: 'app' | 'page' | 'component'
}

interface State {
  hasError: boolean
  error?: Error
  errorId?: string
}

export class GuardianErrorBoundary extends Component<Props, State> {
  private retryCount = 0
  private maxRetries = 3

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorId: crypto.randomUUID()
    }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    const { onError, level = 'component' } = this.props
    
    // Log error to event system
    this.logError(error, errorInfo, level)
    
    // Call custom error handler
    onError?.(error, errorInfo)
    
    // Report to monitoring service (future implementation)
    this.reportError(error, errorInfo, level)
  }

  // Hash user agent for HIPAA compliance
  private hashUserAgent(userAgent: string): string {
    // Simple hash for audit trail without PII exposure
    return btoa(userAgent).substring(0, 16);
  }

  private async logError(error: Error, errorInfo: { componentStack: string }, level: string) {
    try {
      const supabase = createClient()
      await supabase.from('user_events').insert({
        action: `system.error_boundary_${level}`,
        metadata: {
          error_message: error.message,
          error_stack: error.stack?.substring(0, 1000), // Truncate for database limits
          component_stack: errorInfo.componentStack?.substring(0, 1000),
          error_id: this.state.errorId,
          retry_count: this.retryCount,
          user_agent_hash: this.hashUserAgent(navigator.userAgent)
        },
        session_id: crypto.randomUUID(),
        privacy_level: 'internal'
      })
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError)
    }
  }

  private reportError(error: Error, errorInfo: any, level: string) {
    // Future: Send to external monitoring service
    console.error(`[${level.toUpperCase()}] Error Boundary Triggered:`, {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      retryCount: this.retryCount
    })
  }

  private handleRetry = () => {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++
      this.setState({ hasError: false, error: undefined, errorId: undefined })
    }
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorId={this.state.errorId}
          retryCount={this.retryCount}
          maxRetries={this.maxRetries}
          level={this.props.level}
          onRetry={this.handleRetry}
          onReload={this.handleReload}
        />
      )
    }

    return this.props.children
  }
}

interface ErrorFallbackProps {
  error?: Error
  errorId?: string
  retryCount: number
  maxRetries: number
  level?: string
  onRetry: () => void
  onReload: () => void
}

function ErrorFallback({ 
  error, 
  errorId, 
  retryCount, 
  maxRetries, 
  level = 'component',
  onRetry, 
  onReload 
}: ErrorFallbackProps) {
  const canRetry = retryCount < maxRetries

  return (
    <div className="min-h-[200px] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-red-900">
              Something went wrong
            </h3>
            <p className="text-sm text-red-700">
              {level === 'app' ? 'Application error' : 
               level === 'page' ? 'Page error' : 
               'Component error'}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm text-red-800 mb-2">
            We apologize for the inconvenience. This error has been logged and our team has been notified.
          </p>
          
          {process.env.NODE_ENV === 'development' && error && (
            <details className="mt-3">
              <summary className="text-sm text-red-700 cursor-pointer hover:text-red-900">
                Technical Details
              </summary>
              <pre className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded overflow-auto max-h-32">
                {error.message}
                {error.stack && `\n\nStack:\n${error.stack}`}
              </pre>
            </details>
          )}
        </div>

        <div className="flex gap-2">
          {canRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
            >
              Try Again ({maxRetries - retryCount} left)
            </button>
          )}
          
          <button
            onClick={onReload}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
          >
            Reload Page
          </button>
        </div>

        {errorId && (
          <p className="mt-4 text-xs text-gray-500">
            Error ID: {errorId}
          </p>
        )}
      </div>
    </div>
  )
}