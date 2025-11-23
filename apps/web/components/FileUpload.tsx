"use client";

import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface FileUploadProps {
  onFileUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  error: string | null;
  message: string | null;
}

export function FileUpload({ onFileUpload, isUploading, error, message }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0]);
    }
  }, [onFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[FileUpload] handleFileSelect called', { hasFiles: !!e.target.files, fileCount: e.target.files?.length });
    if (e.target.files && e.target.files[0]) {
      console.log('[FileUpload] File selected, calling onFileUpload:', e.target.files[0].name);
      onFileUpload(e.target.files[0]).catch(err => {
        console.error('[FileUpload] onFileUpload error:', err);
      });
    }
  }, [onFileUpload]);

  return (
    <div className="space-y-4">
      {/* Drag and Drop Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={handleFileSelect}
          disabled={isUploading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Upload medical document"
          id="file-upload-input"
        />
        {/* DEBUG: Show input state */}
        <div className="absolute top-2 right-2 text-xs bg-yellow-100 px-2 py-1 rounded z-50">
          Input disabled: {isUploading ? 'YES' : 'NO'}
        </div>
        
        <div className="space-y-4">
          <div className="flex justify-center">
            {isUploading ? (
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            ) : (
              <Upload className="h-12 w-12 text-gray-400" />
            )}
          </div>
          
          <div>
            <p className="text-lg font-medium text-gray-900">
              {isUploading ? 'Uploading...' : 'Drop your medical document here'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or click to browse files
            </p>
          </div>
          
          <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
            <FileText className="h-4 w-4" />
            <span>PDF, PNG, JPG, TIFF up to 20MB</span>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {message && !error && (
        <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-md">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700">{message}</p>
        </div>
      )}
    </div>
  );
}