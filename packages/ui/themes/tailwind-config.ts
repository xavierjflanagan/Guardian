// Guardian UI Tailwind Configuration
// Extends Tailwind with Guardian Design System tokens

import type { Config } from 'tailwindcss';
import { guardianTheme } from './guardian-theme';

// Transform Guardian theme tokens to Tailwind format
function createTailwindColors(colorObj: any, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(colorObj)) {
    const colorKey = prefix ? `${prefix}-${key}` : key;
    
    if (typeof value === 'string') {
      result[colorKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, createTailwindColors(value, colorKey));
    }
  }
  
  return result;
}

export const guardianTailwindConfig: Config = {
  content: [
    // This will be extended by consuming applications
  ],
  theme: {
    extend: {
      // Colors - Guardian Design System
      colors: {
        // Primary color system
        primary: guardianTheme.colors.primary,
        secondary: guardianTheme.colors.secondary,
        
        // Status colors
        success: guardianTheme.colors.success,
        warning: guardianTheme.colors.warning,
        error: guardianTheme.colors.error,
        
        // Healthcare-specific colors
        'profile-self': guardianTheme.colors.profiles.self,
        'profile-child': guardianTheme.colors.profiles.child,
        'profile-pet': guardianTheme.colors.profiles.pet,
        'profile-dependent': guardianTheme.colors.profiles.dependent,
        'profile-guardian': guardianTheme.colors.profiles.guardian,
        
        // Medical severity
        'severity-critical': guardianTheme.colors.severity.critical,
        'severity-high': guardianTheme.colors.severity.high,
        'severity-medium': guardianTheme.colors.severity.medium,
        'severity-low': guardianTheme.colors.severity.low,
        'severity-resolved': guardianTheme.colors.severity.resolved,
        
        // Neutral colors
        neutral: guardianTheme.colors.neutral,
        
        // Alias common colors to Guardian system
        gray: guardianTheme.colors.neutral,
      },
      
      // Typography - Inter font system
      fontFamily: {
        sans: guardianTheme.typography.fontFamily.sans as unknown as string[],
        mono: guardianTheme.typography.fontFamily.mono as unknown as string[],
        medical: guardianTheme.typography.fontFamily.medical as unknown as string[],
      },
      
      // Font sizes with line heights (cast to remove readonly)
      fontSize: guardianTheme.typography.fontSize as any,
      
      // Font weights
      fontWeight: guardianTheme.typography.fontWeight,
      
      // Spacing scale
      spacing: guardianTheme.spacing,
      
      // Border radius scale
      borderRadius: guardianTheme.borderRadius,
      
      // Box shadows
      boxShadow: {
        sm: guardianTheme.boxShadow.sm,
        DEFAULT: guardianTheme.boxShadow.base,
        md: guardianTheme.boxShadow.md,
        lg: guardianTheme.boxShadow.lg,
        'medical-card': guardianTheme.boxShadow['medical-card'],
        modal: guardianTheme.boxShadow.modal,
        floating: guardianTheme.boxShadow.floating,
      },
      
      // Animation
      transitionDuration: guardianTheme.animation.duration,
      transitionTimingFunction: guardianTheme.animation.easing,
      
      // Z-index (cast to string values for Tailwind)
      zIndex: {
        dropdown: '10',
        modal: '40', 
        toast: '50',
        tooltip: '60'
      },
      
      // Screens (breakpoints)
      screens: guardianTheme.screens,
    },
  },
  plugins: [
    // Custom Guardian plugins
    function({ addUtilities, addComponents, theme }: any) {
      // Medical text utilities
      addUtilities({
        '.text-diagnostic-code': {
          fontFamily: theme('fontFamily.mono'),
          fontSize: theme('fontSize.sm'),
          fontWeight: theme('fontWeight.medium'),
          color: theme('colors.neutral.600'),
        },
        '.text-medication-name': {
          fontWeight: theme('fontWeight.semibold'),
          fontSize: theme('fontSize.base'),
        },
        '.text-clinical-note': {
          fontSize: theme('fontSize.sm'),
          lineHeight: '1.6',
          color: theme('colors.neutral.700'),
        },
      });
      
      // Medical card components
      addComponents({
        '.medical-card': {
          backgroundColor: theme('colors.neutral.50'),
          border: `1px solid ${theme('colors.neutral.200')}`,
          borderRadius: theme('borderRadius.md'),
          padding: theme('spacing.card-padding'),
          boxShadow: theme('boxShadow.medical-card'),
        },
        '.medical-card-header': {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme('spacing.3'),
          paddingBottom: theme('spacing.2'),
          borderBottom: `1px solid ${theme('colors.neutral.200')}`,
        },
        '.medical-card-content': {
          color: theme('colors.neutral.700'),
          fontSize: theme('fontSize.sm'),
          lineHeight: '1.6',
        },
        '.medical-card-footer': {
          marginTop: theme('spacing.3'),
          paddingTop: theme('spacing.3'),
          borderTop: `1px solid ${theme('colors.neutral.200')}`,
          fontSize: theme('fontSize.xs'),
          color: theme('colors.neutral.500'),
        },
      });
      
      // Profile indicators
      addComponents({
        '.profile-indicator': {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme('borderRadius.full'),
          fontWeight: theme('fontWeight.semibold'),
          color: 'white',
        },
        '.profile-indicator-sm': {
          width: theme('spacing.6'),
          height: theme('spacing.6'),
          fontSize: theme('fontSize.xs'),
        },
        '.profile-indicator-md': {
          width: theme('spacing.8'),
          height: theme('spacing.8'),
          fontSize: theme('fontSize.sm'),
        },
        '.profile-indicator-lg': {
          width: theme('spacing.12'),
          height: theme('spacing.12'),
          fontSize: theme('fontSize.base'),
        },
      });
      
      // Timeline components
      addComponents({
        '.timeline-container': {
          position: 'relative',
        },
        '.timeline-item': {
          position: 'relative',
          paddingLeft: theme('spacing.6'),
          marginBottom: theme('spacing.timeline-gap'),
        },
        '.timeline-marker': {
          position: 'absolute',
          left: '0',
          top: '0.25rem',
          width: '0.5rem',
          height: '0.5rem',
          borderRadius: theme('borderRadius.full'),
          backgroundColor: theme('colors.primary.500'),
        },
        '.timeline-line': {
          position: 'absolute',
          left: '0.25rem',
          top: '0.75rem',
          bottom: '-0.75rem',
          width: '1px',
          backgroundColor: theme('colors.neutral.200'),
        },
      });
    },
  ],
};

// Export individual pieces for modular usage
export const guardianColors = guardianTailwindConfig.theme?.extend?.colors || {};
export const guardianSpacing = guardianTheme.spacing;
export const guardianTypography = guardianTheme.typography;