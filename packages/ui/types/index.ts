// Guardian UI TypeScript Definitions
// Comprehensive type definitions for healthcare UI components

import { LucideIcon } from 'lucide-react';

// Core design system types
export type {
  GuardianTheme,
  ColorScale,
  ProfileColor,
  SeverityLevel
} from '../themes/guardian-theme';

// Base component prop interfaces
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

// Size variants used across components
export type ComponentSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Common healthcare data types
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

// Profile system types
export type ProfileType = 'self' | 'child' | 'pet' | 'dependent' | 'guardian';

export interface UserProfile {
  id: string;
  display_name: string;
  profile_type: ProfileType;
  avatar_url?: string;
  relationship?: string;
  birth_date?: Date;
}

// Medical data severity levels
export type MedicalSeverity = 'critical' | 'high' | 'medium' | 'low' | 'resolved';

// Medical event types for timeline
export type MedicalEventType = 
  | 'appointment' 
  | 'medication' 
  | 'lab_result' 
  | 'diagnosis' 
  | 'procedure' 
  | 'note' 
  | 'custom';

// Status types for various healthcare contexts
export type MedicalStatus = 'normal' | 'abnormal' | 'critical' | 'inconclusive' | 'pending';
export type MedicationStatus = 'prescribed' | 'active' | 'discontinued' | 'completed' | 'on-hold';
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';

// Button variant types
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';

// Dropdown alignment and positioning
export type DropdownAlign = 'left' | 'right' | 'center';
export type DropdownPosition = 'top' | 'bottom';

// Medical card variants
export type MedicalCardVariant = 'default' | 'elevated' | 'minimal' | 'highlighted';

// Timeline configuration types
export interface TimelineConfig {
  groupByDate?: boolean;
  sortOrder?: 'ascending' | 'descending';
  maxEvents?: number;
  showFilters?: boolean;
}

// Confidence scoring thresholds
export interface ConfidenceThreshold {
  high: number;    // default 90
  medium: number;  // default 70
}

// Animation and transition types
export type AnimationDuration = 'fast' | 'base' | 'slow' | 'slower';
export type AnimationEasing = 'base' | 'in' | 'out' | 'in-out';

// Icon component type (from lucide-react)
export type IconComponent = LucideIcon;

// Form-related types
export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface FormFieldError {
  message: string;
  type: 'required' | 'invalid' | 'custom';
}

// Healthcare-specific data interfaces
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
  duration?: number; // minutes
  location?: string;
  status: AppointmentStatus;
  type: 'consultation' | 'follow-up' | 'procedure' | 'screening' | 'emergency';
  notes?: string;
}

// Timeline event interface
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

// Audit and tracking interfaces
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

// Privacy and compliance types
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';
export type ConsentStatus = 'granted' | 'denied' | 'pending' | 'expired';

export interface PrivacySettings {
  dataClassification: DataClassification;
  shareWithProviders: boolean;
  shareWithFamily: boolean;
  auditLogging: boolean;
  dataRetentionYears?: number;
}

// Error handling types
export interface ComponentError {
  message: string;
  code?: string;
  recoverable: boolean;
  timestamp: Date;
}

// Accessibility types
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

// Component state types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface ComponentState {
  loading: LoadingState;
  error?: ComponentError;
  data?: any;
  lastUpdated?: Date;
}

// Search and filtering types
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

// Pagination types
export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Responsive design types
export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface ResponsiveConfig {
  mobile?: any;
  tablet?: any;
  desktop?: any;
  widescreen?: any;
}

// Export utility types for component development  
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Component composition helpers
export type ComponentWithChildren<T = {}> = T & {
  children: React.ReactNode;
};

export type ComponentWithOptionalChildren<T = {}> = T & {
  children?: React.ReactNode;
};

// Forward ref types
export type ForwardRefComponent<T, P = {}> = React.ForwardRefExoticComponent<
  React.PropsWithoutRef<P> & React.RefAttributes<T>
>;