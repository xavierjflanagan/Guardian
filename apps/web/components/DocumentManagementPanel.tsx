"use client";

import React from 'react';
import { Document } from '@/types/guardian';
import { FileUpload } from './FileUpload';
import { DocumentList } from './DocumentList';

interface DocumentManagementPanelProps {
  documents: Document[];
  onDocumentUpload: (file: File) => void;
  onDocumentSelect: (document: Document | null) => void;
  selectedDocument: Document | null;
  isUploading: boolean;
  uploadError: string | null;
  uploadMessage: string | null;
}

export function DocumentManagementPanel({
  documents,
  onDocumentUpload,
  onDocumentSelect,
  selectedDocument,
  isUploading,
  uploadError,
  uploadMessage
}: DocumentManagementPanelProps) {
  return (
    <div className="space-y-6">
      {/* File Upload Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Upload Medical Document</h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload PDF, PNG, JPG, or TIFF files for AI processing
          </p>
        </div>
        <div className="p-6">
          <FileUpload
            onFileUpload={onDocumentUpload}
            isUploading={isUploading}
            error={uploadError}
            message={uploadMessage}
          />
        </div>
      </div>

      {/* Documents List Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Your Documents</h2>
          <p className="text-sm text-gray-500 mt-1">
            {documents.length === 0 
              ? 'No documents uploaded yet'
              : `${documents.length} document${documents.length !== 1 ? 's' : ''} uploaded`
            }
          </p>
        </div>
        <div className="p-6">
          <DocumentList
            documents={documents}
            onDocumentSelect={onDocumentSelect}
            selectedDocument={selectedDocument}
          />
        </div>
      </div>
    </div>
  );
}