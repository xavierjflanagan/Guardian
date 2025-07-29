# Guardian v7 Healthcare Journey & Timeline System

**Status:** Core Architecture Complete  
**Date:** 2025-07-29  
**Purpose:** Comprehensive healthcare journey logging and patient timeline dashboard system
**Dependencies:** [Core Schema](./core-schema.md), [User Experience](./user-experience.md)

---

## Overview

The Healthcare Journey system provides patients with a comprehensive, chronological view of their healthcare data through an intelligent timeline interface. Built on the unified clinical events architecture and O3's two-axis classification model, it transforms complex medical data into an intuitive, filterable healthcare story.

**Key Features:**
- 🕒 **Intelligent Timeline** - Chronological healthcare journey with smart event consolidation
- 🔍 **Multi-Level Filtering** - Hierarchical categorization for precise data exploration
- 🏥 **Encounter-Centric Views** - Complete healthcare visit context and related events
- 🩺 **Condition Journey Tracking** - Condition-specific healthcare progression views
- 💊 **Medication Lifecycle** - Complete medication journey from start to current status
- 🤖 **AI Chatbot Integration** - Natural language queries over healthcare timeline data
- 📱 **Mobile-Optimized** - Responsive timeline design for all device types

---

## 1. Healthcare Timeline Events Architecture

### 1.1. Core Timeline Events Table

```sql
CREATE TABLE healthcare_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Hierarchical categorization for multi-level filtering
    display_category TEXT NOT NULL, -- 'visit', 'test_result', 'treatment', 'vaccination', 'screening', 'diagnosis', 'appointment'
    display_subcategory TEXT, -- 'annual_physical', 'blood_test', 'minor_procedure', 'emergency_visit'
    display_tertiary TEXT, -- 'blood_pressure', 'glucose_test', 'wart_removal', 'chest_xray'
    
    -- Display Optimization for Timeline UI
    title TEXT NOT NULL, -- "Annual Physical Exam", "Blood Pressure Check", "HIV Test Result"
    summary TEXT, -- Brief description for timeline: "Routine check-up with Dr. Johnson"
    icon TEXT, -- UI icon identifier: 'hospital', 'syringe', 'stethoscope', 'clipboard'
    color_code TEXT DEFAULT '#2563eb', -- Hex color for timeline visualization
    
    -- Event Timing
    event_date TIMESTAMPTZ NOT NULL,
    event_duration_minutes INTEGER, -- For encounters with known duration
    
    -- Source Links (Comprehensive Provenance)
    encounter_id UUID REFERENCES healthcare_encounters(id), -- Healthcare visit context
    clinical_event_ids UUID[] DEFAULT '{}', -- Multiple related clinical events
    condition_id UUID REFERENCES patient_conditions(id), -- Related condition
    document_id UUID REFERENCES documents(id), -- Source document
    
    -- Timeline Optimization
    is_major_event BOOLEAN DEFAULT FALSE, -- Show in compact timeline view
    display_priority INTEGER DEFAULT 100, -- Lower = higher priority (1-1000)
    consolidation_group TEXT, -- Group related events: 'comprehensive_physical_2024_07_20'
    
    -- AI Chatbot Query Optimization
    searchable_content TEXT, -- Processed text for natural language queries
    event_tags TEXT[] DEFAULT '{}', -- Tags for enhanced searching: ['routine', 'preventive', 'abnormal']
    
    -- Quality and Review
    requires_attention BOOLEAN DEFAULT FALSE, -- Flags requiring patient attention
    attention_reason TEXT, -- Why this event needs attention
    
    -- Audit
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timeline query optimization indexes
CREATE INDEX idx_timeline_events_patient_date ON healthcare_timeline_events(patient_id, event_date DESC) WHERE archived IS NOT TRUE;
CREATE INDEX idx_timeline_events_category ON healthcare_timeline_events(display_category) WHERE archived IS NOT TRUE;
CREATE INDEX idx_timeline_events_major ON healthcare_timeline_events(patient_id, is_major_event, event_date DESC) WHERE is_major_event = TRUE AND archived IS NOT TRUE;
CREATE INDEX idx_timeline_events_priority ON healthcare_timeline_events(patient_id, display_priority ASC, event_date DESC) WHERE archived IS NOT TRUE;
CREATE INDEX idx_timeline_events_tags ON healthcare_timeline_events USING GIN(event_tags) WHERE archived IS NOT TRUE;
CREATE INDEX idx_timeline_events_search ON healthcare_timeline_events USING GIN(to_tsvector('english', searchable_content)) WHERE archived IS NOT TRUE;
CREATE INDEX idx_timeline_events_consolidation ON healthcare_timeline_events(consolidation_group) WHERE consolidation_group IS NOT NULL AND archived IS NOT TRUE;
```

