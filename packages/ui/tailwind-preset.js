/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      // Guardian Design System Colors
      colors: {
        // Primary Healthcare Blue
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',  // Primary brand
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        
        // Secondary colors
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',  // Secondary
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        
        // Status colors
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',  // Success
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',  // Warning
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        
        error: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',  // Error
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        
        // Healthcare Profile Colors
        'profile-self': '#0ea5e9',      // Blue
        'profile-child': '#22c55e',     // Green
        'profile-pet': '#f59e0b',       // Orange
        'profile-dependent': '#8b5cf6', // Purple
        'profile-guardian': '#06b6d4',  // Teal
        
        // Medical Severity Colors
        'severity-critical': '#dc2626',  // Red 600
        'severity-high': '#ea580c',      // Orange 600
        'severity-medium': '#f59e0b',    // Yellow 500
        'severity-low': '#22c55e',       // Green 500
        'severity-resolved': '#64748b',  // Gray 500
        
        // Neutral system (keep existing)
        neutral: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        
        // Alias for compatibility
        gray: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      
      // Typography
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
        medical: ['Inter', 'system-ui', 'sans-serif'], // Same as sans for now
      },
      
      // Healthcare-specific spacing
      spacing: {
        '18': '4.5rem',   // 72px
        '88': '22rem',    // 352px
        '128': '32rem',   // 512px
        'card-padding': '1.5rem',
        'timeline-gap': '1.5rem',
      },
      
      // Box shadows
      boxShadow: {
        'medical-card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'floating': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        'modal': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      },
      
      // Animation
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-gentle': 'pulseGentle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGentle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
      },
    },
  },
  
  plugins: [
    function({ addUtilities, addComponents, theme }) {
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
    },
  ],
};