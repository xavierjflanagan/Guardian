# Timeline-Narrative Integration

**Status**: Implementation Ready - Aligned with DRAFT-VISION
**Purpose**: Define bi-directional navigation between chronological timeline and semantic narrative views, enabling users to seamlessly switch between complementary perspectives of the same clinical data
**Technical Authority**: Based on [NARRATIVE-ARCHITECTURE-DRAFT-VISION.md](./NARRATIVE-ARCHITECTURE-DRAFT-VISION.md)

## Overview

Timeline and narrative views provide two complementary lenses for the same underlying clinical data. Users can seamlessly switch between chronological accuracy ("what happened when") and clinical coherence ("why this matters") while maintaining complete context preservation.

## Core Architecture

### Dual-Lens Data Foundation
**Shared Clinical Events**: Both views reference the same deduplicated clinical events from Pass 1/2 processing
- Timeline view: Events ordered chronologically by effective dates
- Narrative view: Events grouped by semantic relationships and clinical context
- **No data duplication**: Same clinical events displayed through different organizational lenses

**View Independence**: Each view maintains its own state and can function independently
- Timeline remains fully functional without narratives
- Narratives enhance understanding but don't replace chronological data
- Users can work in either view based on their current task needs

## Navigation Patterns

### Timeline → Narrative Navigation
**Event-to-Narrative Discovery**: Users can click any timeline event to explore its narrative context

```typescript
// Timeline event click handler
interface TimelineEventClick {
  clinical_event_id: UUID;
  event_type: 'medication' | 'condition' | 'procedure' | 'observation';
  effective_date: Date;
}

// Find narratives containing this event
async function findNarrativesForEvent(eventId: UUID) {
  const narratives = await supabase
    .from('clinical_narratives')
    .select(`
      id, title, summary, narrative_type,
      narrative_medication_links(medication_id),
      narrative_condition_links(condition_id),
      narrative_procedure_links(procedure_id),
      narrative_event_links(clinical_event_id)
    `)
    .or(`
      narrative_medication_links.medication_id.eq.${eventId},
      narrative_condition_links.condition_id.eq.${eventId},
      narrative_procedure_links.procedure_id.eq.${eventId},
      narrative_event_links.clinical_event_id.eq.${eventId}
    `)
    .eq('is_current', true);

  return narratives;
}
```

**Narrative Context Panel**: Timeline events show narrative badges indicating story membership
- Multiple narratives per event supported (many-to-many relationships)
- Narrative type indicators (condition, medication, event, etc.)
- Parent narrative breadcrumbs for hierarchical context

### Narrative → Timeline Navigation
**Narrative Timeline View**: Each narrative provides chronological view of its linked events

```typescript
// Get timeline events for a narrative
async function getNarrativeTimeline(narrativeId: UUID) {
  const timelineEvents = await supabase.rpc('get_narrative_timeline', {
    p_narrative_id: narrativeId
  });

  return timelineEvents.sort((a, b) =>
    new Date(a.effective_date) - new Date(b.effective_date)
  );
}
```

**"View Timeline" Feature**: Button within narrative view jumps to filtered timeline
- Shows only events linked to current narrative
- Maintains narrative context highlighting
- Provides "Show All Events" option to expand view

## UI Integration Patterns

### Timeline View Enhancements
**Narrative Badges**: Timeline events display narrative membership
```typescript
interface TimelineEventDisplay {
  event: ClinicalEvent;
  narratives: {
    id: UUID;
    title: string;
    type: 'condition' | 'medication' | 'event' | 'procedure';
    color: string; // UI theme color for narrative type
  }[];
  primary_narrative?: UUID; // Most relevant narrative for this event
}
```

**Narrative Filtering**: Timeline can be filtered by narrative relationships
- Filter by specific narrative (e.g., "Show only Heart Failure events")
- Filter by narrative type (e.g., "Show only medication events")
- Filter by relationship hierarchy (e.g., "Show events from this narrative and children")

**Timeline Context Preservation**: Filtered timeline maintains full context
```sql
-- Timeline filtering by narrative
SELECT DISTINCT ce.*
FROM clinical_events ce
JOIN (
  SELECT medication_id as event_id FROM narrative_medication_links WHERE narrative_id = ?
  UNION
  SELECT condition_id as event_id FROM narrative_condition_links WHERE narrative_id = ?
  UNION
  SELECT procedure_id as event_id FROM narrative_procedure_links WHERE narrative_id = ?
  UNION
  SELECT clinical_event_id as event_id FROM narrative_event_links WHERE narrative_id = ?
) narrative_events ON ce.id = narrative_events.event_id
WHERE ce.patient_id = ?
ORDER BY ce.effective_date;
```

