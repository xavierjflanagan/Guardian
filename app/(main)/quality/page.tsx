'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabaseClientSSR';
import FlagBadge, { FlagSummaryBadge } from '@/components/quality/FlagBadge';
import FlagResolutionPanel from '@/components/quality/FlagResolutionPanel';
import { DataQualityFlag } from '@/lib/quality/flagEngine';

interface QualityStats {
  total_flags: number;
  pending_flags: number;
  resolved_flags: number;
  dismissed_flags: number;
  critical_flags: number;
  warning_flags: number;
  info_flags: number;
  category_breakdown: Record<string, number>;
  resolution_rate: number;
  avg_resolution_time_hours: number;
}

interface Profile {
  profile_id: string;
  display_name: string;
  profile_type: string;
}

export default function DataQualityCenterPage() {
  const [flags, setFlags] = useState<DataQualityFlag[]>([]);
  const [stats, setStats] = useState<QualityStats | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedFlag, setSelectedFlag] = useState<DataQualityFlag | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [selectedFlags, setSelectedFlags] = useState<Set<string>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);

  const supabase = createClient();

  // Load initial data
  useEffect(() => {
    loadProfiles();
    loadStats();
    loadFlags();
  }, []);

  // Reload flags when filters change
  useEffect(() => {
    loadFlags();
  }, [selectedProfile, statusFilter, severityFilter, categoryFilter]);

  const loadProfiles = async () => {
    try {
      const { data: profilesData, error } = await supabase
        .from('user_profiles')
        .select('profile_id, display_name, profile_type')
        .order('display_name');

      if (error) throw error;
      setProfiles(profilesData || []);
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const loadStats = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedProfile !== 'all') {
        params.append('profile_id', selectedProfile);
      }
      params.append('days', '30');

      const response = await fetch(`/functions/v1/quality-guardian/stats?${params}`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (response.ok) {
        const { stats } = await response.json();
        setStats(stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadFlags = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProfile !== 'all') {
        params.append('profile_id', selectedProfile);
      }
      params.append('status', statusFilter);
      if (severityFilter !== 'all') {
        params.append('severity', severityFilter);
      }
      if (categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }
      params.append('limit', '50');

      const response = await fetch(`/functions/v1/quality-guardian/flags?${params}`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (response.ok) {
        const { flags: flagsData } = await response.json();
        setFlags(flagsData || []);
      }
    } catch (error) {
      console.error('Error loading flags:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveFlag = async (flagId: string, resolution: any) => {
    setIsResolving(true);
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
        // Refresh flags and stats
        await Promise.all([loadFlags(), loadStats()]);
        setSelectedFlag(null);
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resolve flag');
      }
    } catch (error) {
      console.error('Error resolving flag:', error);
      // Handle error (could show toast notification)
    } finally {
      setIsResolving(false);
    }
  };

  const handleBatchAction = async (action: string) => {
    if (selectedFlags.size === 0) return;

    setIsResolving(true);
    try {
      const response = await fetch('/functions/v1/quality-guardian/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          flag_ids: Array.from(selectedFlags),
          action,
          resolution_notes: `Batch ${action} operation`
        }),
      });

      if (response.ok) {
        await Promise.all([loadFlags(), loadStats()]);
        setSelectedFlags(new Set());
        setShowBatchActions(false);
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Batch operation failed');
      }
    } catch (error) {
      console.error('Error in batch operation:', error);
    } finally {
      setIsResolving(false);
    }
  };

  const toggleFlagSelection = (flagId: string) => {
    const newSelection = new Set(selectedFlags);
    if (newSelection.has(flagId)) {
      newSelection.delete(flagId);
    } else {
      newSelection.add(flagId);
    }
    setSelectedFlags(newSelection);
  };

  const selectAllFlags = () => {
    setSelectedFlags(new Set(flags.map(f => f.flag_id!)));
  };

  const clearSelection = () => {
    setSelectedFlags(new Set());
  };

  // Severity order for sorting
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const sortedFlags = [...flags].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Data Quality Center</h1>
        <p className="text-gray-600">
          Monitor and resolve data quality issues across your medical records
        </p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Flags</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_flags}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-amber-600">{stats.pending_flags}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Critical</p>
                <p className="text-2xl font-bold text-red-600">{stats.critical_flags}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Resolution Rate</p>
                <p className="text-2xl font-bold text-green-600">{Math.round(stats.resolution_rate)}%</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4">
            {/* Profile Filter */}
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Profiles</option>
              {profiles.map(profile => (
                <option key={profile.profile_id} value={profile.profile_id}>
                  {profile.display_name} ({profile.profile_type})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Categories</option>
              <option value="temporal">Temporal</option>
              <option value="demographic">Demographic</option>
              <option value="clinical">Clinical</option>
              <option value="profile_mismatch">Profile Mismatch</option>
              <option value="extraction_quality">Extraction Quality</option>
            </select>
          </div>

          {/* Batch Actions */}
          {statusFilter === 'pending' && (
            <div className="flex gap-2">
              {selectedFlags.size > 0 && (
                <div className="flex gap-2">
                  <span className="text-sm text-gray-600 py-2">
                    {selectedFlags.size} selected
                  </span>
                  <button
                    onClick={() => handleBatchAction('confirm')}
                    disabled={isResolving}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-gray-300"
                  >
                    Confirm All
                  </button>
                  <button
                    onClick={() => handleBatchAction('ignore')}
                    disabled={isResolving}
                    className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 disabled:bg-gray-300"
                  >
                    Ignore All
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
                  >
                    Clear
                  </button>
                </div>
              )}
              
              <button
                onClick={selectedFlags.size === flags.length ? clearSelection : selectAllFlags}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              >
                {selectedFlags.size === flags.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Flags List */}
      <div className="bg-white rounded-lg shadow-sm border">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading flags...</span>
          </div>
        ) : sortedFlags.length === 0 ? (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No flags found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {statusFilter === 'pending' 
                ? 'All quality issues have been resolved!' 
                : `No ${statusFilter} flags match your current filters.`
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {sortedFlags.map((flag) => (
              <div
                key={flag.flag_id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Selection Checkbox */}
                  {statusFilter === 'pending' && (
                    <input
                      type="checkbox"
                      checked={selectedFlags.has(flag.flag_id!)}
                      onChange={() => toggleFlagSelection(flag.flag_id!)}
                      className="mt-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  )}

                  {/* Flag Badge */}
                  <div className="flex-shrink-0 mt-1">
                    <FlagBadge flags={[flag]} compact />
                  </div>

                  {/* Flag Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          {flag.problem_code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {flag.explanation}
                        </p>
                        
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span className="capitalize">{flag.category.replace('_', ' ')}</span>
                          <span>Confidence: {Math.round(flag.confidence_score * 100)}%</span>
                          {flag.field_name && <span>Field: {flag.field_name}</span>}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      {statusFilter === 'pending' && (
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => setSelectedFlag(flag)}
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                          >
                            Resolve
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Raw Value Display */}
                    {flag.raw_value && (
                      <div className="mt-3 p-2 bg-gray-100 rounded text-xs">
                        <span className="font-medium text-gray-700">Detected: </span>
                        <code className="text-gray-800">
                          {typeof flag.raw_value === 'string' ? flag.raw_value : JSON.stringify(flag.raw_value)}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
              isLoading={isResolving}
            />
          </div>
        </div>
      )}
    </div>
  );
}