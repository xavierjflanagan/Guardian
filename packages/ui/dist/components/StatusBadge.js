'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CheckCircle, AlertCircle, AlertTriangle, Clock, XCircle, Info } from 'lucide-react';
// Status configurations with healthcare context
const statusConfig = {
    'success': {
        icon: CheckCircle,
        colorClasses: 'bg-success-100 text-success-800 border-success-200',
        label: 'Success'
    },
    'warning': {
        icon: AlertTriangle,
        colorClasses: 'bg-warning-100 text-warning-800 border-warning-200',
        label: 'Warning'
    },
    'error': {
        icon: XCircle,
        colorClasses: 'bg-error-100 text-error-800 border-error-200',
        label: 'Error'
    },
    'info': {
        icon: Info,
        colorClasses: 'bg-primary-100 text-primary-800 border-primary-200',
        label: 'Info'
    },
    'pending': {
        icon: Clock,
        colorClasses: 'bg-neutral-100 text-neutral-800 border-neutral-200',
        label: 'Pending'
    },
    'active': {
        icon: CheckCircle,
        colorClasses: 'bg-success-100 text-success-800 border-success-200',
        label: 'Active'
    },
    'inactive': {
        icon: XCircle,
        colorClasses: 'bg-neutral-100 text-neutral-600 border-neutral-200',
        label: 'Inactive'
    },
    'critical': {
        icon: AlertCircle,
        colorClasses: 'bg-error-100 text-error-800 border-error-300',
        label: 'Critical'
    },
    'resolved': {
        icon: CheckCircle,
        colorClasses: 'bg-success-100 text-success-700 border-success-200',
        label: 'Resolved'
    },
    'in-progress': {
        icon: Clock,
        colorClasses: 'bg-primary-100 text-primary-800 border-primary-200',
        label: 'In Progress'
    },
    'cancelled': {
        icon: XCircle,
        colorClasses: 'bg-neutral-100 text-neutral-600 border-neutral-200',
        label: 'Cancelled'
    }
};
// Size configurations
const sizeConfig = {
    'xs': {
        textSize: 'text-xs',
        padding: 'px-2 py-0.5',
        iconSize: 10,
        height: 'h-4'
    },
    'sm': {
        textSize: 'text-xs',
        padding: 'px-2.5 py-0.5',
        iconSize: 12,
        height: 'h-5'
    },
    'md': {
        textSize: 'text-sm',
        padding: 'px-3 py-1',
        iconSize: 14,
        height: 'h-6'
    },
    'lg': {
        textSize: 'text-sm',
        padding: 'px-3 py-1.5',
        iconSize: 16,
        height: 'h-7'
    }
};
export function StatusBadge({ status, size = 'sm', text, showIcon = true, className = '', onClick, children }) {
    const config = statusConfig[status];
    const sizeConf = sizeConfig[size];
    const Icon = config.icon;
    const displayText = children || text || config.label;
    const badgeClasses = `
    inline-flex items-center space-x-1 rounded-full font-medium border
    ${config.colorClasses}
    ${sizeConf.textSize}
    ${sizeConf.padding}
    ${sizeConf.height}
    ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
    ${className}
  `.trim();
    return (_jsxs("span", { className: badgeClasses, onClick: onClick, children: [showIcon && (_jsx(Icon, { size: sizeConf.iconSize, className: "flex-shrink-0" })), _jsx("span", { className: "whitespace-nowrap", children: displayText })] }));
}
export function MedicalStatusBadge({ status, ...props }) {
    const medicalStatusMap = {
        'normal': 'success',
        'abnormal': 'warning',
        'critical': 'critical',
        'inconclusive': 'info',
        'pending': 'pending'
    };
    const medicalLabels = {
        'normal': 'Normal',
        'abnormal': 'Abnormal',
        'critical': 'Critical',
        'inconclusive': 'Inconclusive',
        'pending': 'Pending'
    };
    return (_jsx(StatusBadge, { status: medicalStatusMap[status], text: props.text || medicalLabels[status], ...props }));
}
export function MedicationStatusBadge({ status, ...props }) {
    const medicationStatusMap = {
        'prescribed': 'info',
        'active': 'active',
        'discontinued': 'inactive',
        'completed': 'resolved',
        'on-hold': 'warning'
    };
    const medicationLabels = {
        'prescribed': 'Prescribed',
        'active': 'Active',
        'discontinued': 'Discontinued',
        'completed': 'Completed',
        'on-hold': 'On Hold'
    };
    return (_jsx(StatusBadge, { status: medicationStatusMap[status], text: props.text || medicationLabels[status], ...props }));
}
export function AppointmentStatusBadge({ status, ...props }) {
    const appointmentStatusMap = {
        'scheduled': 'pending',
        'confirmed': 'success',
        'in-progress': 'in-progress',
        'completed': 'resolved',
        'cancelled': 'cancelled',
        'no-show': 'error'
    };
    const appointmentLabels = {
        'scheduled': 'Scheduled',
        'confirmed': 'Confirmed',
        'in-progress': 'In Progress',
        'completed': 'Completed',
        'cancelled': 'Cancelled',
        'no-show': 'No Show'
    };
    return (_jsx(StatusBadge, { status: appointmentStatusMap[status], text: props.text || appointmentLabels[status], ...props }));
}
export function SeverityBadge({ severity, showIcon = true, ...props }) {
    const severityStatusMap = {
        'low': 'info',
        'medium': 'warning',
        'high': 'error',
        'critical': 'critical'
    };
    const severityLabels = {
        'low': 'Low Priority',
        'medium': 'Medium Priority',
        'high': 'High Priority',
        'critical': 'Critical'
    };
    return (_jsx(StatusBadge, { status: severityStatusMap[severity], text: props.text || severityLabels[severity], showIcon: showIcon, ...props }));
}
export function ConfidenceBadge({ score, showScore = true, ...props }) {
    const getConfidenceStatus = (score) => {
        if (score >= 90)
            return 'success';
        if (score >= 70)
            return 'warning';
        return 'error';
    };
    const getConfidenceLabel = (score) => {
        if (score >= 90)
            return 'High Confidence';
        if (score >= 70)
            return 'Medium Confidence';
        return 'Low Confidence';
    };
    const displayText = showScore
        ? `${getConfidenceLabel(score)} (${score}%)`
        : getConfidenceLabel(score);
    return (_jsx(StatusBadge, { status: getConfidenceStatus(score), text: displayText, showIcon: false, ...props }));
}
export function StatusBadgeGroup({ badges, layout = 'horizontal', spacing = 'normal', className = '' }) {
    const spacingClasses = {
        'tight': layout === 'horizontal' ? 'space-x-1' : 'space-y-1',
        'normal': layout === 'horizontal' ? 'space-x-2' : 'space-y-2',
        'loose': layout === 'horizontal' ? 'space-x-3' : 'space-y-3'
    };
    const layoutClasses = layout === 'horizontal' ? 'flex flex-wrap items-center' : 'flex flex-col';
    return (_jsx("div", { className: `${layoutClasses} ${spacingClasses[spacing]} ${className}`, children: badges.map(({ key, ...badgeProps }) => (_jsx(StatusBadge, { ...badgeProps }, key))) }));
}
