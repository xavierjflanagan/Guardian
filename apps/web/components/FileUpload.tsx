"use client";

import React, { useCallback, useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface FileUploadProps {
  onFileUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  error: string | null;
  message: string | null;
}

export function FileUpload({ onFileUpload, isUploading, error, message }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    console.log('[FileUpload] File dropped');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      console.log('[FileUpload] Processing dropped file:', e.dataTransfer.files[0].name);
      onFileUpload(e.dataTransfer.files[0]).catch(err => {
        console.error('[FileUpload] onFileUpload error (drop):', err);
      });
    }
  }, [onFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[FileUpload] handleFileSelect called', { hasFiles: !!e.target.files, fileCount: e.target.files?.length });
    alert('handleFileSelect called!'); // DEBUG
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      console.log('[FileUpload] File selected, calling onFileUpload:', file.name);
      alert(`File selected: ${file.name}, about to call onFileUpload`); // DEBUG
      onFileUpload(file).catch(err => {
        console.error('[FileUpload] onFileUpload error:', err);
        alert(`Upload error: ${err}`); // DEBUG
      });
      // Reset input so same file can be selected again
      e.target.value = '';
    }
  }, [onFileUpload]);

  const handleClick = useCallback(() => {
    console.log('[FileUpload] Click area clicked, isUploading:', isUploading);
    alert(`FileUpload clicked! isUploading: ${isUploading}`); // DEBUG: Visual confirmation
    if (!isUploading && fileInputRef.current) {
      console.log('[FileUpload] Triggering file input click');
      alert('About to open file picker'); // DEBUG
      fileInputRef.current.click();
    } else {
      alert(`Cannot upload: isUploading=${isUploading}, hasRef=${!!fileInputRef.current}`); // DEBUG
    }
  }, [isUploading]);

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        onChange={handleFileSelect}
        disabled={isUploading}
        className="hidden"
        aria-label="Upload medical document"
        id="file-upload-input"
      />

      {/* Drag and Drop Area */}
      <div
        onClick={handleClick}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragActive
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        
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