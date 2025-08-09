// @guardian/ui
// Guardian Healthcare UI Component Library

// Export design system tokens
export { guardianTheme, colors, spacing, typography } from './themes/guardian-theme';
export { guardianTailwindConfig, guardianColors, guardianSpacing, guardianTypography } from './themes/tailwind-config';

// Export base styles (to be imported in consuming apps)
export * from './styles/base.css';

// Component exports (will be added as we extract components)
export * from './components';

// Type exports
export type {
  GuardianTheme,
  ColorScale,
  ProfileColor,
  SeverityLevel
} from './themes/guardian-theme';

// Version
export const UI_PACKAGE_VERSION = '1.0.0';

// Design system utilities
export const getProfileColor = (profileType: string): string => {
  const colorMap: Record<string, string> = {
    'self': 'var(--guardian-profile-self)',
    'child': 'var(--guardian-profile-child)',
    'pet': 'var(--guardian-profile-pet)',
    'dependent': 'var(--guardian-profile-dependent)',
    'guardian': 'var(--guardian-profile-guardian)'
  };
  
  return colorMap[profileType] || colorMap['self'];
};

export const getSeverityColor = (severity: string): string => {
  const severityMap: Record<string, string> = {
    'critical': 'var(--guardian-severity-critical)',
    'high': 'var(--guardian-severity-high)',
    'medium': 'var(--guardian-severity-medium)',
    'low': 'var(--guardian-severity-low)',
    'resolved': 'var(--guardian-severity-resolved)'
  };
  
  return severityMap[severity] || severityMap['medium'];
};

// CSS class helpers
export const profileIndicatorClass = (profileType: string, size: 'sm' | 'md' | 'lg' = 'md'): string => {
  const baseClass = 'profile-indicator';
  const sizeClass = `profile-indicator-${size}`;
  const typeClass = `profile-indicator-${profileType}`;
  
  return `${baseClass} ${sizeClass} ${typeClass}`;
};

export const medicalCardClass = (variant: 'default' | 'elevated' | 'minimal' = 'default'): string => {
  const baseClass = 'medical-card';
  
  const variantClasses = {
    'default': '',
    'elevated': 'shadow-floating border-0',
    'minimal': 'border-0 bg-transparent shadow-none'
  };
  
  return `${baseClass} ${variantClasses[variant]}`.trim();
};

// Animation helpers
export const fadeInClass = 'animate-fade-in';
export const slideUpClass = 'animate-slide-up';
export const pulseGentleClass = 'animate-pulse-gentle';