### 1.2. Timeline Event Generation Logic

*Automated system for creating timeline events from clinical data changes*

```sql
-- Smart timeline event creation from clinical events
CREATE OR REPLACE FUNCTION generate_timeline_event_from_clinical_event()
RETURNS TRIGGER AS $$
DECLARE
    timeline_title TEXT;
    timeline_summary TEXT;
    timeline_category TEXT;
    timeline_subcategory TEXT;
    timeline_tertiary TEXT;
    timeline_icon TEXT;
    is_major BOOLEAN DEFAULT FALSE;
    priority_score INTEGER DEFAULT 100;
    event_tags TEXT[] DEFAULT '{}';
BEGIN
    -- Determine timeline representation based on clinical event classification
    IF NEW.activity_type = 'observation' THEN
        -- Observation events (tests, measurements, assessments)
        CASE 
            WHEN 'screening' = ANY(NEW.clinical_purposes) THEN
                timeline_category := 'screening';
                timeline_subcategory := NEW.method; -- 'laboratory', 'physical_exam', 'assessment_tool'
                timeline_icon := 'clipboard-check';
                priority_score := 80;
                event_tags := event_tags || 'preventive';
            WHEN 'diagnostic' = ANY(NEW.clinical_purposes) THEN
                timeline_category := 'test_result';
                timeline_subcategory := NEW.method;
                timeline_icon := 'flask';
                priority_score := 60;
                event_tags := event_tags || 'diagnostic';
            WHEN 'monitoring' = ANY(NEW.clinical_purposes) THEN
                timeline_category := 'test_result';
                timeline_subcategory := 'monitoring';
                timeline_icon := 'chart-line';
                priority_score := 70;
                event_tags := event_tags || 'monitoring';
        END CASE;
        
        -- Set title based on event name
        timeline_title := NEW.event_name || ' Result';
        
    ELSIF NEW.activity_type = 'intervention' THEN
        -- Intervention events (treatments, procedures, medications)
        CASE 
            WHEN 'therapeutic' = ANY(NEW.clinical_purposes) THEN
                timeline_category := 'treatment';
                timeline_subcategory := NEW.method; -- 'surgery', 'injection', 'therapy'
                timeline_icon := 'medical-bag';
                priority_score := 40;
                is_major := TRUE;
                event_tags := event_tags || 'treatment';
            WHEN 'preventive' = ANY(NEW.clinical_purposes) THEN
                timeline_category := 'vaccination';
                timeline_subcategory := 'preventive_care';
                timeline_icon := 'syringe';
                priority_score := 90;
                event_tags := event_tags || 'preventive';
        END CASE;
        
        -- Set title based on intervention type
        timeline_title := NEW.event_name;
    END IF;
    
    -- Generate summary from available context
    timeline_summary := COALESCE(
        NEW.event_name || COALESCE(' performed by ' || NEW.performed_by, ''),
        'Clinical event on ' || DATE(NEW.event_date)
    );
    
    -- Set tertiary category based on body site or specific details
    timeline_tertiary := COALESCE(NEW.body_site, NEW.method);
    
    -- Create searchable content for AI chatbot
    searchable_content := NEW.event_name || ' ' || 
                         COALESCE(NEW.performed_by, '') || ' ' ||
                         COALESCE(NEW.body_site, '') || ' ' ||
                         array_to_string(NEW.clinical_purposes, ' ') || ' ' ||
                         NEW.activity_type;
    
    -- Insert timeline event
    INSERT INTO healthcare_timeline_events (
        patient_id, display_category, display_subcategory, display_tertiary,
        title, summary, icon, event_date, encounter_id, clinical_event_ids,
        is_major_event, display_priority, searchable_content, event_tags
    ) VALUES (
        NEW.patient_id, timeline_category, timeline_subcategory, timeline_tertiary,
        timeline_title, timeline_summary, timeline_icon, NEW.event_date, 
        NEW.encounter_id, ARRAY[NEW.id], is_major, priority_score, 
        searchable_content, event_tags
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate timeline events
CREATE TRIGGER generate_timeline_from_clinical_events
    AFTER INSERT ON patient_clinical_events
    FOR EACH ROW EXECUTE FUNCTION generate_timeline_event_from_clinical_event();
```

