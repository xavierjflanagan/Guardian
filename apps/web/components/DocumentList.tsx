"use client";

import React from 'react';
import { Document } from '@/types/guardian';
import { DocumentItem } from './DocumentItem';

interface DocumentListProps {
  documents: Document[];
  onDocumentSelect: (document: Document | null) => void;
  selectedDocument: Document | null;
}

export function DocumentList({ documents, onDocumentSelect, selectedDocument }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-gray-900 mb-1">No documents yet</h3>
        <p className="text-sm text-gray-500">Upload your first medical document to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((document) => (
        <DocumentItem
          key={document.id}
          document={document}
          isSelected={selectedDocument?.id === document.id}
          onSelect={() => onDocumentSelect(document)}
        />
      ))}
    </div>
  );
}