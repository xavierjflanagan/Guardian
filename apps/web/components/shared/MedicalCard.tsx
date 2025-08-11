"use client";

import React from 'react';
import { FileText } from 'lucide-react';

interface MedicalCardProps {
  children: React.ReactNode;
  sourceDocument?: string | null;
  className?: string;
}

export function MedicalCard({ children, sourceDocument, className = '' }: MedicalCardProps) {
  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
      {children}
      
      {sourceDocument && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center space-x-1 text-xs text-gray-500">
            <FileText className="h-3 w-3" />
            <span>Source: {sourceDocument}</span>
          </div>
        </div>
      )}
    </div>
  );
}