---

## 2. Multi-Level Filtering System

*Hierarchical categorization enabling precise healthcare data exploration*

### 2.1. Category Hierarchy Structure

**Primary Categories (Top-Level Filtering):**
- `visit` - Healthcare encounters and appointments
- `test_result` - Laboratory tests, diagnostic results, measurements
- `treatment` - Therapeutic interventions and procedures
- `vaccination` - Immunizations and preventive injections
- `screening` - Preventive health screenings and assessments
- `diagnosis` - New conditions and health issue identification

**Secondary Categories (Sub-Filtering):**
- **Visit Types:** `annual_physical`, `specialist_consult`, `emergency_visit`, `telehealth`, `follow_up`
- **Test Types:** `blood_test`, `imaging`, `vital_signs`, `cognitive_assessment`
- **Treatment Types:** `minor_procedure`, `medication_change`, `therapy_session`, `surgery`
- **Screening Types:** `cancer_screening`, `mental_health`, `cardiovascular`, `preventive_care`

**Tertiary Categories (Specific Filtering):**
- **Specific Tests:** `glucose`, `blood_pressure`, `cholesterol`, `hiv_test`
- **Body Systems:** `cardiovascular`, `respiratory`, `dermatology`, `neurological`
- **Procedure Types:** `cryotherapy`, `biopsy`, `vaccination`, `wound_care`

### 2.2. Dynamic Filtering Queries

```sql
-- Primary category filtering
CREATE OR REPLACE VIEW timeline_category_filters AS
SELECT 
    patient_id,
    display_category,
    COUNT(*) as event_count,
    MIN(event_date) as earliest_event,
    MAX(event_date) as latest_event,
    COUNT(*) FILTER (WHERE is_major_event = TRUE) as major_event_count
FROM healthcare_timeline_events 
WHERE archived IS NOT TRUE
GROUP BY patient_id, display_category;

-- Multi-level filtering function
CREATE OR REPLACE FUNCTION filter_patient_timeline(
    p_patient_id UUID,
    p_primary_categories TEXT[] DEFAULT NULL,
    p_secondary_categories TEXT[] DEFAULT NULL,
    p_tertiary_categories TEXT[] DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL,
    p_major_events_only BOOLEAN DEFAULT FALSE,
    p_search_query TEXT DEFAULT NULL
) RETURNS TABLE (
    event_id UUID,
    title TEXT,
    summary TEXT,
    event_date TIMESTAMPTZ,
    display_category TEXT,
    display_subcategory TEXT,
    display_tertiary TEXT,
    icon TEXT,
    is_major_event BOOLEAN,
    encounter_id UUID,
    clinical_event_ids UUID[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hte.id,
        hte.title,
        hte.summary,
        hte.event_date,
        hte.display_category,
        hte.display_subcategory,
        hte.display_tertiary,
        hte.icon,
        hte.is_major_event,
        hte.encounter_id,
        hte.clinical_event_ids
    FROM healthcare_timeline_events hte
    WHERE hte.patient_id = p_patient_id
    AND hte.archived IS NOT TRUE
    -- Primary category filter
    AND (p_primary_categories IS NULL OR hte.display_category = ANY(p_primary_categories))
    -- Secondary category filter
    AND (p_secondary_categories IS NULL OR hte.display_subcategory = ANY(p_secondary_categories))
    -- Tertiary category filter
    AND (p_tertiary_categories IS NULL OR hte.display_tertiary = ANY(p_tertiary_categories))
    -- Date range filter
    AND (p_date_from IS NULL OR hte.event_date >= p_date_from)
    AND (p_date_to IS NULL OR hte.event_date <= p_date_to)
    -- Major events filter
    AND (p_major_events_only = FALSE OR hte.is_major_event = TRUE)
    -- Text search filter
    AND (p_search_query IS NULL OR hte.searchable_content ILIKE '%' || p_search_query || '%')
    ORDER BY hte.event_date DESC, hte.display_priority ASC;
END;
$$ LANGUAGE plpgsql;
```

