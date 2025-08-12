"use client";

import React, { useState, useEffect } from 'react';
import { Document } from '@/types/guardian';
import { FileText, Clock, CheckCircle, XCircle, Loader2, Eye, AlertTriangle } from 'lucide-react';
import { ConfidenceIndicator } from '@guardian/ui';
import { FlagSummaryBadge } from './quality/FlagBadge';
import FlagResolutionPanel from './quality/FlagResolutionPanel';
import { DataQualityFlag } from '@/lib/quality/flagEngine';
import { createClient } from '@/lib/supabaseClientSSR';

interface DocumentItemProps {
  document: Document;
  isSelected: boolean;
  onSelect: () => void;
  onFlagsUpdated?: () => void; // Callback when flags are resolved
}

export function DocumentItem({ document, isSelected, onSelect, onFlagsUpdated }: DocumentItemProps) {
  const [flags, setFlags] = useState<DataQualityFlag[]>([]);
  const [selectedFlag, setSelectedFlag] = useState<DataQualityFlag | null>(null);
  // Remove unused flags loading state - handled internally by loadDocumentFlags
  const supabase = createClient();

  // Load quality flags for this document
  useEffect(() => {
    if (document.quality_flags_count && document.quality_flags_count > 0) {
      loadDocumentFlags();
    }
  }, [document.id, document.quality_flags_count]);

  const loadDocumentFlags = async () => {
    // Loading state removed - flags loaded asynchronously
    try {
      const { data: flagsData, error } = await supabase
        .from('data_quality_flags')
        .select('*')
        .eq('document_id', document.id)
        .eq('status', 'pending')
        .order('severity', { ascending: true }); // Critical first

      if (error) throw error;
      setFlags(flagsData || []);
    } catch (error) {
      console.error('Error loading document flags:', error);
    } finally {
      // Loading state removed - flags loaded asynchronously
    }
  };

  const handleResolveFlag = async (flagId: string, resolution: any) => {
    try {
      const response = await fetch(`/functions/v1/quality-guardian/flags/${flagId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify(resolution),
      });

      if (response.ok) {
        // Refresh flags
        await loadDocumentFlags();
        setSelectedFlag(null);
        
        // Notify parent component
        if (onFlagsUpdated) {
          onFlagsUpdated();
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resolve flag');
      }
    } catch (error) {
      console.error('Error resolving flag:', error);
      // Could show toast notification here
    }
  };
  const getStatusIcon = () => {
    switch (document.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'flagged_critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'flagged_review':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (document.status) {
      case 'completed':
        return 'Completed';
      case 'flagged_critical':
        return 'Critical Issues';
      case 'flagged_review':
        return 'Needs Review';
      case 'processing':
        return 'Processing...';
      case 'failed':
        return 'Failed';
      case 'uploaded':
        return 'Uploaded';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    switch (document.status) {
      case 'completed':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'flagged_critical':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'flagged_review':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'processing':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'failed':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const canView = document.status === 'completed' && document.medical_data;

  return (
    <>
      <div
        className={`border rounded-lg p-4 transition-all cursor-pointer hover:shadow-md ${
          isSelected
            ? 'border-blue-500 bg-blue-50 shadow-md'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
        onClick={canView ? onSelect : undefined}
        role={canView ? "button" : undefined}
        tabIndex={canView ? 0 : undefined}
        onKeyDown={canView ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        } : undefined}
        aria-label={canView ? `View extracted data for ${document.original_name}` : undefined}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-1">
              <FileText className="h-5 w-5 text-gray-400" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {document.original_name || 'Untitled Document'}
                </h3>
                {canView && (
                  <Eye className="h-4 w-4 text-blue-500 flex-shrink-0" />
                )}
              </div>
              
              <div className="flex items-center space-x-4 text-xs text-gray-500 mb-2">
                <span>
                  Uploaded: {new Date(document.created_at).toLocaleDateString()} at{' '}
                  {new Date(document.created_at).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
                {document.processed_at && (
                  <span>
                    Processed: {new Date(document.processed_at).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                )}
              </div>

              {/* Quality Flags */}
              {flags.length > 0 && (
                <div className="mb-2 flex items-center gap-2">
                  <FlagSummaryBadge 
                    flags={flags}
                    onClick={() => setSelectedFlag(flags[0])} // Show first (most severe) flag
                  />
                  {flags.filter(f => f.severity === 'critical').length > 0 && (
                    <span className="text-xs text-red-600 font-medium">
                      Requires attention
                    </span>
                  )}
                </div>
              )}

              {/* Confidence Score */}
              {document.overall_confidence && (
                <div className="mb-2">
                  <ConfidenceIndicator 
                    score={document.overall_confidence} 
                    label="Overall Confidence"
                  />
                </div>
              )}

              {/* Error Message */}
              {document.status === 'failed' && document.error_log && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                  <p className="text-red-700 font-medium">Processing Error:</p>
                  <p className="text-red-600 mt-1">{document.error_log}</p>
                </div>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0 ml-4">
            <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor()}`}>
              {getStatusIcon()}
              <span>{getStatusText()}</span>
            </div>
          </div>
        </div>

        {/* View Button for Completed Documents */}
        {canView && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              <Eye className="h-4 w-4" />
              <span>View Extracted Data</span>
            </button>
          </div>
        )}

        {/* Quality Flag Actions */}
        {flags.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">
                {flags.length} quality {flags.length === 1 ? 'issue' : 'issues'} detected
              </span>
              <button
                className="text-sm text-amber-600 hover:text-amber-800 font-medium flex items-center space-x-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFlag(flags[0]);
                }}
              >
                <AlertTriangle className="h-4 w-4" />
                <span>Review Issues</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Flag Resolution Modal */}
      {selectedFlag && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto">
            <FlagResolutionPanel
              flag={selectedFlag}
              onResolve={handleResolveFlag}
              onClose={() => setSelectedFlag(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}