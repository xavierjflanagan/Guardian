'use client';

import React from 'react';
import { FileText, Calendar, User, AlertTriangle } from 'lucide-react';

// Medical card types and interfaces
export interface MedicalCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'minimal' | 'highlighted';
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'resolved';
  className?: string;
  
  // Metadata
  title?: string;
  subtitle?: string;
  sourceDocument?: string | null;
  date?: Date | string | null;
  provider?: string | null;
  
  // Interactive
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  
  // Status
  isLoading?: boolean;
  hasWarning?: boolean;
  confidenceScore?: number;
}

// Card variant styles using Guardian design system
const getVariantClasses = (variant: MedicalCardProps['variant'] = 'default'): string => {
  const variants = {
    'default': 'medical-card',
    'elevated': 'medical-card shadow-floating border-0',
    'minimal': 'bg-transparent border-0 shadow-none p-0',
    'highlighted': 'medical-card ring-2 ring-primary-200 border-primary-200'
  };
  
  return variants[variant];
};

// Severity indicator colors
const getSeverityClasses = (severity?: MedicalCardProps['severity']): string => {
  if (!severity) return '';
  
  const severityClasses = {
    'critical': 'border-l-4 border-l-severity-critical',
    'high': 'border-l-4 border-l-severity-high',
    'medium': 'border-l-4 border-l-severity-medium',
    'low': 'border-l-4 border-l-severity-low',
    'resolved': 'border-l-4 border-l-severity-resolved'
  };
  
  return severityClasses[severity];
};

