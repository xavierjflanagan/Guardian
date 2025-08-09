// Guardian Healthcare Design System
// Comprehensive theme tokens for healthcare applications

export const guardianTheme = {
  // Color Palette - Healthcare focused
  colors: {
    // Primary - Medical blue (trust, reliability)
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6', // Primary blue
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554'
    },
    
    // Secondary - Healthcare teal (healing, wellness)
    secondary: {
      50: '#f0fdfa',
      100: '#ccfbf1',
      200: '#99f6e4',
      300: '#5eead4',
      400: '#2dd4bf',
      500: '#14b8a6', // Primary teal
      600: '#0d9488',
      700: '#0f766e',
      800: '#115e59',
      900: '#134e4a',
      950: '#042f2e'
    },
    
    // Status Colors - Medical context aware
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e', // Healthy green
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d'
    },
    
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b', // Attention amber
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f'
    },
    
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444', // Alert red
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d'
    },
    
    // Profile Type Colors - Family healthcare
    profiles: {
      self: '#3b82f6',      // Blue - primary user
      child: '#22c55e',     // Green - children/dependents
      pet: '#f97316',       // Orange - pets
      dependent: '#a855f7', // Purple - other dependents
      guardian: '#14b8a6'   // Teal - caregivers
    },
    
    // Medical Severity Indicators
    severity: {
      critical: '#dc2626',  // Red - urgent/critical
      high: '#f59e0b',      // Amber - important
      medium: '#3b82f6',    // Blue - routine
      low: '#6b7280',       // Gray - informational
      resolved: '#22c55e'   // Green - resolved/healthy
    },
    
    // Neutral/Gray Scale - Clinical context
    neutral: {
      0: '#ffffff',
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
      950: '#030712'
    }
  },
  
  // Typography - Healthcare readability focused
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'], // High readability
      mono: ['JetBrains Mono', 'monospace'],      // Medical data/codes
      medical: ['Inter', 'system-ui', 'sans-serif'] // Specialized medical text
    },
    
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px - small labels
      sm: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px - secondary text
      base: ['1rem', { lineHeight: '1.5rem' }],     // 16px - body text
      lg: ['1.125rem', { lineHeight: '1.75rem' }],  // 18px - large body
      xl: ['1.25rem', { lineHeight: '1.75rem' }],   // 20px - headings
      '2xl': ['1.5rem', { lineHeight: '2rem' }],    // 24px - large headings
      '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px - section headers
      '4xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36px - page headers
    },
    
    fontWeight: {
      normal: '400',   // Regular text
      medium: '500',   // Emphasis
      semibold: '600', // Headings
      bold: '700'      // Strong emphasis
    },
    
    // Healthcare-specific text styles
    medical: {
      'diagnostic-code': {
        fontFamily: 'mono',
        fontSize: 'sm',
        fontWeight: 'medium',
        color: 'neutral.600'
      },
      'medication-name': {
        fontWeight: 'semibold',
        fontSize: 'base'
      },
      'clinical-note': {
        fontSize: 'sm',
        lineHeight: '1.6',
        color: 'neutral.700'
      }
    }
  },
  
  // Spacing - Healthcare interface friendly
  spacing: {
    0: '0px',
    1: '0.25rem',  // 4px
    2: '0.5rem',   // 8px
    3: '0.75rem',  // 12px
    4: '1rem',     // 16px - base unit
    5: '1.25rem',  // 20px
    6: '1.5rem',   // 24px
    8: '2rem',     // 32px
    10: '2.5rem',  // 40px
    12: '3rem',    // 48px
    16: '4rem',    // 64px
    20: '5rem',    // 80px
    24: '6rem',    // 96px
    
    // Healthcare-specific spacing
    'card-padding': '1rem',      // Standard medical card padding
    'section-gap': '1.5rem',     // Between medical sections
    'form-gap': '1rem',          // Between form fields
    'timeline-gap': '0.75rem'    // Timeline item spacing
  },
  
  // Border Radius - Gentle, medical appropriate
  borderRadius: {
    none: '0px',
    sm: '0.125rem',  // 2px
    base: '0.25rem', // 4px - default
    md: '0.375rem',  // 6px - cards
    lg: '0.5rem',    // 8px - larger elements
    xl: '0.75rem',   // 12px - modal/panel
    full: '9999px'   // Pills/avatars
  },
  
  // Shadows - Subtle, clinical
  boxShadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    base: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    
    // Healthcare-specific shadows
    'medical-card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    'modal': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    'floating': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'
  },
  
  // Animation - Healthcare appropriate (gentle, accessible)
  animation: {
    duration: {
      fast: '150ms',
      base: '200ms',
      slow: '300ms',
      slower: '500ms'
    },
    
    easing: {
      base: 'cubic-bezier(0.4, 0, 0.2, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)'
    }
  },
  
  // Breakpoints - Responsive healthcare interfaces
  screens: {
    sm: '640px',   // Mobile
    md: '768px',   // Tablet
    lg: '1024px',  // Desktop
    xl: '1280px',  // Large desktop
    '2xl': '1536px' // Ultra-wide
  },
  
  // Z-Index layers
  zIndex: {
    dropdown: 10,
    modal: 40,
    toast: 50,
    tooltip: 60
  }
} as const;

// Export specific color palettes for easy access
export const colors = guardianTheme.colors;
export const spacing = guardianTheme.spacing;
export const typography = guardianTheme.typography;

// Type definitions for TypeScript
export type GuardianTheme = typeof guardianTheme;
export type ColorScale = typeof guardianTheme.colors.primary;
export type ProfileColor = keyof typeof guardianTheme.colors.profiles;
export type SeverityLevel = keyof typeof guardianTheme.colors.severity;