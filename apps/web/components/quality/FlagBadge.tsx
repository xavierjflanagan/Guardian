'use client';

import React from 'react';
import { DataQualityFlag } from '@/lib/quality/flagEngine';

interface FlagBadgeProps {
  flags: DataQualityFlag[];
  severity?: 'critical' | 'warning' | 'info';
  compact?: boolean;
  showCount?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function FlagBadge({ 
  flags, 
  severity, 
  compact = false, 
  showCount = true, 
  onClick,
  className = '' 
}: FlagBadgeProps) {
  if (!flags || flags.length === 0) {
    return null;
  }

  // Filter by severity if specified
  const filteredFlags = severity 
    ? flags.filter(flag => flag.severity === severity)
    : flags;

  if (filteredFlags.length === 0) {
    return null;
  }

  // Determine the highest severity level
  const hasCritical = filteredFlags.some(flag => flag.severity === 'critical');
  const hasWarning = filteredFlags.some(flag => flag.severity === 'warning');
  
  const displaySeverity = hasCritical ? 'critical' : hasWarning ? 'warning' : 'info';
  const count = filteredFlags.length;

  // Style variants based on severity
  const severityStyles = {
    critical: {
      bg: 'bg-red-100 hover:bg-red-200',
      border: 'border-red-300',
      text: 'text-red-800',
      icon: 'text-red-600',
      pulse: 'animate-pulse'
    },
    warning: {
      bg: 'bg-amber-100 hover:bg-amber-200',
      border: 'border-amber-300',
      text: 'text-amber-800',
      icon: 'text-amber-600',
      pulse: ''
    },
    info: {
      bg: 'bg-blue-100 hover:bg-blue-200',
      border: 'border-blue-300',
      text: 'text-blue-800',
      icon: 'text-blue-600',
      pulse: ''
    }
  };

  const styles = severityStyles[displaySeverity];

  // Icon variants based on severity
  const SeverityIcon = ({ className = '' }: { className?: string }) => {
    switch (displaySeverity) {
      case 'critical':
        return (
          <svg className={className} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'warning':
        return (
          <svg className={className} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
        return (
          <svg className={className} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`
          inline-flex items-center justify-center
          ${styles.bg} ${styles.border} ${styles.pulse}
          border rounded-full 
          ${count > 99 ? 'w-8 h-8' : count > 9 ? 'w-7 h-7' : 'w-6 h-6'}
          text-xs font-semibold ${styles.text}
          transition-colors duration-200
          hover:scale-105 transform
          ${onClick ? 'cursor-pointer' : 'cursor-default'}
          ${className}
        `}
        title={`${count} ${displaySeverity} ${count === 1 ? 'flag' : 'flags'} need attention`}
      >
        {showCount ? (
          <span className="leading-none">
            {count > 99 ? '99+' : count}
          </span>
        ) : (
          <SeverityIcon className="w-3 h-3" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 px-3 py-1.5
        ${styles.bg} ${styles.border} ${styles.pulse}
        border rounded-md
        text-sm font-medium ${styles.text}
        transition-all duration-200
        hover:scale-105 transform
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        ${className}
      `}
      title={`${count} ${displaySeverity} ${count === 1 ? 'flag' : 'flags'} need attention`}
    >
      <SeverityIcon className={`w-4 h-4 ${styles.icon}`} />
      
      <span className="capitalize">
        {count} {count === 1 ? 'Flag' : 'Flags'}
      </span>
      
      {displaySeverity === 'critical' && (
        <span className="text-xs bg-red-200 text-red-700 px-1.5 py-0.5 rounded uppercase font-bold">
          Urgent
        </span>
      )}
    </button>
  );
}

// Specialized components for different use cases

export function CriticalFlagBadge({ flags, ...props }: Omit<FlagBadgeProps, 'severity'>) {
  return <FlagBadge flags={flags} severity="critical" {...props} />;
}

export function WarningFlagBadge({ flags, ...props }: Omit<FlagBadgeProps, 'severity'>) {
  return <FlagBadge flags={flags} severity="warning" {...props} />;
}

export function InfoFlagBadge({ flags, ...props }: Omit<FlagBadgeProps, 'severity'>) {
  return <FlagBadge flags={flags} severity="info" {...props} />;
}

// Summary badge showing all severity levels
export function FlagSummaryBadge({ flags, onClick, className = '' }: {
  flags: DataQualityFlag[];
  onClick?: () => void;
  className?: string;
}) {
  if (!flags || flags.length === 0) {
    return null;
  }

  const criticalCount = flags.filter(f => f.severity === 'critical').length;
  const warningCount = flags.filter(f => f.severity === 'warning').length;
  const infoCount = flags.filter(f => f.severity === 'info').length;

  const hasCritical = criticalCount > 0;
  const hasWarning = warningCount > 0;
  const hasInfo = infoCount > 0;

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 px-3 py-2
        bg-gray-50 hover:bg-gray-100 border border-gray-200
        rounded-md text-sm transition-colors duration-200
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        ${className}
      `}
      title={`${flags.length} total flags: ${criticalCount} critical, ${warningCount} warnings, ${infoCount} info`}
    >
      <div className="flex items-center gap-1">
        {hasCritical && (
          <span className="inline-flex items-center gap-1 text-red-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">{criticalCount}</span>
          </span>
        )}
        
        {hasWarning && (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">{warningCount}</span>
          </span>
        )}
        
        {hasInfo && (
          <span className="inline-flex items-center gap-1 text-blue-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">{infoCount}</span>
          </span>
        )}
      </div>
      
      <span className="text-gray-600">
        {flags.length === 1 ? 'Issue' : 'Issues'}
      </span>
    </button>
  );
}