// Format date for display
const formatDate = (date: Date | string | null): string => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return '';
  
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Confidence score indicator
const ConfidenceIndicator: React.FC<{ score: number }> = ({ score }) => {
  const getConfidenceColor = (score: number): string => {
    if (score >= 90) return 'text-success-600 bg-success-100';
    if (score >= 70) return 'text-warning-600 bg-warning-100';
    return 'text-error-600 bg-error-100';
  };
  
  const getConfidenceLabel = (score: number): string => {
    if (score >= 90) return 'High';
    if (score >= 70) return 'Medium';
    return 'Low';
  };
  
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(score)}`}>
      Confidence: {getConfidenceLabel(score)} ({score}%)
    </span>
  );
};

export function MedicalCard({
  children,
  variant = 'default',
  severity,
  className = '',
  title,
  subtitle,
  sourceDocument,
  date,
  provider,
  onClick,
  onEdit,
  onDelete,
  isLoading = false,
  hasWarning = false,
  confidenceScore
}: MedicalCardProps) {
  const variantClasses = getVariantClasses(variant);
  const severityClasses = getSeverityClasses(severity);
  const isInteractive = onClick || onEdit || onDelete;
  
  const cardClasses = `
    ${variantClasses}
    ${severityClasses}
    ${isInteractive ? 'cursor-pointer hover:shadow-md transition-shadow duration-200' : ''}
    ${className}
  `.trim();
  
  const handleClick = () => {
    if (onClick) onClick();
  };
  
  if (isLoading) {
    return (
      <div className={cardClasses}>
        <div className="animate-pulse space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 bg-neutral-200 rounded w-1/3"></div>
            <div className="h-3 bg-neutral-200 rounded w-1/4"></div>
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-neutral-200 rounded w-full"></div>
            <div className="h-3 bg-neutral-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={cardClasses} onClick={handleClick}>
      {/* Header */}
      {(title || subtitle || hasWarning || confidenceScore) && (
        <div className="medical-card-header">
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className="medical-card-title flex items-center space-x-2">
                <span>{title}</span>
                {hasWarning && (
                  <AlertTriangle className="w-4 h-4 text-warning-500 flex-shrink-0" />
                )}
              </h3>
            )}
            {subtitle && (
              <p className="medical-card-subtitle mt-1">{subtitle}</p>
            )}
          </div>
          
          {confidenceScore !== undefined && (
            <ConfidenceIndicator score={confidenceScore} />
          )}
        </div>
      )}
      
      {/* Content */}
      <div className="medical-card-content">
        {children}
      </div>
      
      {/* Footer with metadata */}
      {(sourceDocument || date || provider) && (
        <div className="medical-card-footer">
          <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
            {sourceDocument && (
              <div className="flex items-center space-x-1">
                <FileText className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{sourceDocument}</span>
              </div>
            )}
            
            {date && (
              <div className="flex items-center space-x-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>{formatDate(date)}</span>
              </div>
            )}
            
            {provider && (
              <div className="flex items-center space-x-1">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{provider}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Specialized medical card variants
export interface DiagnosticCardProps extends Omit<MedicalCardProps, 'title' | 'subtitle'> {
  diagnosis: string;
  icd10Code?: string;
  diagnosisDate?: Date | string;
  provider?: string;
}

export function DiagnosticCard({
  diagnosis,
  icd10Code,
  diagnosisDate,
  provider,
  severity = 'medium',
  ...props
}: DiagnosticCardProps) {
  return (
    <MedicalCard
      {...props}
      title={diagnosis}
      subtitle={icd10Code ? `ICD-10: ${icd10Code}` : undefined}
      date={diagnosisDate}
      provider={provider}
      severity={severity}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-600">
          Medical Diagnosis
        </span>
        {icd10Code && (
          <span className="diagnostic-code">
            {icd10Code}
          </span>
        )}
      </div>
    </MedicalCard>
  );
}

export interface MedicationCardProps extends Omit<MedicalCardProps, 'title' | 'subtitle'> {
  medicationName: string;
  dosage?: string;
  frequency?: string;
  prescribedDate?: Date | string;
  provider?: string;
  isActive?: boolean;
}

export function MedicationCard({
  medicationName,
  dosage,
  frequency,
  prescribedDate,
  provider,
  isActive = true,
  severity = isActive ? 'medium' : 'resolved',
  ...props
}: MedicationCardProps) {
  return (
    <MedicalCard
      {...props}
      title={medicationName}
      subtitle={dosage ? `Dosage: ${dosage}` : undefined}
      date={prescribedDate}
      provider={provider}
      severity={severity}
    >
      <div className="space-y-2">
        {frequency && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-neutral-600">Frequency:</span>
            <span className="text-sm font-medium">{frequency}</span>
          </div>
        )}
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-600">Status:</span>
          <span className={`text-sm font-medium ${isActive ? 'text-success-600' : 'text-neutral-500'}`}>
            {isActive ? 'Active' : 'Discontinued'}
          </span>
        </div>
      </div>
    </MedicalCard>
  );
}

export interface LabResultCardProps extends Omit<MedicalCardProps, 'title' | 'subtitle'> {
  testName: string;
  result: string;
  unit?: string;
  referenceRange?: string;
  testDate?: Date | string;
  isAbnormal?: boolean;
}

export function LabResultCard({
  testName,
  result,
  unit,
  referenceRange,
  testDate,
  isAbnormal = false,
  severity = isAbnormal ? 'high' : 'resolved',
  ...props
}: LabResultCardProps) {
  return (
    <MedicalCard
      {...props}
      title={testName}
      date={testDate}
      severity={severity}
      hasWarning={isAbnormal}
    >
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-600">Result:</span>
          <span className={`text-sm font-medium ${isAbnormal ? 'text-warning-600' : 'text-success-600'}`}>
            {result} {unit && <span className="text-neutral-500">{unit}</span>}
          </span>
        </div>
        
        {referenceRange && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-neutral-600">Reference:</span>
            <span className="text-sm text-neutral-500">{referenceRange}</span>
          </div>
        )}
        
        {isAbnormal && (
          <div className="mt-2 p-2 bg-warning-50 border border-warning-200 rounded text-xs">
            <strong>Note:</strong> This result is outside the normal reference range. 
            Please consult with your healthcare provider.
          </div>
        )}
      </div>
    </MedicalCard>
  );
}