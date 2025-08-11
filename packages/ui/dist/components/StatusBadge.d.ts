import React from 'react';
export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'pending' | 'active' | 'inactive' | 'critical' | 'resolved' | 'in-progress' | 'cancelled';
export type StatusSize = 'xs' | 'sm' | 'md' | 'lg';
export interface StatusBadgeProps {
    status: StatusType;
    size?: StatusSize;
    text?: string;
    showIcon?: boolean;
    className?: string;
    onClick?: () => void;
    children?: React.ReactNode;
}
export declare function StatusBadge({ status, size, text, showIcon, className, onClick, children }: StatusBadgeProps): import("react/jsx-runtime").JSX.Element;
export interface MedicalStatusBadgeProps extends Omit<StatusBadgeProps, 'status'> {
    status: 'normal' | 'abnormal' | 'critical' | 'inconclusive' | 'pending';
}
export declare function MedicalStatusBadge({ status, ...props }: MedicalStatusBadgeProps): import("react/jsx-runtime").JSX.Element;
export interface MedicationStatusBadgeProps extends Omit<StatusBadgeProps, 'status'> {
    status: 'prescribed' | 'active' | 'discontinued' | 'completed' | 'on-hold';
}
export declare function MedicationStatusBadge({ status, ...props }: MedicationStatusBadgeProps): import("react/jsx-runtime").JSX.Element;
export interface AppointmentStatusBadgeProps extends Omit<StatusBadgeProps, 'status'> {
    status: 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
}
export declare function AppointmentStatusBadge({ status, ...props }: AppointmentStatusBadgeProps): import("react/jsx-runtime").JSX.Element;
export interface SeverityBadgeProps extends Omit<StatusBadgeProps, 'status' | 'showIcon'> {
    severity: 'low' | 'medium' | 'high' | 'critical';
    showIcon?: boolean;
}
export declare function SeverityBadge({ severity, showIcon, ...props }: SeverityBadgeProps): import("react/jsx-runtime").JSX.Element;
export interface ConfidenceBadgeProps extends Omit<StatusBadgeProps, 'status' | 'text'> {
    score: number;
    showScore?: boolean;
}
export declare function ConfidenceBadge({ score, showScore, ...props }: ConfidenceBadgeProps): import("react/jsx-runtime").JSX.Element;
export interface StatusBadgeGroupProps {
    badges: Array<StatusBadgeProps & {
        key: string;
    }>;
    layout?: 'horizontal' | 'vertical';
    spacing?: 'tight' | 'normal' | 'loose';
    className?: string;
}
export declare function StatusBadgeGroup({ badges, layout, spacing, className }: StatusBadgeGroupProps): import("react/jsx-runtime").JSX.Element;
export type { StatusBadgeProps, MedicalStatusBadgeProps, MedicationStatusBadgeProps, AppointmentStatusBadgeProps, SeverityBadgeProps, ConfidenceBadgeProps, StatusBadgeGroupProps };
