"use client";

import React from 'react';
import { Document } from '@/types/guardian';
import { PatientHeader } from './PatientHeader';
import { MetricsSummary } from './MetricsSummary';
import { DynamicSection } from './DynamicSection';
import { FileText, AlertTriangle } from 'lucide-react';

interface ExtractedInfoPanelProps {
  selectedDocument: Document | null;
}

export function ExtractedInfoPanel({ selectedDocument }: ExtractedInfoPanelProps) {
  if (!selectedDocument) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Document Selected</h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Select a completed document from the left panel to view its extracted medical information.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (selectedDocument.status !== 'completed' || !selectedDocument.medical_data) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Medical Data Available</h3>
            <p className="text-sm text-gray-500 max-w-sm">
              This document hasn't been processed yet or no medical information was extracted.
            </p>
            {selectedDocument.status === 'processing' && (
              <p className="text-sm text-blue-600 mt-2">Processing in progress...</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { medical_data } = selectedDocument;

  return (
    <div className="space-y-6">
      {/* Document Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Medical Information</h2>
          <div className="text-sm text-gray-500">
            Extracted from: <span className="font-medium">{selectedDocument.original_name}</span>
          </div>
        </div>
        
        {/* Patient Header */}
        {medical_data.patientInfo && (
          <PatientHeader patientInfo={medical_data.patientInfo} />
        )}
      </div>

      {/* Key Metrics Summary */}
      {medical_data.medicalData && (
        <MetricsSummary 
          medicalData={medical_data.medicalData}
          confidence={selectedDocument.overall_confidence}
        />
      )}

      {/* Dynamic Medical Sections */}
      {medical_data.medicalData && (
        <div className="space-y-6">
          {/* Medications */}
          {medical_data.medicalData.medications && (
            <DynamicSection
              title="Medications"
              icon="pill"
              data={medical_data.medicalData.medications}
              type="medications"
              sourceDocument={selectedDocument.original_name}
            />
          )}

          {/* Allergies */}
          {medical_data.medicalData.allergies && (
            <DynamicSection
              title="Allergies & Reactions"
              icon="alert"
              data={medical_data.medicalData.allergies}
              type="allergies"
              sourceDocument={selectedDocument.original_name}
            />
          )}

          {/* Lab Results */}
          {medical_data.medicalData.labResults && (
            <DynamicSection
              title="Laboratory Results"
              icon="beaker"
              data={medical_data.medicalData.labResults}
              type="labResults"
              sourceDocument={selectedDocument.original_name}
            />
          )}

          {/* Conditions */}
          {medical_data.medicalData.conditions && (
            <DynamicSection
              title="Medical Conditions"
              icon="heart"
              data={medical_data.medicalData.conditions}
              type="conditions"
              sourceDocument={selectedDocument.original_name}
            />
          )}

          {/* Vitals */}
          {medical_data.medicalData.vitals && (
            <DynamicSection
              title="Vital Signs"
              icon="activity"
              data={medical_data.medicalData.vitals}
              type="vitals"
              sourceDocument={selectedDocument.original_name}
            />
          )}

          {/* Procedures */}
          {medical_data.medicalData.procedures && (
            <DynamicSection
              title="Procedures"
              icon="clipboard"
              data={medical_data.medicalData.procedures}
              type="procedures"
              sourceDocument={selectedDocument.original_name}
            />
          )}
        </div>
      )}

      {/* Provider Information */}
      {medical_data.provider && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Healthcare Provider</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {medical_data.provider.name && (
              <div>
                <label className="text-sm font-medium text-gray-500">Provider Name</label>
                <p className="text-sm text-gray-900">{medical_data.provider.name}</p>
              </div>
            )}
            {medical_data.provider.facility && (
              <div>
                <label className="text-sm font-medium text-gray-500">Facility</label>
                <p className="text-sm text-gray-900">{medical_data.provider.facility}</p>
              </div>
            )}
            {medical_data.provider.phone && (
              <div>
                <label className="text-sm font-medium text-gray-500">Phone</label>
                <p className="text-sm text-gray-900">{medical_data.provider.phone}</p>
              </div>
            )}
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Source: {selectedDocument.original_name}
          </div>
        </div>
      )}

      {/* Processing Notes */}
      {medical_data.notes && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Processing Notes</h4>
          <p className="text-sm text-blue-800">{medical_data.notes}</p>
        </div>
      )}
    </div>
  );
}