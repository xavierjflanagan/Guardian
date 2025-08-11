export declare const guardianTheme: {
    readonly colors: {
        readonly primary: {
            readonly 50: "#eff6ff";
            readonly 100: "#dbeafe";
            readonly 200: "#bfdbfe";
            readonly 300: "#93c5fd";
            readonly 400: "#60a5fa";
            readonly 500: "#3b82f6";
            readonly 600: "#2563eb";
            readonly 700: "#1d4ed8";
            readonly 800: "#1e40af";
            readonly 900: "#1e3a8a";
            readonly 950: "#172554";
        };
        readonly secondary: {
            readonly 50: "#f0fdfa";
            readonly 100: "#ccfbf1";
            readonly 200: "#99f6e4";
            readonly 300: "#5eead4";
            readonly 400: "#2dd4bf";
            readonly 500: "#14b8a6";
            readonly 600: "#0d9488";
            readonly 700: "#0f766e";
            readonly 800: "#115e59";
            readonly 900: "#134e4a";
            readonly 950: "#042f2e";
        };
        readonly success: {
            readonly 50: "#f0fdf4";
            readonly 100: "#dcfce7";
            readonly 200: "#bbf7d0";
            readonly 300: "#86efac";
            readonly 400: "#4ade80";
            readonly 500: "#22c55e";
            readonly 600: "#16a34a";
            readonly 700: "#15803d";
            readonly 800: "#166534";
            readonly 900: "#14532d";
        };
        readonly warning: {
            readonly 50: "#fffbeb";
            readonly 100: "#fef3c7";
            readonly 200: "#fde68a";
            readonly 300: "#fcd34d";
            readonly 400: "#fbbf24";
            readonly 500: "#f59e0b";
            readonly 600: "#d97706";
            readonly 700: "#b45309";
            readonly 800: "#92400e";
            readonly 900: "#78350f";
        };
        readonly error: {
            readonly 50: "#fef2f2";
            readonly 100: "#fee2e2";
            readonly 200: "#fecaca";
            readonly 300: "#fca5a5";
            readonly 400: "#f87171";
            readonly 500: "#ef4444";
            readonly 600: "#dc2626";
            readonly 700: "#b91c1c";
            readonly 800: "#991b1b";
            readonly 900: "#7f1d1d";
        };
        readonly profiles: {
            readonly self: "#3b82f6";
            readonly child: "#22c55e";
            readonly pet: "#f97316";
            readonly dependent: "#a855f7";
            readonly guardian: "#14b8a6";
        };
        readonly severity: {
            readonly critical: "#dc2626";
            readonly high: "#f59e0b";
            readonly medium: "#3b82f6";
            readonly low: "#6b7280";
            readonly resolved: "#22c55e";
        };
        readonly neutral: {
            readonly 0: "#ffffff";
            readonly 50: "#f9fafb";
            readonly 100: "#f3f4f6";
            readonly 200: "#e5e7eb";
            readonly 300: "#d1d5db";
            readonly 400: "#9ca3af";
            readonly 500: "#6b7280";
            readonly 600: "#4b5563";
            readonly 700: "#374151";
            readonly 800: "#1f2937";
            readonly 900: "#111827";
            readonly 950: "#030712";
        };
    };
    readonly typography: {
        readonly fontFamily: {
            readonly sans: readonly ["Inter", "system-ui", "sans-serif"];
            readonly mono: readonly ["JetBrains Mono", "monospace"];
            readonly medical: readonly ["Inter", "system-ui", "sans-serif"];
        };
        readonly fontSize: {
            readonly xs: readonly ["0.75rem", {
                readonly lineHeight: "1rem";
            }];
            readonly sm: readonly ["0.875rem", {
                readonly lineHeight: "1.25rem";
            }];
            readonly base: readonly ["1rem", {
                readonly lineHeight: "1.5rem";
            }];
            readonly lg: readonly ["1.125rem", {
                readonly lineHeight: "1.75rem";
            }];
            readonly xl: readonly ["1.25rem", {
                readonly lineHeight: "1.75rem";
            }];
            readonly '2xl': readonly ["1.5rem", {
                readonly lineHeight: "2rem";
            }];
            readonly '3xl': readonly ["1.875rem", {
                readonly lineHeight: "2.25rem";
            }];
            readonly '4xl': readonly ["2.25rem", {
                readonly lineHeight: "2.5rem";
            }];
        };
        readonly fontWeight: {
            readonly normal: "400";
            readonly medium: "500";
            readonly semibold: "600";
            readonly bold: "700";
        };
        readonly medical: {
            readonly 'diagnostic-code': {
                readonly fontFamily: "mono";
                readonly fontSize: "sm";
                readonly fontWeight: "medium";
                readonly color: "neutral.600";
            };
            readonly 'medication-name': {
                readonly fontWeight: "semibold";
                readonly fontSize: "base";
            };
            readonly 'clinical-note': {
                readonly fontSize: "sm";
                readonly lineHeight: "1.6";
                readonly color: "neutral.700";
            };
        };
    };
    readonly spacing: {
        readonly 0: "0px";
        readonly 1: "0.25rem";
        readonly 2: "0.5rem";
        readonly 3: "0.75rem";
        readonly 4: "1rem";
        readonly 5: "1.25rem";
        readonly 6: "1.5rem";
        readonly 8: "2rem";
        readonly 10: "2.5rem";
        readonly 12: "3rem";
        readonly 16: "4rem";
        readonly 20: "5rem";
        readonly 24: "6rem";
        readonly 'card-padding': "1rem";
        readonly 'section-gap': "1.5rem";
        readonly 'form-gap': "1rem";
        readonly 'timeline-gap': "0.75rem";
    };
    readonly borderRadius: {
        readonly none: "0px";
        readonly sm: "0.125rem";
        readonly base: "0.25rem";
        readonly md: "0.375rem";
        readonly lg: "0.5rem";
        readonly xl: "0.75rem";
        readonly full: "9999px";
    };
    readonly boxShadow: {
        readonly sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)";
        readonly base: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)";
        readonly md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
        readonly lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)";
        readonly 'medical-card': "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)";
        readonly modal: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)";
        readonly floating: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)";
    };
    readonly animation: {
        readonly duration: {
            readonly fast: "150ms";
            readonly base: "200ms";
            readonly slow: "300ms";
            readonly slower: "500ms";
        };
        readonly easing: {
            readonly base: "cubic-bezier(0.4, 0, 0.2, 1)";
            readonly in: "cubic-bezier(0.4, 0, 1, 1)";
            readonly out: "cubic-bezier(0, 0, 0.2, 1)";
            readonly 'in-out': "cubic-bezier(0.4, 0, 0.2, 1)";
        };
    };
    readonly screens: {
        readonly sm: "640px";
        readonly md: "768px";
        readonly lg: "1024px";
        readonly xl: "1280px";
        readonly '2xl': "1536px";
    };
    readonly zIndex: {
        readonly dropdown: 10;
        readonly modal: 40;
        readonly toast: 50;
        readonly tooltip: 60;
    };
};
export declare const colors: {
    readonly primary: {
        readonly 50: "#eff6ff";
        readonly 100: "#dbeafe";
        readonly 200: "#bfdbfe";
        readonly 300: "#93c5fd";
        readonly 400: "#60a5fa";
        readonly 500: "#3b82f6";
        readonly 600: "#2563eb";
        readonly 700: "#1d4ed8";
        readonly 800: "#1e40af";
        readonly 900: "#1e3a8a";
        readonly 950: "#172554";
    };
    readonly secondary: {
        readonly 50: "#f0fdfa";
        readonly 100: "#ccfbf1";
        readonly 200: "#99f6e4";
        readonly 300: "#5eead4";
        readonly 400: "#2dd4bf";
        readonly 500: "#14b8a6";
        readonly 600: "#0d9488";
        readonly 700: "#0f766e";
        readonly 800: "#115e59";
        readonly 900: "#134e4a";
        readonly 950: "#042f2e";
    };
    readonly success: {
        readonly 50: "#f0fdf4";
        readonly 100: "#dcfce7";
        readonly 200: "#bbf7d0";
        readonly 300: "#86efac";
        readonly 400: "#4ade80";
        readonly 500: "#22c55e";
        readonly 600: "#16a34a";
        readonly 700: "#15803d";
        readonly 800: "#166534";
        readonly 900: "#14532d";
    };
    readonly warning: {
        readonly 50: "#fffbeb";
        readonly 100: "#fef3c7";
        readonly 200: "#fde68a";
        readonly 300: "#fcd34d";
        readonly 400: "#fbbf24";
        readonly 500: "#f59e0b";
        readonly 600: "#d97706";
        readonly 700: "#b45309";
        readonly 800: "#92400e";
        readonly 900: "#78350f";
    };
    readonly error: {
        readonly 50: "#fef2f2";
        readonly 100: "#fee2e2";
        readonly 200: "#fecaca";
        readonly 300: "#fca5a5";
        readonly 400: "#f87171";
        readonly 500: "#ef4444";
        readonly 600: "#dc2626";
        readonly 700: "#b91c1c";
        readonly 800: "#991b1b";
        readonly 900: "#7f1d1d";
    };
    readonly profiles: {
        readonly self: "#3b82f6";
        readonly child: "#22c55e";
        readonly pet: "#f97316";
        readonly dependent: "#a855f7";
        readonly guardian: "#14b8a6";
    };
    readonly severity: {
        readonly critical: "#dc2626";
        readonly high: "#f59e0b";
        readonly medium: "#3b82f6";
        readonly low: "#6b7280";
        readonly resolved: "#22c55e";
    };
    readonly neutral: {
        readonly 0: "#ffffff";
        readonly 50: "#f9fafb";
        readonly 100: "#f3f4f6";
        readonly 200: "#e5e7eb";
        readonly 300: "#d1d5db";
        readonly 400: "#9ca3af";
        readonly 500: "#6b7280";
        readonly 600: "#4b5563";
        readonly 700: "#374151";
        readonly 800: "#1f2937";
        readonly 900: "#111827";
        readonly 950: "#030712";
    };
};
export declare const spacing: {
    readonly 0: "0px";
    readonly 1: "0.25rem";
    readonly 2: "0.5rem";
    readonly 3: "0.75rem";
    readonly 4: "1rem";
    readonly 5: "1.25rem";
    readonly 6: "1.5rem";
    readonly 8: "2rem";
    readonly 10: "2.5rem";
    readonly 12: "3rem";
    readonly 16: "4rem";
    readonly 20: "5rem";
    readonly 24: "6rem";
    readonly 'card-padding': "1rem";
    readonly 'section-gap': "1.5rem";
    readonly 'form-gap': "1rem";
    readonly 'timeline-gap': "0.75rem";
};
export declare const typography: {
    readonly fontFamily: {
        readonly sans: readonly ["Inter", "system-ui", "sans-serif"];
        readonly mono: readonly ["JetBrains Mono", "monospace"];
        readonly medical: readonly ["Inter", "system-ui", "sans-serif"];
    };
    readonly fontSize: {
        readonly xs: readonly ["0.75rem", {
            readonly lineHeight: "1rem";
        }];
        readonly sm: readonly ["0.875rem", {
            readonly lineHeight: "1.25rem";
        }];
        readonly base: readonly ["1rem", {
            readonly lineHeight: "1.5rem";
        }];
        readonly lg: readonly ["1.125rem", {
            readonly lineHeight: "1.75rem";
        }];
        readonly xl: readonly ["1.25rem", {
            readonly lineHeight: "1.75rem";
        }];
        readonly '2xl': readonly ["1.5rem", {
            readonly lineHeight: "2rem";
        }];
        readonly '3xl': readonly ["1.875rem", {
            readonly lineHeight: "2.25rem";
        }];
        readonly '4xl': readonly ["2.25rem", {
            readonly lineHeight: "2.5rem";
        }];
    };
    readonly fontWeight: {
        readonly normal: "400";
        readonly medium: "500";
        readonly semibold: "600";
        readonly bold: "700";
    };
    readonly medical: {
        readonly 'diagnostic-code': {
            readonly fontFamily: "mono";
            readonly fontSize: "sm";
            readonly fontWeight: "medium";
            readonly color: "neutral.600";
        };
        readonly 'medication-name': {
            readonly fontWeight: "semibold";
            readonly fontSize: "base";
        };
        readonly 'clinical-note': {
            readonly fontSize: "sm";
            readonly lineHeight: "1.6";
            readonly color: "neutral.700";
        };
    };
};
export type GuardianTheme = typeof guardianTheme;
export type ColorScale = typeof guardianTheme.colors.primary;
export type ProfileColor = keyof typeof guardianTheme.colors.profiles;
export type SeverityLevel = keyof typeof guardianTheme.colors.severity;
