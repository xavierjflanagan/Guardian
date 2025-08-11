'use client'

import { ReactNode } from 'react'
import { GuardianErrorBoundary } from './GuardianErrorBoundary'

// Application-level error boundary
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <GuardianErrorBoundary 
      level="app"
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Application Error
            </h1>
            <p className="text-gray-600 mb-6">
              Guardian encountered a critical error. Please refresh the page or contact support if the problem persists.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Refresh Application
            </button>
          </div>
        </div>
      }
    >
      {children}
    </GuardianErrorBoundary>
  )
}

// Page-level error boundary
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <GuardianErrorBoundary 
      level="page"
      fallback={
        <div className="min-h-[400px] flex items-center justify-center">
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Page Error
            </h2>
            <p className="text-gray-600 mb-4">
              This page encountered an error. Try refreshing or navigate to a different section.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </GuardianErrorBoundary>
  )
}

// Component-level error boundary (lightweight)
export function ComponentErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <GuardianErrorBoundary level="component">
      {children}
    </GuardianErrorBoundary>
  )
}

// Data loading error boundary
export function DataErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <GuardianErrorBoundary 
      level="component"
      fallback={
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
            </svg>
            <h3 className="font-medium text-red-900">Data Loading Error</h3>
          </div>
          <p className="text-sm text-red-700">
            Unable to load data. Please try refreshing or check your connection.
          </p>
        </div>
      }
    >
      {children}
    </GuardianErrorBoundary>
  )
}