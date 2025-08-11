'use client';
import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { FileText, Calendar, User, AlertTriangle } from 'lucide-react';
// Card variant styles using Guardian design system
const getVariantClasses = (variant = 'default') => {
    const variants = {
        'default': 'medical-card',
        'elevated': 'medical-card shadow-floating border-0',
        'minimal': 'bg-transparent border-0 shadow-none p-0',
        'highlighted': 'medical-card ring-2 ring-primary-200 border-primary-200'
    };
    return variants[variant];
};
// Severity indicator colors
const getSeverityClasses = (severity) => {
    if (!severity)
        return '';
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
const formatDate = (date) => {
    if (!date)
        return '';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime()))
        return '';
    return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};
// Confidence score indicator
const ConfidenceIndicator = ({ score }) => {
    const getConfidenceColor = (score) => {
        if (score >= 90)
            return 'text-success-600 bg-success-100';
        if (score >= 70)
            return 'text-warning-600 bg-warning-100';
        return 'text-error-600 bg-error-100';
    };
    const getConfidenceLabel = (score) => {
        if (score >= 90)
            return 'High';
        if (score >= 70)
            return 'Medium';
        return 'Low';
    };
    return (_jsxs("span", { className: `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(score)}`, children: ["Confidence: ", getConfidenceLabel(score), " (", score, "%)"] }));
};
export function MedicalCard({ children, variant = 'default', severity, className = '', title, subtitle, sourceDocument, date, provider, onClick, onEdit, onDelete, isLoading = false, hasWarning = false, confidenceScore }) {
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
        if (onClick)
            onClick();
    };
    if (isLoading) {
        return (_jsx("div", { className: cardClasses, children: _jsxs("div", { className: "animate-pulse space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "h-4 bg-neutral-200 rounded w-1/3" }), _jsx("div", { className: "h-3 bg-neutral-200 rounded w-1/4" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "h-3 bg-neutral-200 rounded w-full" }), _jsx("div", { className: "h-3 bg-neutral-200 rounded w-2/3" })] })] }) }));
    }
    return (_jsxs("div", { className: cardClasses, onClick: handleClick, children: [(title || subtitle || hasWarning || confidenceScore) && (_jsxs("div", { className: "medical-card-header", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [title && (_jsxs("h3", { className: "medical-card-title flex items-center space-x-2", children: [_jsx("span", { children: title }), hasWarning && (_jsx(AlertTriangle, { className: "w-4 h-4 text-warning-500 flex-shrink-0" }))] })), subtitle && (_jsx("p", { className: "medical-card-subtitle mt-1", children: subtitle }))] }), confidenceScore !== undefined && (_jsx(ConfidenceIndicator, { score: confidenceScore }))] })), _jsx("div", { className: "medical-card-content", children: children }), (sourceDocument || date || provider) && (_jsx("div", { className: "medical-card-footer", children: _jsxs("div", { className: "flex flex-wrap items-center gap-4 text-xs text-neutral-500", children: [sourceDocument && (_jsxs("div", { className: "flex items-center space-x-1", children: [_jsx(FileText, { className: "h-3 w-3 flex-shrink-0" }), _jsx("span", { className: "truncate", children: sourceDocument })] })), date && (_jsxs("div", { className: "flex items-center space-x-1", children: [_jsx(Calendar, { className: "h-3 w-3 flex-shrink-0" }), _jsx("span", { children: formatDate(date) })] })), provider && (_jsxs("div", { className: "flex items-center space-x-1", children: [_jsx(User, { className: "h-3 w-3 flex-shrink-0" }), _jsx("span", { className: "truncate", children: provider })] }))] }) }))] }));
}
export function DiagnosticCard({ diagnosis, icd10Code, diagnosisDate, provider, severity = 'medium', ...props }) {
    return (_jsx(MedicalCard, { ...props, title: diagnosis, subtitle: icd10Code ? `ICD-10: ${icd10Code}` : undefined, date: diagnosisDate, provider: provider, severity: severity, children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-sm text-neutral-600", children: "Medical Diagnosis" }), icd10Code && (_jsx("span", { className: "diagnostic-code", children: icd10Code }))] }) }));
}
export function MedicationCard({ medicationName, dosage, frequency, prescribedDate, provider, isActive = true, severity = isActive ? 'medium' : 'resolved', ...props }) {
    return (_jsx(MedicalCard, { ...props, title: medicationName, subtitle: dosage ? `Dosage: ${dosage}` : undefined, date: prescribedDate, provider: provider, severity: severity, children: _jsxs("div", { className: "space-y-2", children: [frequency && (_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm text-neutral-600", children: "Frequency:" }), _jsx("span", { className: "text-sm font-medium", children: frequency })] })), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm text-neutral-600", children: "Status:" }), _jsx("span", { className: `text-sm font-medium ${isActive ? 'text-success-600' : 'text-neutral-500'}`, children: isActive ? 'Active' : 'Discontinued' })] })] }) }));
}
export function LabResultCard({ testName, result, unit, referenceRange, testDate, isAbnormal = false, severity = isAbnormal ? 'high' : 'resolved', ...props }) {
    return (_jsx(MedicalCard, { ...props, title: testName, date: testDate, severity: severity, hasWarning: isAbnormal, children: _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm text-neutral-600", children: "Result:" }), _jsxs("span", { className: `text-sm font-medium ${isAbnormal ? 'text-warning-600' : 'text-success-600'}`, children: [result, " ", unit && _jsx("span", { className: "text-neutral-500", children: unit })] })] }), referenceRange && (_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm text-neutral-600", children: "Reference:" }), _jsx("span", { className: "text-sm text-neutral-500", children: referenceRange })] })), isAbnormal && (_jsxs("div", { className: "mt-2 p-2 bg-warning-50 border border-warning-200 rounded text-xs", children: [_jsx("strong", { children: "Note:" }), " This result is outside the normal reference range. Please consult with your healthcare provider."] }))] }) }));
}
