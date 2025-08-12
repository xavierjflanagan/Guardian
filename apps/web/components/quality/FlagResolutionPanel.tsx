'use client';

import React, { useState, useEffect } from 'react';
import { DataQualityFlag } from '@/lib/quality/flagEngine';

interface FlagResolutionPanelProps {
  flag: DataQualityFlag;
  onResolve: (flagId: string, resolution: FlagResolution) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
  className?: string;
}

interface FlagResolution {
  action: 'confirm' | 'edit' | 'delete' | 'merge' | 'ignore';
  corrected_value?: any;
  resolution_notes?: string;
  user_feedback_rating?: number;
  user_confidence?: 'very_sure' | 'somewhat_sure' | 'unsure';
  correction_difficulty?: 'easy' | 'moderate' | 'difficult';
}

export default function FlagResolutionPanel({
  flag,
  onResolve,
  onClose,
  className = ''
}: FlagResolutionPanelProps) {
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [correctedValue, setCorrectedValue] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [userRating, setUserRating] = useState<number>(3);
  const [userConfidence, setUserConfidence] = useState<'very_sure' | 'somewhat_sure' | 'unsure'>('somewhat_sure');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize corrected value with suggested correction or raw value
  useEffect(() => {
    if (flag.suggested_correction) {
      setCorrectedValue(JSON.stringify(flag.suggested_correction));
    } else if (flag.raw_value) {
      setCorrectedValue(typeof flag.raw_value === 'string' ? flag.raw_value : JSON.stringify(flag.raw_value));
    }
  }, [flag]);

  const handleSubmit = async () => {
    if (!selectedAction) return;

    setIsSubmitting(true);

    try {
      const resolution: FlagResolution = {
        action: selectedAction as FlagResolution['action'],
        resolution_notes: resolutionNotes,
        user_feedback_rating: userRating,
        user_confidence: userConfidence,
        correction_difficulty: 'moderate' // Could be made dynamic
      };

      if (selectedAction === 'edit' && correctedValue) {
        try {
          resolution.corrected_value = JSON.parse(correctedValue);
        } catch {
          resolution.corrected_value = correctedValue;
        }
      }

      await onResolve(flag.flag_id!, resolution);
      onClose();
    } catch (error) {
      console.error('Failed to resolve flag:', error);
      // Error handling would be handled by parent component
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirmation = () => {
    if (showDeleteConfirmation) {
      setSelectedAction('delete');
      handleSubmit();
    } else {
      setShowDeleteConfirmation(true);
    }
  };

  // Style variants based on severity
  const severityStyles = {
    critical: {
      border: 'border-red-200',
      header: 'bg-red-50 border-red-200',
      headerText: 'text-red-800',
      icon: 'text-red-600'
    },
    warning: {
      border: 'border-amber-200',
      header: 'bg-amber-50 border-amber-200',
      headerText: 'text-amber-800',
      icon: 'text-amber-600'
    },
    info: {
      border: 'border-blue-200',
      header: 'bg-blue-50 border-blue-200',
      headerText: 'text-blue-800',
      icon: 'text-blue-600'
    }
  };

  const styles = severityStyles[flag.severity];

  const SeverityIcon = () => {
    switch (flag.severity) {
      case 'critical':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459 2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <div className={`bg-white border ${styles.border} rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${styles.header} ${styles.headerText} rounded-t-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={styles.icon}>
              <SeverityIcon />
            </div>
            <h3 className="font-semibold capitalize">
              {flag.severity} Issue Detected
            </h3>
            <span className="text-xs bg-white bg-opacity-50 px-2 py-1 rounded capitalize">
              {flag.category.replace('_', ' ')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isSubmitting}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Explanation */}
        <div className="bg-gray-50 p-3 rounded-md">
          <p className="text-sm text-gray-700 leading-relaxed">
            {flag.explanation}
          </p>
          
          {flag.raw_value && (
            <div className="mt-2 p-2 bg-white border rounded text-xs">
              <div className="font-medium text-gray-600 mb-1">Detected Value:</div>
              <code className="text-gray-800">
                {typeof flag.raw_value === 'string' ? flag.raw_value : JSON.stringify(flag.raw_value)}
              </code>
            </div>
          )}

          {flag.suggested_correction && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
              <div className="font-medium text-green-700 mb-1">AI Suggestion:</div>
              <code className="text-green-800">
                {typeof flag.suggested_correction === 'string' ? flag.suggested_correction : JSON.stringify(flag.suggested_correction)}
              </code>
            </div>
          )}
        </div>

        {/* Resolution Options */}
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">How would you like to resolve this?</h4>
          
          <div className="space-y-2">
            {flag.resolution_options.map((option, index) => (
              <label
                key={index}
                className={`
                  flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors
                  ${selectedAction === option.action 
                    ? 'border-blue-300 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <input
                  type="radio"
                  name="resolution"
                  value={option.action}
                  checked={selectedAction === option.action}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                  disabled={isSubmitting}
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{option.label}</div>
                  <div className="text-sm text-gray-600">{option.description}</div>
                  {option.suggested_value && (
                    <div className="mt-1 text-xs text-blue-600">
                      Suggested: <code>{JSON.stringify(option.suggested_value)}</code>
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Edit Value Input */}
        {selectedAction === 'edit' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Corrected Value
            </label>
            <textarea
              value={correctedValue}
              onChange={(e) => setCorrectedValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Enter the correct value..."
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Delete Confirmation */}
        {selectedAction === 'delete' && showDeleteConfirmation && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-md">
            <div className="flex items-center gap-2 text-red-700 mb-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Confirm Deletion</span>
            </div>
            <p className="text-sm text-red-700">
              This will hide the data from all views, but it can be recovered later from the audit log.
            </p>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Notes (Optional)
          </label>
          <textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            rows={2}
            placeholder="Add any additional context or notes..."
            disabled={isSubmitting}
          />
        </div>

        {/* Feedback Section */}
        <div className="border-t pt-4 space-y-3">
          <h5 className="text-sm font-medium text-gray-700">Help improve our detection (Optional)</h5>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                How helpful was this flag?
              </label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => setUserRating(rating)}
                    className={`
                      w-6 h-6 rounded transition-colors
                      ${rating <= userRating 
                        ? 'text-yellow-400 hover:text-yellow-500' 
                        : 'text-gray-300 hover:text-gray-400'
                      }
                    `}
                    disabled={isSubmitting}
                  >
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Your confidence in this decision
              </label>
              <select
                value={userConfidence}
                onChange={(e) => setUserConfidence(e.target.value as typeof userConfidence)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-blue-500 focus:border-blue-500"
                disabled={isSubmitting}
              >
                <option value="very_sure">Very sure</option>
                <option value="somewhat_sure">Somewhat sure</option>
                <option value="unsure">Unsure</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t rounded-b-lg flex justify-between items-center">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
          Confidence: {Math.round(flag.confidence_score * 100)}%
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          
          {selectedAction === 'delete' && !showDeleteConfirmation ? (
            <button
              onClick={() => setShowDeleteConfirmation(true)}
              className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
              disabled={isSubmitting}
            >
              Delete
            </button>
          ) : (
            <button
              onClick={selectedAction === 'delete' ? handleDeleteConfirmation : handleSubmit}
              disabled={!selectedAction || isSubmitting || (selectedAction === 'edit' && !correctedValue.trim())}
              className={`
                px-4 py-1.5 text-sm rounded-md transition-colors font-medium
                ${selectedAction === 'delete' 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }
                disabled:bg-gray-300 disabled:cursor-not-allowed
              `}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </div>
              ) : selectedAction === 'delete' && showDeleteConfirmation ? (
                'Confirm Delete'
              ) : (
                'Resolve Issue'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}