---

## 3. Condition-Specific Healthcare Journeys

*Complete healthcare journey views for individual conditions, medications, and health concerns*

### 3.1. Condition Journey View

```sql
-- Complete condition journey including discovery, progression, treatments, and monitoring
CREATE OR REPLACE VIEW condition_healthcare_journey AS
SELECT 
    pc.id as condition_id,
    pc.patient_id,
    pc.condition_name,
    pc.status as condition_status,
    pc.diagnosis_date,
    
    -- Discovery context
    discovery_encounter.encounter_date as discovery_encounter_date,
    discovery_encounter.provider_name as diagnosing_provider,
    discovery_encounter.facility_name as diagnosis_facility,
    
    -- Related timeline events
    COALESCE(
        ARRAY_AGG(
            DISTINCT hte.id ORDER BY hte.event_date DESC
        ) FILTER (WHERE hte.id IS NOT NULL), 
        '{}'
    ) as related_timeline_events,
    
    -- Treatment events
    COALESCE(
        ARRAY_AGG(
            DISTINCT treatment_events.id ORDER BY treatment_events.event_date DESC
        ) FILTER (WHERE treatment_events.id IS NOT NULL AND treatment_events.display_category = 'treatment'), 
        '{}'
    ) as treatment_events,
    
    -- Monitoring events  
    COALESCE(
        ARRAY_AGG(
            DISTINCT monitoring_events.id ORDER BY monitoring_events.event_date DESC
        ) FILTER (WHERE monitoring_events.id IS NOT NULL AND 'monitoring' = ANY(monitoring_events.event_tags)), 
        '{}'
    ) as monitoring_events,
    
    -- Progression timeline
    COUNT(DISTINCT hte.id) as total_related_events,
    MIN(hte.event_date) as first_related_event,
    MAX(hte.event_date) as most_recent_event
    
FROM patient_conditions pc
LEFT JOIN healthcare_encounters discovery_encounter ON discovery_encounter.id = pc.encounter_id
LEFT JOIN healthcare_timeline_events hte ON hte.condition_id = pc.id AND hte.archived IS NOT TRUE
LEFT JOIN healthcare_timeline_events treatment_events ON treatment_events.condition_id = pc.id 
    AND treatment_events.display_category = 'treatment' AND treatment_events.archived IS NOT TRUE
LEFT JOIN healthcare_timeline_events monitoring_events ON monitoring_events.condition_id = pc.id 
    AND 'monitoring' = ANY(monitoring_events.event_tags) AND monitoring_events.archived IS NOT TRUE
WHERE pc.archived IS NOT TRUE
GROUP BY pc.id, pc.patient_id, pc.condition_name, pc.status, pc.diagnosis_date,
         discovery_encounter.encounter_date, discovery_encounter.provider_name, discovery_encounter.facility_name;

-- Function to get complete condition journey
CREATE OR REPLACE FUNCTION get_condition_journey(
    p_patient_id UUID,
    p_condition_id UUID
) RETURNS TABLE (
    journey_section TEXT,
    section_order INTEGER,
    events JSONB
) AS $$
BEGIN
    RETURN QUERY
    -- Discovery/Diagnosis events
    SELECT 
        'diagnosis'::TEXT,
        1::INTEGER,
        jsonb_agg(
            jsonb_build_object(
                'event_id', hte.id,
                'title', hte.title,
                'summary', hte.summary,
                'date', hte.event_date,
                'provider', he.provider_name,
                'facility', he.facility_name
            ) ORDER BY hte.event_date
        )
    FROM healthcare_timeline_events hte
    LEFT JOIN healthcare_encounters he ON he.id = hte.encounter_id
    WHERE hte.patient_id = p_patient_id 
    AND hte.condition_id = p_condition_id
    AND hte.display_category = 'diagnosis'
    AND hte.archived IS NOT TRUE
    
    UNION ALL
    
    -- Treatment events
    SELECT 
        'treatments'::TEXT,
        2::INTEGER,
        jsonb_agg(
            jsonb_build_object(
                'event_id', hte.id,
                'title', hte.title,
                'summary', hte.summary,
                'date', hte.event_date,
                'type', hte.display_subcategory
            ) ORDER BY hte.event_date DESC
        )
    FROM healthcare_timeline_events hte
    WHERE hte.patient_id = p_patient_id 
    AND hte.condition_id = p_condition_id
    AND hte.display_category = 'treatment'
    AND hte.archived IS NOT TRUE
    
    UNION ALL
    
    -- Monitoring events
    SELECT 
        'monitoring'::TEXT,
        3::INTEGER,
        jsonb_agg(
            jsonb_build_object(
                'event_id', hte.id,
                'title', hte.title,
                'summary', hte.summary,
                'date', hte.event_date,
                'result_summary', hte.summary
            ) ORDER BY hte.event_date DESC
        )
    FROM healthcare_timeline_events hte
    WHERE hte.patient_id = p_patient_id 
    AND hte.condition_id = p_condition_id
    AND ('monitoring' = ANY(hte.event_tags) OR hte.display_category = 'test_result')
    AND hte.archived IS NOT TRUE
    
    ORDER BY section_order;
END;
$$ LANGUAGE plpgsql;
```

