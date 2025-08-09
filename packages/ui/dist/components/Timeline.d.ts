export interface TimelineEvent {
    id: string;
    type: 'appointment' | 'medication' | 'lab_result' | 'diagnosis' | 'procedure' | 'note' | 'custom';
    title: string;
    description?: string;
    date: Date | string;
    provider?: string;
    location?: string;
    severity?: 'critical' | 'high' | 'medium' | 'low' | 'resolved';
    metadata?: Record<string, any>;
    sourceDocument?: string;
    confidenceScore?: number;
}
export interface TimelineProps {
    events: TimelineEvent[];
    className?: string;
    showFilters?: boolean;
    onEventClick?: (event: TimelineEvent) => void;
    groupByDate?: boolean;
    sortOrder?: 'ascending' | 'descending';
    maxEvents?: number;
}
export declare function Timeline({ events, className, onEventClick, groupByDate, sortOrder, maxEvents }: TimelineProps): import("react/jsx-runtime").JSX.Element;
export interface TimelineFiltersProps {
    eventTypes: TimelineEvent['type'][];
    selectedTypes: TimelineEvent['type'][];
    onTypeChange: (types: TimelineEvent['type'][]) => void;
    dateRange?: {
        start: Date;
        end: Date;
    };
    onDateRangeChange?: (range: {
        start: Date;
        end: Date;
    }) => void;
    className?: string;
}
export declare function TimelineFilters({ eventTypes, selectedTypes, onTypeChange, className }: TimelineFiltersProps): import("react/jsx-runtime").JSX.Element;
export interface CompactTimelineProps {
    events: TimelineEvent[];
    maxEvents?: number;
    onEventClick?: (event: TimelineEvent) => void;
    className?: string;
}
export declare function CompactTimeline({ events, maxEvents, onEventClick, className }: CompactTimelineProps): import("react/jsx-runtime").JSX.Element;
