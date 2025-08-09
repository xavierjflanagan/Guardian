'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Calendar, Clock, User, FileText, Activity, Pill, TestTube } from 'lucide-react';
// Event type configurations
const eventTypeConfig = {
    'appointment': {
        icon: Calendar,
        color: 'text-primary-600 bg-primary-100',
        label: 'Appointment'
    },
    'medication': {
        icon: Pill,
        color: 'text-secondary-600 bg-secondary-100',
        label: 'Medication'
    },
    'lab_result': {
        icon: TestTube,
        color: 'text-warning-600 bg-warning-100',
        label: 'Lab Result'
    },
    'diagnosis': {
        icon: FileText,
        color: 'text-error-600 bg-error-100',
        label: 'Diagnosis'
    },
    'procedure': {
        icon: Activity,
        color: 'text-success-600 bg-success-100',
        label: 'Procedure'
    },
    'note': {
        icon: FileText,
        color: 'text-neutral-600 bg-neutral-100',
        label: 'Clinical Note'
    },
    'custom': {
        icon: Clock,
        color: 'text-neutral-600 bg-neutral-100',
        label: 'Event'
    }
};
// Severity indicator component
const SeverityIndicator = ({ severity }) => {
    if (!severity)
        return null;
    const severityConfig = {
        'critical': 'bg-severity-critical',
        'high': 'bg-severity-high',
        'medium': 'bg-severity-medium',
        'low': 'bg-severity-low',
        'resolved': 'bg-severity-resolved'
    };
    return (_jsx("div", { className: `w-1 h-full absolute left-0 top-0 rounded-l-md ${severityConfig[severity]}` }));
};
// Format date for timeline display
const formatTimelineDate = (date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
        return { date: 'Invalid Date', time: '' };
    }
    return {
        date: dateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }),
        time: dateObj.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })
    };
};
// Group events by date
const groupEventsByDate = (events) => {
    return events.reduce((groups, event) => {
        const dateObj = typeof event.date === 'string' ? new Date(event.date) : event.date;
        const dateKey = dateObj.toDateString();
        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(event);
        return groups;
    }, {});
};
// Individual timeline event component
const TimelineEventItem = ({ event, onClick, isLast = false }) => {
    const config = eventTypeConfig[event.type];
    const Icon = config.icon;
    const { date, time } = formatTimelineDate(event.date);
    return (_jsxs("div", { className: "timeline-item relative", children: [!isLast && _jsx("div", { className: "timeline-line" }), _jsx("div", { className: `timeline-marker ${config.color} flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-sm`, children: _jsx(Icon, { size: 16 }) }), _jsxs("div", { className: `
          medical-card relative ml-4 cursor-pointer hover:shadow-md transition-shadow duration-200
          ${onClick ? 'hover:border-primary-200' : ''}
        `, onClick: () => onClick?.(event), children: [_jsx(SeverityIndicator, { severity: event.severity }), _jsxs("div", { className: event.severity ? 'pl-3' : '', children: [_jsxs("div", { className: "flex items-start justify-between mb-2", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h4", { className: "font-semibold text-neutral-800 text-sm", children: event.title }), _jsxs("div", { className: "flex items-center space-x-2 text-xs text-neutral-500 mt-1", children: [_jsx("span", { className: `px-2 py-1 rounded-full font-medium ${config.color}`, children: config.label }), _jsx("span", { children: date }), time && _jsx("span", { children: time })] })] }), event.confidenceScore && (_jsx("div", { className: "flex-shrink-0 ml-2", children: _jsxs("span", { className: `
                  text-xs px-2 py-1 rounded-full font-medium
                  ${event.confidenceScore >= 90 ? 'text-success-600 bg-success-100' :
                                                event.confidenceScore >= 70 ? 'text-warning-600 bg-warning-100' :
                                                    'text-error-600 bg-error-100'}
                `, children: [event.confidenceScore, "%"] }) }))] }), event.description && (_jsx("p", { className: "text-sm text-neutral-600 leading-relaxed mb-3", children: event.description })), (event.provider || event.location || event.sourceDocument) && (_jsxs("div", { className: "flex flex-wrap items-center gap-4 text-xs text-neutral-500 pt-2 border-t border-neutral-200", children: [event.provider && (_jsxs("div", { className: "flex items-center space-x-1", children: [_jsx(User, { className: "w-3 h-3" }), _jsx("span", { children: event.provider })] })), event.location && (_jsxs("div", { className: "flex items-center space-x-1", children: [_jsx(Calendar, { className: "w-3 h-3" }), _jsx("span", { children: event.location })] })), event.sourceDocument && (_jsxs("div", { className: "flex items-center space-x-1", children: [_jsx(FileText, { className: "w-3 h-3" }), _jsx("span", { className: "truncate max-w-48", children: event.sourceDocument })] }))] }))] })] })] }));
};
// Date header component for grouped timeline
const DateHeader = ({ date }) => {
    return (_jsxs("div", { className: "flex items-center my-6", children: [_jsx("div", { className: "flex-1 border-t border-neutral-200" }), _jsx("div", { className: "px-4 py-2 bg-neutral-50 rounded-full border border-neutral-200", children: _jsx("span", { className: "text-sm font-medium text-neutral-700", children: new Date(date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                    }) }) }), _jsx("div", { className: "flex-1 border-t border-neutral-200" })] }));
};
// Main Timeline component
export function Timeline({ events, className = '', onEventClick, groupByDate = false, sortOrder = 'descending', maxEvents }) {
    // Sort events
    const sortedEvents = [...events].sort((a, b) => {
        const dateA = typeof a.date === 'string' ? new Date(a.date) : a.date;
        const dateB = typeof b.date === 'string' ? new Date(b.date) : b.date;
        return sortOrder === 'ascending'
            ? dateA.getTime() - dateB.getTime()
            : dateB.getTime() - dateA.getTime();
    });
    // Apply max events limit
    const displayEvents = maxEvents ? sortedEvents.slice(0, maxEvents) : sortedEvents;
    if (displayEvents.length === 0) {
        return (_jsx("div", { className: `timeline-container ${className}`, children: _jsxs("div", { className: "text-center py-8", children: [_jsx(Clock, { className: "w-8 h-8 text-neutral-400 mx-auto mb-2" }), _jsx("p", { className: "text-neutral-500", children: "No timeline events available" })] }) }));
    }
    if (groupByDate) {
        const groupedEvents = groupEventsByDate(displayEvents);
        const sortedDates = Object.keys(groupedEvents).sort((a, b) => {
            return sortOrder === 'ascending'
                ? new Date(a).getTime() - new Date(b).getTime()
                : new Date(b).getTime() - new Date(a).getTime();
        });
        return (_jsx("div", { className: `timeline-container space-y-6 ${className}`, children: sortedDates.map((dateKey) => (_jsxs("div", { children: [_jsx(DateHeader, { date: dateKey }), _jsx("div", { className: "space-y-4", children: groupedEvents[dateKey].map((event, index) => (_jsx(TimelineEventItem, { event: event, onClick: onEventClick, isLast: index === groupedEvents[dateKey].length - 1 && dateKey === sortedDates[sortedDates.length - 1] }, event.id))) })] }, dateKey))) }));
    }
    // Ungrouped timeline
    return (_jsx("div", { className: `timeline-container space-y-4 ${className}`, children: displayEvents.map((event, index) => (_jsx(TimelineEventItem, { event: event, onClick: onEventClick, isLast: index === displayEvents.length - 1 }, event.id))) }));
}
export function TimelineFilters({ eventTypes, selectedTypes, onTypeChange, className = '' }) {
    const toggleType = (type) => {
        const newTypes = selectedTypes.includes(type)
            ? selectedTypes.filter(t => t !== type)
            : [...selectedTypes, type];
        onTypeChange(newTypes);
    };
    return (_jsx("div", { className: `flex flex-wrap gap-2 ${className}`, children: eventTypes.map((type) => {
            const config = eventTypeConfig[type];
            const isSelected = selectedTypes.includes(type);
            const Icon = config.icon;
            return (_jsxs("button", { onClick: () => toggleType(type), className: `
              inline-flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium
              transition-colors duration-200
              ${isSelected
                    ? `${config.color} border border-current`
                    : 'text-neutral-600 bg-neutral-100 hover:bg-neutral-200'}
            `, children: [_jsx(Icon, { size: 14 }), _jsx("span", { children: config.label })] }, type));
        }) }));
}
export function CompactTimeline({ events, maxEvents = 5, onEventClick, className = '' }) {
    const recentEvents = events
        .sort((a, b) => {
        const dateA = typeof a.date === 'string' ? new Date(a.date) : a.date;
        const dateB = typeof b.date === 'string' ? new Date(b.date) : b.date;
        return dateB.getTime() - dateA.getTime();
    })
        .slice(0, maxEvents);
    return (_jsxs("div", { className: `space-y-2 ${className}`, children: [recentEvents.map((event) => {
                const config = eventTypeConfig[event.type];
                const Icon = config.icon;
                const { date } = formatTimelineDate(event.date);
                return (_jsxs("div", { onClick: () => onEventClick?.(event), className: `
              flex items-center space-x-3 p-3 rounded-lg border border-neutral-200 bg-white
              ${onEventClick ? 'cursor-pointer hover:shadow-sm hover:border-primary-200' : ''}
              transition-all duration-200
            `, children: [_jsx("div", { className: `flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.color}`, children: _jsx(Icon, { size: 14 }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-neutral-800 truncate", children: event.title }), _jsx("p", { className: "text-xs text-neutral-500", children: date })] }), event.severity && (_jsx("div", { className: `w-2 h-2 rounded-full bg-severity-${event.severity}` }))] }, event.id));
            }), events.length === 0 && (_jsx("div", { className: "text-center py-4 text-sm text-neutral-500", children: "No recent events" }))] }));
}