### 3.2. Medication Journey Tracking

```sql
-- Complete medication lifecycle from initiation to current status
CREATE OR REPLACE VIEW medication_journey AS
SELECT 
    pce.id as medication_event_id,
    pce.patient_id,
    pi.substance_name as medication_name,
    pi.dose_amount,
    pi.dose_unit,
    pi.route,
    
    -- Lifecycle tracking
    pce.event_date as medication_date,
    'started' as lifecycle_event, -- Derived from event context
    
    -- Clinical context
    pce.encounter_id,
    he.provider_name as prescribing_provider,
    he.facility_name,
    
    -- Monitoring and outcomes
    COALESCE(
        ARRAY_AGG(
            DISTINCT monitoring_events.id ORDER BY monitoring_events.event_date DESC
        ) FILTER (WHERE monitoring_events.id IS NOT NULL), 
        '{}'
    ) as monitoring_events,
    
    -- Related conditions
    COALESCE(
        ARRAY_AGG(
            DISTINCT pc.condition_name
        ) FILTER (WHERE pc.condition_name IS NOT NULL), 
        '{}'
    ) as treating_conditions
    
FROM patient_clinical_events pce
JOIN patient_interventions pi ON pi.event_id = pce.id
LEFT JOIN healthcare_encounters he ON he.id = pce.encounter_id
LEFT JOIN healthcare_timeline_events monitoring_events ON monitoring_events.patient_id = pce.patient_id
    AND 'monitoring' = ANY(monitoring_events.event_tags)
    AND monitoring_events.searchable_content ILIKE '%' || pi.substance_name || '%'
    AND monitoring_events.archived IS NOT TRUE
LEFT JOIN medical_data_relationships mdr ON (
    (mdr.source_table = 'patient_clinical_events' AND mdr.source_id = pce.id) OR
    (mdr.target_table = 'patient_clinical_events' AND mdr.target_id = pce.id)
) AND mdr.relationship_type = 'treats'
LEFT JOIN patient_conditions pc ON pc.id = CASE 
    WHEN mdr.target_table = 'patient_conditions' THEN mdr.target_id
    WHEN mdr.source_table = 'patient_conditions' THEN mdr.source_id
    ELSE NULL
END
WHERE pce.activity_type = 'intervention'
AND pi.intervention_type = 'medication_admin'
AND pce.archived IS NOT TRUE
GROUP BY pce.id, pce.patient_id, pi.substance_name, pi.dose_amount, pi.dose_unit, 
         pi.route, pce.event_date, pce.encounter_id, he.provider_name, he.facility_name;
```

