"use client";

import React from 'react';
import { Pill, AlertTriangle, Activity, Beaker } from 'lucide-react';
import { ConfidenceIndicator } from '@guardian/ui';

interface MetricsSummaryProps {
  medicalData: any;
  confidence?: number | null;
}

export function MetricsSummary({ medicalData, confidence }: MetricsSummaryProps) {
  const getMetrics = () => {
    const metrics = [];

    if (medicalData.medications) {
      metrics.push({
        label: 'Medications',
        value: Array.isArray(medicalData.medications) ? medicalData.medications.length : 1,
        icon: Pill,
        color: 'text-blue-600 bg-blue-100'
      });
    }

    if (medicalData.allergies) {
      metrics.push({
        label: 'Allergies',
        value: Array.isArray(medicalData.allergies) ? medicalData.allergies.length : 1,
        icon: AlertTriangle,
        color: 'text-red-600 bg-red-100'
      });
    }

    if (medicalData.labResults) {
      metrics.push({
        label: 'Lab Results',
        value: Array.isArray(medicalData.labResults) ? medicalData.labResults.length : 1,
        icon: Beaker,
        color: 'text-green-600 bg-green-100'
      });
    }

    if (medicalData.conditions) {
      metrics.push({
        label: 'Conditions',
        value: Array.isArray(medicalData.conditions) ? medicalData.conditions.length : 1,
        icon: Activity,
        color: 'text-purple-600 bg-purple-100'
      });
    }

    if (medicalData.vitals) {
      const vitalCount = Object.keys(medicalData.vitals).length;
      if (vitalCount > 0) {
        metrics.push({
          label: 'Vital Signs',
          value: vitalCount,
          icon: Activity,
          color: 'text-orange-600 bg-orange-100'
        });
      }
    }

    return metrics;
  };

  const metrics = getMetrics();

  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Summary</h3>
        {confidence && (
          <ConfidenceIndicator score={confidence} label="Document Confidence" />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div key={index} className="text-center">
              <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${metric.color} mb-2`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{metric.value}</div>
              <div className="text-sm text-gray-500">{metric.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}