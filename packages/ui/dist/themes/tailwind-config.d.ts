import type { Config } from 'tailwindcss';
export declare const guardianTailwindConfig: Config;
export declare const guardianColors: import("tailwindcss/types/config").ResolvableTo<import("tailwindcss/types/config").RecursiveKeyValuePair<string, string>>;
export declare const guardianSpacing: {
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
export declare const guardianTypography: {
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
