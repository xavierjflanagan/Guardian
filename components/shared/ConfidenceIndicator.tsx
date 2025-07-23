"use client";

import React from 'react';

interface ConfidenceIndicatorProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceIndicator({ score, label, size = 'sm' }: ConfidenceIndicatorProps) {
  const getConfidenceColor = (score: number) => {
    if (score >= 95) return 'bg-green-500';
    if (score >= 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getConfidenceTextColor = (score: number) => {
    if (score >= 95) return 'text-green-700';
    if (score >= 80) return 'text-yellow-700';
    return 'text-red-700';
  };

  const getConfidenceBgColor = (score: number) => {
    if (score >= 95) return 'bg-green-50';
    if (score >= 80) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  const sizeClasses = {
    sm: 'h-2 text-xs',
    md: 'h-3 text-sm',
    lg: 'h-4 text-base'
  };

  return (
    <div className={`inline-flex items-center space-x-2 px-2 py-1 rounded-full ${getConfidenceBgColor(score)}`}>
      <div className={`w-16 ${sizeClasses[size].split(' ')[0]} bg-gray-200 rounded-full overflow-hidden`}>
        <div
          className={`h-full ${getConfidenceColor(score)} transition-all duration-300`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`${sizeClasses[size].split(' ')[1]} font-medium ${getConfidenceTextColor(score)}`}>
        {score.toFixed(1)}%
      </span>
      {label && (
        <span className={`${sizeClasses[size].split(' ')[1]} text-gray-600`}>
          {label}
        </span>
      )}
    </div>
  );
}