'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
// Default thresholds for confidence scoring
const DEFAULT_THRESHOLDS = {
    high: 90,
    medium: 70
};
// Get confidence level and associated styling
const getConfidenceLevel = (score, threshold = DEFAULT_THRESHOLDS) => {
    if (score >= threshold.high) {
        return {
            level: 'high',
            color: 'success',
            bgColor: 'bg-success-50',
            textColor: 'text-success-700',
            barColor: 'bg-success-500',
            borderColor: 'border-success-200',
            icon: TrendingUp
        };
    }
    if (score >= threshold.medium) {
        return {
            level: 'medium',
            color: 'warning',
            bgColor: 'bg-warning-50',
            textColor: 'text-warning-700',
            barColor: 'bg-warning-500',
            borderColor: 'border-warning-200',
            icon: Minus
        };
    }
    return {
        level: 'low',
        color: 'error',
        bgColor: 'bg-error-50',
        textColor: 'text-error-700',
        barColor: 'bg-error-500',
        borderColor: 'border-error-200',
        icon: TrendingDown
    };
};
// Size configurations
const sizeConfig = {
    xs: {
        barHeight: 'h-1',
        barWidth: 'w-12',
        textSize: 'text-xs',
        iconSize: 10,
        padding: 'px-2 py-1',
        circleSize: 16
    },
    sm: {
        barHeight: 'h-2',
        barWidth: 'w-16',
        textSize: 'text-xs',
        iconSize: 12,
        padding: 'px-2 py-1',
        circleSize: 20
    },
    md: {
        barHeight: 'h-3',
        barWidth: 'w-20',
        textSize: 'text-sm',
        iconSize: 14,
        padding: 'px-3 py-1.5',
        circleSize: 24
    },
    lg: {
        barHeight: 'h-4',
        barWidth: 'w-24',
        textSize: 'text-base',
        iconSize: 16,
        padding: 'px-4 py-2',
        circleSize: 32
    }
};
// Bar variant - progress bar style
const BarVariant = ({ score, size = 'sm', showIcon = true, showPercentage = true, threshold, className = '' }) => {
    const confidence = getConfidenceLevel(score, threshold);
    const sizeConf = sizeConfig[size];
    const Icon = confidence.icon;
    return (_jsxs("div", { className: `inline-flex items-center space-x-2 ${sizeConf.padding} rounded-full ${confidence.bgColor} ${confidence.borderColor} border ${className}`, children: [showIcon && (_jsx(Icon, { size: sizeConf.iconSize, className: confidence.textColor })), _jsx("div", { className: `${sizeConf.barWidth} ${sizeConf.barHeight} bg-neutral-200 rounded-full overflow-hidden`, children: _jsx("div", { className: `h-full ${confidence.barColor} transition-all duration-500 ease-out`, style: { width: `${Math.min(100, Math.max(0, score))}%` } }) }), showPercentage && (_jsxs("span", { className: `${sizeConf.textSize} font-medium ${confidence.textColor} tabular-nums`, children: [score.toFixed(1), "%"] }))] }));
};
// Badge variant - simple badge style
const BadgeVariant = ({ score, size = 'sm', showIcon = true, showPercentage = true, threshold, className = '' }) => {
    const confidence = getConfidenceLevel(score, threshold);
    const sizeConf = sizeConfig[size];
    const Icon = confidence.icon;
    const getLabel = () => {
        if (confidence.level === 'high')
            return 'High';
        if (confidence.level === 'medium')
            return 'Medium';
        return 'Low';
    };
    return (_jsxs("span", { className: `inline-flex items-center space-x-1 ${sizeConf.padding} rounded-full ${confidence.bgColor} ${confidence.borderColor} border ${sizeConf.textSize} font-medium ${confidence.textColor} ${className}`, children: [showIcon && _jsx(Icon, { size: sizeConf.iconSize }), _jsxs("span", { children: [getLabel(), " Confidence", showPercentage && ` (${score.toFixed(1)}%)`] })] }));
};
// Circular variant - donut chart style
const CircularVariant = ({ score, size = 'sm', showPercentage = true, threshold, className = '' }) => {
    const confidence = getConfidenceLevel(score, threshold);
    const sizeConf = sizeConfig[size];
    const radius = sizeConf.circleSize / 2 - 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (score / 100) * circumference;
    return (_jsxs("div", { className: `inline-flex items-center justify-center relative ${className}`, style: { width: sizeConf.circleSize, height: sizeConf.circleSize }, children: [_jsxs("svg", { width: sizeConf.circleSize, height: sizeConf.circleSize, className: "transform -rotate-90", children: [_jsx("circle", { cx: sizeConf.circleSize / 2, cy: sizeConf.circleSize / 2, r: radius, fill: "none", stroke: "currentColor", strokeWidth: "2", className: "text-neutral-200" }), _jsx("circle", { cx: sizeConf.circleSize / 2, cy: sizeConf.circleSize / 2, r: radius, fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeDasharray: strokeDasharray, strokeDashoffset: strokeDashoffset, className: `transition-all duration-500 ease-out ${confidence.level === 'high' ? 'text-success-500' :
                            confidence.level === 'medium' ? 'text-warning-500' :
                                'text-error-500'}` })] }), showPercentage && (_jsx("span", { className: `absolute inset-0 flex items-center justify-center ${sizeConf.textSize} font-semibold ${confidence.textColor} tabular-nums`, children: score.toFixed(0) }))] }));
};
// Minimal variant - just text with optional icon
const MinimalVariant = ({ score, size = 'sm', showIcon = true, showPercentage = true, threshold, className = '' }) => {
    const confidence = getConfidenceLevel(score, threshold);
    const sizeConf = sizeConfig[size];
    const Icon = confidence.icon;
    return (_jsxs("span", { className: `inline-flex items-center space-x-1 ${sizeConf.textSize} ${confidence.textColor} ${className}`, children: [showIcon && _jsx(Icon, { size: sizeConf.iconSize }), _jsx("span", { className: "font-medium tabular-nums", children: showPercentage ? `${score.toFixed(1)}%` : `${confidence.level} confidence` })] }));
};
// Main ConfidenceIndicator component
export function ConfidenceIndicator({ score, label, variant = 'bar', ...props }) {
    // Clamp score to valid range
    const clampedScore = Math.min(100, Math.max(0, score));
    const commonProps = {
        score: clampedScore,
        ...props
    };
    let IndicatorComponent;
    switch (variant) {
        case 'badge':
            IndicatorComponent = BadgeVariant;
            break;
        case 'circular':
            IndicatorComponent = CircularVariant;
            break;
        case 'minimal':
            IndicatorComponent = MinimalVariant;
            break;
        default:
            IndicatorComponent = BarVariant;
    }
    return (_jsxs("div", { className: "inline-flex items-center space-x-2", children: [_jsx(IndicatorComponent, { ...commonProps }), label && (_jsx("span", { className: `${sizeConfig[props.size || 'sm'].textSize} text-neutral-600`, children: label }))] }));
}
export function ConfidenceComparison({ before, after, size = 'sm', className = '' }) {
    const improvement = after - before;
    const isImproved = improvement > 0;
    const isDeclined = improvement < 0;
    return (_jsxs("div", { className: `inline-flex items-center space-x-3 ${className}`, children: [_jsxs("div", { className: "flex flex-col items-center space-y-1", children: [_jsx("span", { className: `${sizeConfig[size].textSize} text-neutral-500 font-medium`, children: "Before" }), _jsx(ConfidenceIndicator, { score: before, size: size, variant: "minimal", showIcon: false })] }), _jsxs("div", { className: "flex flex-col items-center", children: [isImproved ? (_jsx(TrendingUp, { className: "w-4 h-4 text-success-500" })) : isDeclined ? (_jsx(TrendingDown, { className: "w-4 h-4 text-error-500" })) : (_jsx(Minus, { className: "w-4 h-4 text-neutral-400" })), _jsxs("span", { className: `${sizeConfig[size].textSize} ${isImproved ? 'text-success-600' :
                            isDeclined ? 'text-error-600' :
                                'text-neutral-500'} font-medium tabular-nums`, children: [improvement > 0 ? '+' : '', improvement.toFixed(1), "%"] })] }), _jsxs("div", { className: "flex flex-col items-center space-y-1", children: [_jsx("span", { className: `${sizeConfig[size].textSize} text-neutral-500 font-medium`, children: "After" }), _jsx(ConfidenceIndicator, { score: after, size: size, variant: "minimal", showIcon: false })] })] }));
}