### Narrative View Enhancements
**Timeline Integration Tab**: Each narrative includes chronological event sequence
```typescript
interface NarrativeTimelineTab {
  narrative_id: UUID;
  timeline_events: {
    event: ClinicalEvent;
    effective_date: Date;
    source_document: string;
    event_summary: string;
  }[];
  date_range: {
    start: Date; // narrative_start_date
    end?: Date;  // narrative_end_date (null if ongoing)
  };
}
```

**Jump-to-Timeline Links**: Events within narrative content link to full timeline
- Click event mention in narrative → jump to that event in timeline view
- Maintain narrative highlighting in timeline context
- Breadcrumb navigation back to narrative

**Related Narrative Navigation**: Cross-links between connected narratives
- Parent narrative breadcrumbs (e.g., "Heart Failure Management" → "Lisinopril Therapy")
- Child narrative previews (e.g., "Medication Changes" within "Hospital Admission")
- Sibling narrative suggestions (e.g., other medications within same condition)

## Performance Optimization

### Query Patterns
**Efficient Event-Narrative Lookup**: Optimized queries for navigation
```sql
-- Index for fast event-to-narrative lookup
CREATE INDEX idx_narrative_links_events ON (
  SELECT narrative_id, 'medication' as link_type, medication_id as event_id FROM narrative_medication_links
  UNION ALL
  SELECT narrative_id, 'condition' as link_type, condition_id as event_id FROM narrative_condition_links
  UNION ALL
  SELECT narrative_id, 'procedure' as link_type, procedure_id as event_id FROM narrative_procedure_links
  UNION ALL
  SELECT narrative_id, 'event' as link_type, clinical_event_id as event_id FROM narrative_event_links
);
```

### Caching Strategy
**View State Caching**: Preserve user navigation context
```typescript
interface ViewState {
  current_view: 'timeline' | 'narrative';
  timeline_filters?: {
    narrative_ids?: UUID[];
    date_range?: { start: Date; end: Date };
    event_types?: string[];
  };
  narrative_context?: {
    current_narrative_id: UUID;
    parent_breadcrumbs: UUID[];
    expanded_children?: UUID[];
  };
}
```

**Preload Related Data**: Anticipate user navigation
- Preload narrative summaries when viewing timeline
- Preload timeline events when viewing narratives
- Cache common navigation patterns per user

## Data Relationship Queries

### Timeline-Narrative Cross-References
**Narrative Event Count**: Show event counts in narrative summaries
```sql
-- Count events per narrative for dashboard display
SELECT n.id, n.title,
       COUNT(DISTINCT nel.medication_id) +
       COUNT(DISTINCT ncl.condition_id) +
       COUNT(DISTINCT npl.procedure_id) +
       COUNT(DISTINCT nevl.clinical_event_id) as event_count
FROM clinical_narratives n
LEFT JOIN narrative_medication_links nel ON n.id = nel.narrative_id
LEFT JOIN narrative_condition_links ncl ON n.id = ncl.narrative_id
LEFT JOIN narrative_procedure_links npl ON n.id = npl.narrative_id
LEFT JOIN narrative_event_links nevl ON n.id = nevl.narrative_id
WHERE n.patient_id = ? AND n.is_current = true
GROUP BY n.id, n.title;
```

**Timeline Event Narrative Context**: Show narrative context in timeline
```sql
-- Get narrative context for timeline events
SELECT ce.*,
       COALESCE(
         STRING_AGG(DISTINCT n.title, ', '),
         'No narrative assigned'
       ) as narrative_context
FROM clinical_events ce
LEFT JOIN (
  SELECT nel.medication_id as event_id, n.title FROM narrative_medication_links nel
  JOIN clinical_narratives n ON nel.narrative_id = n.id WHERE n.is_current = true
  UNION
  SELECT ncl.condition_id as event_id, n.title FROM narrative_condition_links ncl
  JOIN clinical_narratives n ON ncl.narrative_id = n.id WHERE n.is_current = true
  -- ... other link types
) narrative_links ON ce.id = narrative_links.event_id
WHERE ce.patient_id = ?
GROUP BY ce.id
ORDER BY ce.effective_date;
```

## User Experience Workflows

### Primary Navigation Flows

