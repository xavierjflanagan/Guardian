'use client';

import React from 'react';
import { Calendar, Clock, User, FileText, Activity, Pill, TestTube } from 'lucide-react';

// Healthcare timeline types
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
} as const;

// Severity indicator component
const SeverityIndicator: React.FC<{ severity?: TimelineEvent['severity'] }> = ({ severity }) => {
  if (!severity) return null;
  
  const severityConfig = {
    'critical': 'bg-severity-critical',
    'high': 'bg-severity-high',
    'medium': 'bg-severity-medium',
    'low': 'bg-severity-low',
    'resolved': 'bg-severity-resolved'
  };
  
  return (
    <div className={`w-1 h-full absolute left-0 top-0 rounded-l-md ${severityConfig[severity]}`} />
  );
};

// Format date for timeline display
const formatTimelineDate = (date: Date | string): { date: string; time: string } => {
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
const groupEventsByDate = (events: TimelineEvent[]): Record<string, TimelineEvent[]> => {
  return events.reduce((groups, event) => {
    const dateObj = typeof event.date === 'string' ? new Date(event.date) : event.date;
    const dateKey = dateObj.toDateString();
    
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(event);
    
    return groups;
  }, {} as Record<string, TimelineEvent[]>);
};

// Individual timeline event component
const TimelineEventItem: React.FC<{ 
  event: TimelineEvent; 
  onClick?: (event: TimelineEvent) => void;
  isLast?: boolean;
}> = ({ event, onClick, isLast = false }) => {
  const config = eventTypeConfig[event.type];
  const Icon = config.icon;
  const { date, time } = formatTimelineDate(event.date);
  
  return (
    <div className="timeline-item relative">
      {/* Timeline line */}
      {!isLast && <div className="timeline-line" />}
      
      {/* Event marker */}
      <div className={`timeline-marker ${config.color} flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-sm`}>
        <Icon size={16} />
      </div>
      
      {/* Event content */}
      <div 
        className={`
          medical-card relative ml-4 cursor-pointer hover:shadow-md transition-shadow duration-200
          ${onClick ? 'hover:border-primary-200' : ''}
        `}
        onClick={() => onClick?.(event)}
      >
        {/* Severity indicator */}
        <SeverityIndicator severity={event.severity} />
        
        {/* Content with padding to account for severity indicator */}
        <div className={event.severity ? 'pl-3' : ''}>
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-neutral-800 text-sm">
                {event.title}
              </h4>
              <div className="flex items-center space-x-2 text-xs text-neutral-500 mt-1">
                <span className={`px-2 py-1 rounded-full font-medium ${config.color}`}>
                  {config.label}
                </span>
                <span>{date}</span>
                {time && <span>{time}</span>}
              </div>
            </div>
            
            {event.confidenceScore && (
              <div className="flex-shrink-0 ml-2">
                <span className={`
                  text-xs px-2 py-1 rounded-full font-medium
                  ${event.confidenceScore >= 90 ? 'text-success-600 bg-success-100' :
                    event.confidenceScore >= 70 ? 'text-warning-600 bg-warning-100' :
                    'text-error-600 bg-error-100'}
                `}>
                  {event.confidenceScore}%
                </span>
              </div>
            )}
          </div>
          
          {/* Description */}
          {event.description && (
            <p className="text-sm text-neutral-600 leading-relaxed mb-3">
              {event.description}
            </p>
          )}
          
          {/* Metadata */}
          {(event.provider || event.location || event.sourceDocument) && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 pt-2 border-t border-neutral-200">
              {event.provider && (
                <div className="flex items-center space-x-1">
                  <User className="w-3 h-3" />
                  <span>{event.provider}</span>
                </div>
              )}
              
              {event.location && (
                <div className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>{event.location}</span>
                </div>
              )}
              
              {event.sourceDocument && (
                <div className="flex items-center space-x-1">
                  <FileText className="w-3 h-3" />
                  <span className="truncate max-w-48">{event.sourceDocument}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Date header component for grouped timeline
const DateHeader: React.FC<{ date: string }> = ({ date }) => {
  return (
    <div className="flex items-center my-6">
      <div className="flex-1 border-t border-neutral-200" />
      <div className="px-4 py-2 bg-neutral-50 rounded-full border border-neutral-200">
        <span className="text-sm font-medium text-neutral-700">
          {new Date(date).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          })}
        </span>
      </div>
      <div className="flex-1 border-t border-neutral-200" />
    </div>
  );
};

// Main Timeline component
export function Timeline({
  events,
  className = '',
  onEventClick,
  groupByDate = false,
  sortOrder = 'descending',
  maxEvents
}: TimelineProps) {
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
    return (
      <div className={`timeline-container ${className}`}>
        <div className="text-center py-8">
          <Clock className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
          <p className="text-neutral-500">No timeline events available</p>
        </div>
      </div>
    );
  }
  
  if (groupByDate) {
    const groupedEvents = groupEventsByDate(displayEvents);
    const sortedDates = Object.keys(groupedEvents).sort((a, b) => {
      return sortOrder === 'ascending' 
        ? new Date(a).getTime() - new Date(b).getTime()
        : new Date(b).getTime() - new Date(a).getTime();
    });
    
    return (
      <div className={`timeline-container space-y-6 ${className}`}>
        {sortedDates.map((dateKey) => (
          <div key={dateKey}>
            <DateHeader date={dateKey} />
            <div className="space-y-4">
              {groupedEvents[dateKey].map((event, index) => (
                <TimelineEventItem
                  key={event.id}
                  event={event}
                  onClick={onEventClick}
                  isLast={index === groupedEvents[dateKey].length - 1 && dateKey === sortedDates[sortedDates.length - 1]}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  // Ungrouped timeline
  return (
    <div className={`timeline-container space-y-4 ${className}`}>
      {displayEvents.map((event, index) => (
        <TimelineEventItem
          key={event.id}
          event={event}
          onClick={onEventClick}
          isLast={index === displayEvents.length - 1}
        />
      ))}
    </div>
  );
}

// Timeline filter component
export interface TimelineFiltersProps {
  eventTypes: TimelineEvent['type'][];
  selectedTypes: TimelineEvent['type'][];
  onTypeChange: (types: TimelineEvent['type'][]) => void;
  dateRange?: { start: Date; end: Date };
  onDateRangeChange?: (range: { start: Date; end: Date }) => void;
  className?: string;
}

export function TimelineFilters({
  eventTypes,
  selectedTypes,
  onTypeChange,
  className = ''
}: TimelineFiltersProps) {
  const toggleType = (type: TimelineEvent['type']) => {
    const newTypes = selectedTypes.includes(type)
      ? selectedTypes.filter(t => t !== type)
      : [...selectedTypes, type];
    onTypeChange(newTypes);
  };
  
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {eventTypes.map((type) => {
        const config = eventTypeConfig[type];
        const isSelected = selectedTypes.includes(type);
        const Icon = config.icon;
        
        return (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className={`
              inline-flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium
              transition-colors duration-200
              ${isSelected 
                ? `${config.color} border border-current` 
                : 'text-neutral-600 bg-neutral-100 hover:bg-neutral-200'
              }
            `}
          >
            <Icon size={14} />
            <span>{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Compact timeline variant for dashboards
export interface CompactTimelineProps {
  events: TimelineEvent[];
  maxEvents?: number;
  onEventClick?: (event: TimelineEvent) => void;
  className?: string;
}

export function CompactTimeline({ 
  events, 
  maxEvents = 5, 
  onEventClick,
  className = '' 
}: CompactTimelineProps) {
  const recentEvents = events
    .sort((a, b) => {
      const dateA = typeof a.date === 'string' ? new Date(a.date) : a.date;
      const dateB = typeof b.date === 'string' ? new Date(b.date) : b.date;
      return dateB.getTime() - dateA.getTime();
    })
    .slice(0, maxEvents);
  
  return (
    <div className={`space-y-2 ${className}`}>
      {recentEvents.map((event) => {
        const config = eventTypeConfig[event.type];
        const Icon = config.icon;
        const { date } = formatTimelineDate(event.date);
        
        return (
          <div
            key={event.id}
            onClick={() => onEventClick?.(event)}
            className={`
              flex items-center space-x-3 p-3 rounded-lg border border-neutral-200 bg-white
              ${onEventClick ? 'cursor-pointer hover:shadow-sm hover:border-primary-200' : ''}
              transition-all duration-200
            `}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${config.color}`}>
              <Icon size={14} />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800 truncate">
                {event.title}
              </p>
              <p className="text-xs text-neutral-500">
                {date}
              </p>
            </div>
            
            {event.severity && (
              <div className={`w-2 h-2 rounded-full bg-severity-${event.severity}`} />
            )}
          </div>
        );
      })}
      
      {events.length === 0 && (
        <div className="text-center py-4 text-sm text-neutral-500">
          No recent events
        </div>
      )}
    </div>
  );
}

// Types are already exported above with interfaces