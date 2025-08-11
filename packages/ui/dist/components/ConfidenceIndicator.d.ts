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
export declare function ConfidenceIndicator({ score, label, variant, ...props }: ConfidenceIndicatorProps): import("react/jsx-runtime").JSX.Element;
export interface ConfidenceComparisonProps {
    before: number;
    after: number;
    size?: ConfidenceIndicatorProps['size'];
    className?: string;
}
export declare function ConfidenceComparison({ before, after, size, className }: ConfidenceComparisonProps): import("react/jsx-runtime").JSX.Element;
export type { ConfidenceComparisonProps };