#### Timeline-First Workflow
1. User opens timeline view (default landing)
2. Reviews chronological sequence of events
3. Clicks interesting event → sees narrative context panel
4. Clicks "View Full Narrative" → switches to narrative view with context preserved
5. Explores related narratives through parent/child/sibling links
6. Clicks "View Timeline" → returns to filtered timeline showing only narrative events

#### Narrative-First Workflow
1. User opens narrative dashboard
2. Browses narrative summaries and relationships
3. Clicks narrative of interest → opens full narrative view
4. Reviews clinical story and linked events
5. Clicks "View Timeline" → switches to timeline with narrative highlighting
6. Explores other events in timeline context
7. Clicks other narrative badges → switches narrative context

### Context Switching Features
**Breadcrumb Navigation**: Maintain navigation history
```typescript
interface NavigationBreadcrumb {
  view_type: 'timeline' | 'narrative';
  context: {
    timeline?: { filters: TimelineFilters; scroll_position: number };
    narrative?: { narrative_id: UUID; parent_context: UUID[] };
  };
  timestamp: Date;
}
```

**Quick Switch**: Toggle between views while preserving context
- Timeline view → "Switch to Narrative" (shows narratives for current date range)
- Narrative view → "Switch to Timeline" (shows timeline filtered to current narrative)

## Mobile Responsiveness

### View Adaptation
**Timeline Mobile**: Optimized for small screens
- Compressed event cards with expandable details
- Narrative badges as dots with tap-to-expand
- Swipe navigation between events

**Narrative Mobile**: Touch-friendly narrative navigation
- Collapsible narrative sections
- Timeline events as horizontal scroll
- Quick navigation buttons for parent/child relationships

### Performance Considerations
**Mobile Query Optimization**: Reduce data transfer
- Lazy load narrative content
- Paginated timeline events
- Compressed JSON for narrative summaries

## Clinical Context Preservation

### Medical Accuracy
**Consistent Clinical Data**: Both views show identical clinical information
- Same effective dates and clinical values
- Same provider and facility attribution
- Same document provenance and confidence scores

**Context Warnings**: Alert users to potential context loss
- Warning when viewing filtered timeline ("Some events hidden")
- Context indicators when switching between narratives
- Breadcrumb trails to maintain orientation

### Audit Trail Integration
**Navigation Logging**: Track user view switching for analytics
```typescript
interface ViewSwitchEvent {
  user_id: UUID;
  from_view: 'timeline' | 'narrative';
  to_view: 'timeline' | 'narrative';
  context: {
    from_context?: any;
    to_context?: any;
  };
  timestamp: Date;
}
```

**Clinical Decision Support**: Use navigation patterns to improve care
- Identify frequently accessed narrative combinations
- Suggest related narratives based on viewing patterns
- Alert to potential clinical gaps in narrative coverage

## API Integration Points

### View State Management
```typescript
// API endpoints for view switching
POST /api/views/switch
{
  from_view: 'timeline',
  to_view: 'narrative',
  context: {
    timeline_position: { date: '2025-09-15', event_id: 'uuid' },
    narrative_target: { narrative_id: 'uuid' }
  }
}

// Response includes optimized data for target view
{
  narrative_data: { /* narrative content */ },
  related_narratives: [ /* parent/child/sibling summaries */ ],
  timeline_events: [ /* events for this narrative */ ]
}
```

### Real-Time Synchronization
**Live Updates**: Changes in one view reflected in other
- New narrative created → timeline events get narrative badges
- Timeline event updated → narrative content automatically refreshed
- Narrative relationships changed → timeline filtering options updated

## Implementation Guidelines

### Integration Checklist
1. ✅ Implement event-to-narrative lookup queries
2. ✅ Create narrative-to-timeline filtering system
3. ✅ Build navigation state preservation
4. ✅ Add view switching UI components
5. ✅ Implement mobile-responsive adaptations
6. ✅ Create performance monitoring for view switches
7. ✅ Test clinical context preservation across views
8. ✅ Validate audit trail logging

### Performance Targets
- **View Switch Time**: <200ms for navigation between timeline and narrative
- **Event Lookup**: <50ms to find narratives containing a specific event
- **Timeline Filtering**: <100ms to filter timeline by narrative
- **Mobile Responsiveness**: <300ms for mobile view adaptations

### Clinical Safety Requirements
- Identical clinical data across both views
- Clear context indicators when viewing filtered data
- Preserved document provenance in both timeline and narrative
- Complete audit trail for all navigation actions

This integration system enables users to fluidly move between factual chronological understanding and meaningful clinical context, providing comprehensive insight into their healthcare journey while maintaining the clinical safety and accuracy required for healthcare applications.