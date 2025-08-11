import { LucideIcon } from 'lucide-react';
export type { GuardianTheme, ColorScale, ProfileColor, SeverityLevel } from '../themes/guardian-theme';
export interface BaseComponentProps {
    /** Additional CSS classes */
    className?: string;
    /** Click handler */
    onClick?: () => void;
    /** Disabled state */
    disabled?: boolean;
    /** Loading state */
    isLoading?: boolean;
}
export type ComponentSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export interface HealthcareProvider {
    id: string;
    name: string;
    specialty?: string;
    organization?: string;
}
export interface MedicalDocument {
    id: string;
    filename: string;
    uploadDate: Date;
    type: 'lab_report' | 'imaging' | 'clinical_note' | 'prescription' | 'other';
    confidenceScore?: number;
}
export type ProfileType = 'self' | 'child' | 'pet' | 'dependent' | 'guardian';
export interface UserProfile {
    id: string;
    display_name: string;
    profile_type: ProfileType;
    avatar_url?: string;
    relationship?: string;
    birth_date?: Date;
}
export type MedicalSeverity = 'critical' | 'high' | 'medium' | 'low' | 'resolved';
export type MedicalEventType = 'appointment' | 'medication' | 'lab_result' | 'diagnosis' | 'procedure' | 'note' | 'custom';
export type MedicalStatus = 'normal' | 'abnormal' | 'critical' | 'inconclusive' | 'pending';
export type MedicationStatus = 'prescribed' | 'active' | 'discontinued' | 'completed' | 'on-hold';
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type DropdownAlign = 'left' | 'right' | 'center';
export type DropdownPosition = 'top' | 'bottom';
export type MedicalCardVariant = 'default' | 'elevated' | 'minimal' | 'highlighted';
export interface TimelineConfig {
    groupByDate?: boolean;
    sortOrder?: 'ascending' | 'descending';
    maxEvents?: number;
    showFilters?: boolean;
}
export interface ConfidenceThreshold {
    high: number;
    medium: number;
}
export type AnimationDuration = 'fast' | 'base' | 'slow' | 'slower';
export type AnimationEasing = 'base' | 'in' | 'out' | 'in-out';
export type IconComponent = LucideIcon;
export interface SelectOption {
    value: string | number;
    label: string;
    disabled?: boolean;
}
export interface FormFieldError {
    message: string;
    type: 'required' | 'invalid' | 'custom';
}
export interface DiagnosisData {
    id: string;
    diagnosis: string;
    icd10Code?: string;
    diagnosisDate: Date;
    provider: HealthcareProvider;
    severity: MedicalSeverity;
    notes?: string;
}
export interface MedicationData {
    id: string;
    name: string;
    dosage?: string;
    frequency?: string;
    prescribedDate: Date;
    provider: HealthcareProvider;
    isActive: boolean;
    notes?: string;
}
export interface LabResultData {
    id: string;
    testName: string;
    result: string;
    unit?: string;
    referenceRange?: string;
    testDate: Date;
    provider: HealthcareProvider;
    isAbnormal: boolean;
    confidenceScore?: number;
}
export interface AppointmentData {
    id: string;
    title: string;
    provider: HealthcareProvider;
    appointmentDate: Date;
    duration?: number;
    location?: string;
    status: AppointmentStatus;
    type: 'consultation' | 'follow-up' | 'procedure' | 'screening' | 'emergency';
    notes?: string;
}
export interface TimelineEvent {
    id: string;
    type: MedicalEventType;
    title: string;
    description?: string;
    date: Date | string;
    provider?: string;
    location?: string;
    severity?: MedicalSeverity;
    metadata?: Record<string, any>;
    sourceDocument?: string;
    confidenceScore?: number;
}
export interface AuditEntry {
    id: string;
    action: string;
    timestamp: Date;
    userId: string;
    profileId?: string;
    resourceType: 'document' | 'profile' | 'appointment' | 'medication';
    resourceId: string;
    changes?: Record<string, any>;
}
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';
export type ConsentStatus = 'granted' | 'denied' | 'pending' | 'expired';
export interface PrivacySettings {
    dataClassification: DataClassification;
    shareWithProviders: boolean;
    shareWithFamily: boolean;
    auditLogging: boolean;
    dataRetentionYears?: number;
}
export interface ComponentError {
    message: string;
    code?: string;
    recoverable: boolean;
    timestamp: Date;
}
export interface AccessibilityProps {
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
    'aria-expanded'?: boolean;
    'aria-selected'?: boolean;
    'aria-disabled'?: boolean;
    role?: string;
    tabIndex?: number;
}
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
export interface ComponentState {
    loading: LoadingState;
    error?: ComponentError;
    data?: any;
    lastUpdated?: Date;
}
export interface SearchFilter {
    query?: string;
    dateRange?: {
        start: Date;
        end: Date;
    };
    providers?: string[];
    eventTypes?: MedicalEventType[];
    severity?: MedicalSeverity[];
    status?: string[];
}
export interface PaginationConfig {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}
export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export interface ResponsiveConfig {
    mobile?: any;
    tablet?: any;
    desktop?: any;
    widescreen?: any;
}
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type ComponentWithChildren<T = {}> = T & {
    children: React.ReactNode;
};
export type ComponentWithOptionalChildren<T = {}> = T & {
    children?: React.ReactNode;
};
export type ForwardRefComponent<T, P = {}> = React.ForwardRefExoticComponent<React.PropsWithoutRef<P> & React.RefAttributes<T>>;