---

## 4. AI Chatbot Integration

*Natural language querying over healthcare timeline data*

### 4.1. Chatbot Query Processing

```sql
-- Natural language query processing for healthcare timeline
CREATE OR REPLACE FUNCTION process_healthcare_chatbot_query(
    p_patient_id UUID,
    p_query TEXT
) RETURNS TABLE (
    response_type TEXT,
    response_data JSONB,
    confidence_score NUMERIC
) AS $$
DECLARE
    query_intent TEXT;
    time_period TEXT;
    health_topic TEXT;
BEGIN
    -- Basic intent detection (would be enhanced with NLP service)
    query_intent := CASE 
        WHEN p_query ILIKE '%when%' OR p_query ILIKE '%date%' THEN 'temporal'
        WHEN p_query ILIKE '%medication%' OR p_query ILIKE '%drug%' THEN 'medication'
        WHEN p_query ILIKE '%test%' OR p_query ILIKE '%result%' THEN 'test_results'
        WHEN p_query ILIKE '%doctor%' OR p_query ILIKE '%visit%' THEN 'encounters'
        WHEN p_query ILIKE '%condition%' OR p_query ILIKE '%diagnosis%' THEN 'conditions'
        ELSE 'general'
    END;
    
    -- Extract time references
    time_period := CASE 
        WHEN p_query ILIKE '%last month%' THEN '1 month'
        WHEN p_query ILIKE '%last year%' THEN '1 year'
        WHEN p_query ILIKE '%this year%' THEN 'current_year'
        WHEN p_query ILIKE '%march%' THEN 'march'
        ELSE NULL
    END;
    
    -- Process based on intent
    IF query_intent = 'medication' THEN
        RETURN QUERY
        SELECT 
            'medication_history'::TEXT,
            jsonb_agg(
                jsonb_build_object(
                    'medication', mj.medication_name,
                    'dose', CONCAT(mj.dose_amount, ' ', mj.dose_unit),
                    'date_started', mj.medication_date,
                    'prescribing_provider', mj.prescribing_provider,
                    'treating_conditions', mj.treating_conditions
                ) ORDER BY mj.medication_date DESC
            ),
            0.85::NUMERIC
        FROM medication_journey mj
        WHERE mj.patient_id = p_patient_id
        AND (time_period IS NULL OR 
             (time_period = '1 month' AND mj.medication_date >= NOW() - INTERVAL '1 month') OR
             (time_period = '1 year' AND mj.medication_date >= NOW() - INTERVAL '1 year'));
    
    ELSIF query_intent = 'test_results' THEN
        RETURN QUERY
        SELECT 
            'recent_tests'::TEXT,
            jsonb_agg(
                jsonb_build_object(
                    'test_name', hte.title,
                    'result_summary', hte.summary,
                    'date', hte.event_date,
                    'category', hte.display_subcategory
                ) ORDER BY hte.event_date DESC
            ),
            0.80::NUMERIC
        FROM healthcare_timeline_events hte
        WHERE hte.patient_id = p_patient_id
        AND hte.display_category = 'test_result'
        AND hte.archived IS NOT TRUE
        AND (time_period IS NULL OR 
             (time_period = '1 month' AND hte.event_date >= NOW() - INTERVAL '1 month'));
    
    ELSE
        -- General full-text search across timeline
        RETURN QUERY
        SELECT 
            'general_search'::TEXT,
            jsonb_agg(
                jsonb_build_object(
                    'title', hte.title,
                    'summary', hte.summary,
                    'date', hte.event_date,
                    'category', hte.display_category,
                    'relevance_score', ts_rank(to_tsvector('english', hte.searchable_content), plainto_tsquery('english', p_query))
                ) ORDER BY ts_rank(to_tsvector('english', hte.searchable_content), plainto_tsquery('english', p_query)) DESC
            ),
            0.70::NUMERIC
        FROM healthcare_timeline_events hte
        WHERE hte.patient_id = p_patient_id
        AND hte.archived IS NOT TRUE
        AND to_tsvector('english', hte.searchable_content) @@ plainto_tsquery('english', p_query)
        LIMIT 10;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

### 4.2. Common Chatbot Query Patterns

**Temporal Queries:**
- "What happened in March last year?"
- "Show me my appointments this month"
- "When was my last blood test?"

**Condition-Specific Queries:**
- "Tell me about my diabetes management"
- "What tests have I had for my heart condition?"
- "Show me all treatments for my back pain"

**Medication Queries:**
- "What medications am I currently taking?"
- "When did I start taking metformin?"
- "Show me my vaccination history"

**Provider Queries:**
- "What did Dr. Johnson say in my last visit?"
- "Show me all visits to cardiology"
- "Which doctors have I seen this year?"

---

## 5. Mobile-Responsive Timeline Design

### 5.1. Timeline UI Components

**Compact Mobile View:**
```typescript
interface TimelineEvent {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: string;
  icon: string;
  color: string;
  isMajor: boolean;
  expandable: boolean;
  relatedEvents?: TimelineEvent[];
}

