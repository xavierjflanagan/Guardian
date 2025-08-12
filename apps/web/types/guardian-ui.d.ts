// Type declarations for @guardian/ui package

declare module '@guardian/ui' {
  import { ReactNode } from 'react';

  // Avatar types
  export interface Profile {
    id: string;
    display_name: string;
    profile_type: string;
    avatar_url?: string;
  }

  export interface AvatarProps {
    profile: Profile | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    showOnlineStatus?: boolean;
    fallbackInitials?: string;
  }

  export function Avatar(props: AvatarProps): JSX.Element;
  export function ProfileAvatar(props: AvatarProps & {
    showName?: boolean;
    namePosition?: 'right' | 'bottom';
    nameClassName?: string;
  }): JSX.Element;

  // Dropdown types
  export interface DropdownProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: 'left' | 'right' | 'center';
    position?: 'bottom' | 'top';
    className?: string;
    disabled?: boolean;
    closeOnItemClick?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
  }

  export interface DropdownItemProps {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    active?: boolean;
    selected?: boolean;
    variant?: 'default' | 'danger' | 'success';
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
  }

  export function Dropdown(props: DropdownProps): JSX.Element;
  export function DropdownItem(props: DropdownItemProps): JSX.Element;
  export function DropdownDivider(props: { className?: string }): JSX.Element;
  export function DropdownHeader(props: { children: ReactNode; className?: string }): JSX.Element;

  // ConfidenceIndicator types
  export interface ConfidenceIndicatorProps {
    score: number;
    label?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    showIcon?: boolean;
    showPercentage?: boolean;
    variant?: 'bar' | 'badge' | 'circular' | 'minimal';
    threshold?: {
      high: number;
      medium: number;
    };
    className?: string;
  }

  export function ConfidenceIndicator(props: ConfidenceIndicatorProps): JSX.Element;

  // Button types
  export interface ButtonProps {
    children: ReactNode;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    disabled?: boolean;
    loading?: boolean;
    className?: string;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
  }

  export function Button(props: ButtonProps): JSX.Element;

  // StatusBadge types
  export interface StatusBadgeProps {
    status: string;
    variant?: 'default' | 'outline' | 'subtle';
    size?: 'xs' | 'sm' | 'md';
    className?: string;
  }

  export function StatusBadge(props: StatusBadgeProps): JSX.Element;

  // MedicalCard types
  export interface MedicalCardProps {
    children: ReactNode;
    variant?: 'default' | 'elevated' | 'minimal';
    className?: string;
    padding?: 'sm' | 'md' | 'lg';
    sourceDocument?: string;
    title?: string;
    subtitle?: string;
    date?: string;
    confidence?: number;
    status?: string;
    onClick?: () => void;
  }

  export function MedicalCard(props: MedicalCardProps): JSX.Element;

  // Timeline types
  export interface TimelineProps {
    children: ReactNode;
    className?: string;
  }

  export function Timeline(props: TimelineProps): JSX.Element;

  // Design system utilities
  export const UI_PACKAGE_VERSION: string;
  export function getProfileColor(profileType: string): string;
  export function getSeverityColor(severity: string): string;
  export function profileIndicatorClass(profileType: string, size?: 'sm' | 'md' | 'lg'): string;
  export function medicalCardClass(variant?: 'default' | 'elevated' | 'minimal'): string;

  // Theme exports
  export const guardianTheme: any;
  export const colors: any;
  export const spacing: any;
  export const typography: any;
}