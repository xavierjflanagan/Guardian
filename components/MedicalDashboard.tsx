"use client";

import React, { useState, useEffect } from 'react';
import { Document } from '@/types/guardian';
import { DocumentManagementPanel } from './DocumentManagementPanel';
import { ExtractedInfoPanel } from './ExtractedInfoPanel';

interface MedicalDashboardProps {
  documents: Document[];
  onDocumentUpload: (file: File) => Promise<void>;
  onRefreshDocuments: () => void;
  isUploading: boolean;
  uploadError: string | null;
  uploadMessage: string | null;
}

export function MedicalDashboard({
  documents,
  onDocumentUpload,
  onRefreshDocuments,
  isUploading,
  uploadError,
  uploadMessage
}: MedicalDashboardProps) {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Auto-refresh documents every 5 seconds to catch processing updates
  useEffect(() => {
    const interval = setInterval(() => {
      onRefreshDocuments();
    }, 5000);

    return () => clearInterval(interval);
  }, [onRefreshDocuments]);

  // Auto-select first completed document if none selected
  useEffect(() => {
    if (!selectedDocument && documents.length > 0) {
      const firstCompleted = documents.find(doc => doc.status === 'completed' && doc.medical_data);
      if (firstCompleted) {
        setSelectedDocument(firstCompleted);
      }
    }
  }, [documents, selectedDocument]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-900">Guardian</h1>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Medical Document Processing</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                {documents.length} document{documents.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
          {/* Left Column - Document Management */}
          <div className="space-y-6">
            <DocumentManagementPanel
              documents={documents}
              onDocumentUpload={onDocumentUpload}
              onDocumentSelect={setSelectedDocument}
              selectedDocument={selectedDocument}
              isUploading={isUploading}
              uploadError={uploadError}
              uploadMessage={uploadMessage}
            />
          </div>

          {/* Right Column - Extracted Information */}
          <div className="space-y-6">
            <ExtractedInfoPanel
              selectedDocument={selectedDocument}
            />
          </div>
        </div>
      </div>
    </div>
  );
}