import React from 'react';
export interface MedicalCardProps {
    children: React.ReactNode;
    variant?: 'default' | 'elevated' | 'minimal' | 'highlighted';
    severity?: 'critical' | 'high' | 'medium' | 'low' | 'resolved';
    className?: string;
    title?: string;
    subtitle?: string;
    sourceDocument?: string | null;
    date?: Date | string | null;
    provider?: string | null;
    onClick?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    isLoading?: boolean;
    hasWarning?: boolean;
    confidenceScore?: number;
}
export declare function MedicalCard({ children, variant, severity, className, title, subtitle, sourceDocument, date, provider, onClick, onEdit, onDelete, isLoading, hasWarning, confidenceScore }: MedicalCardProps): import("react/jsx-runtime").JSX.Element;
export interface DiagnosticCardProps extends Omit<MedicalCardProps, 'title' | 'subtitle'> {
    diagnosis: string;
    icd10Code?: string;
    diagnosisDate?: Date | string;
    provider?: string;
}
export declare function DiagnosticCard({ diagnosis, icd10Code, diagnosisDate, provider, severity, ...props }: DiagnosticCardProps): import("react/jsx-runtime").JSX.Element;
export interface MedicationCardProps extends Omit<MedicalCardProps, 'title' | 'subtitle'> {
    medicationName: string;
    dosage?: string;
    frequency?: string;
    prescribedDate?: Date | string;
    provider?: string;
    isActive?: boolean;
}
export declare function MedicationCard({ medicationName, dosage, frequency, prescribedDate, provider, isActive, severity, ...props }: MedicationCardProps): import("react/jsx-runtime").JSX.Element;
export interface LabResultCardProps extends Omit<MedicalCardProps, 'title' | 'subtitle'> {
    testName: string;
    result: string;
    unit?: string;
    referenceRange?: string;
    testDate?: Date | string;
    isAbnormal?: boolean;
}
export declare function LabResultCard({ testName, result, unit, referenceRange, testDate, isAbnormal, severity, ...props }: LabResultCardProps): import("react/jsx-runtime").JSX.Element;