interface TimelineFilter {
  primary: string[];
  secondary: string[];
  tertiary: string[];
  dateRange: {
    from?: string;
    to?: string;
  };
  majorEventsOnly: boolean;
  searchQuery?: string;
}
```

**Responsive Design Principles:**
- **Mobile First:** Compact timeline with expandable detail views
- **Progressive Disclosure:** Major events visible, details on demand
- **Touch-Friendly:** Large tap targets for timeline navigation
- **Offline Capable:** Timeline cache for offline browsing
- **Performance Optimized:** Virtualized scrolling for large timelines

### 5.2. Timeline Visualization Options

**View Modes:**
1. **Chronological List** - Default scrollable timeline
2. **Calendar Integration** - Monthly/yearly calendar view
3. **Category Clusters** - Events grouped by type
4. **Provider Timeline** - Healthcare provider-centric view
5. **Condition Focus** - Condition-specific timeline filtering

**Interactive Features:**
- **Expandable Events** - Tap to show full details and related data
- **Quick Filters** - One-tap category and time period filtering
- **Search Integration** - Real-time search with result highlighting
- **Export Options** - Share timeline segments with providers
- **Bookmark Events** - Save important events for quick access

---

## 6. Healthcare Journey Summary

The Healthcare Journey system transforms Guardian's clinical data into an intuitive, patient-centric timeline experience:

**🎯 Key Benefits:**
- **Complete Healthcare Story:** Chronological view of all healthcare interactions and outcomes
- **Intelligent Organization:** Smart categorization and consolidation prevents information overload  
- **Deep Context:** Every timeline event links back to source documents and related clinical data
- **Flexible Exploration:** Multi-level filtering enables both broad overviews and detailed analysis
- **AI-Powered Search:** Natural language queries make healthcare data exploration intuitive
- **Condition Tracking:** Dedicated journey views for managing chronic conditions and treatments
- **Mobile Optimized:** Responsive design ensures healthcare data access anywhere, anytime

**🔗 Integration Points:**
- **Clinical Events:** Built on unified clinical events architecture from Core Schema
- **Document Provenance:** Every timeline event traceable to source documents
- **User Experience:** Timeline components integrate with broader UX framework  
- **FHIR Compatibility:** Timeline data exportable in standard healthcare formats
- **Provider Collaboration:** Timeline sharing capabilities for healthcare coordination

This healthcare journey system empowers patients with comprehensive visibility into their healthcare story while maintaining the clinical rigor and data integrity required for medical decision-making.