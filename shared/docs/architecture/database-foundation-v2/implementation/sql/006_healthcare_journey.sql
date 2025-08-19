-- ⚠️  DOCUMENTATION REFERENCE COPY - DO NOT EDIT
-- 📍 SINGLE SOURCE OF TRUTH: /supabase/migrations/006_healthcare_journey.sql
-- 🔄 This file is for architectural documentation only
-- ✏️  All changes must be made in /supabase/migrations/ directory
-- 
-- Healthcare Journey & Timeline Implementation
-- Guardian v7 Implementation - Step 4
-- File: 004_healthcare_journey.sql
-- Implements the healthcare journey timeline system for patient dashboard

BEGIN;

-- Create healthcare timeline events table
CREATE TABLE healthcare_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES auth.users(id),
    profile_id UUID REFERENCES user_profiles(id), -- FIXED: Multi-profile support missing from SQL implementation
    
    -- Hierarchical categorization for multi-level filtering
    display_category TEXT NOT NULL, -- 'visit', 'test_result', 'treatment', 'vaccination', 'screening', 'diagnosis'
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

-- Enable RLS for timeline events
ALTER TABLE healthcare_timeline_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy for timeline event isolation
CREATE POLICY healthcare_timeline_events_user_isolation ON healthcare_timeline_events
    FOR ALL USING (auth.uid() = patient_id AND archived IS NOT TRUE);

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
    searchable_content TEXT;
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

-- Create healthcare encounter timeline events function
CREATE OR REPLACE FUNCTION generate_timeline_event_from_encounter()
RETURNS TRIGGER AS $$
DECLARE
    timeline_title TEXT;
    timeline_summary TEXT;
    timeline_category TEXT := 'visit';
    timeline_subcategory TEXT;
    timeline_icon TEXT;
    priority_score INTEGER DEFAULT 50;
    event_tags TEXT[] DEFAULT '{}';
    searchable_content TEXT;
BEGIN
    -- Determine encounter subcategory and icon
    CASE NEW.encounter_type
        WHEN 'outpatient' THEN
            timeline_subcategory := 'routine_visit';
            timeline_icon := 'building-hospital';
            priority_score := 60;
        WHEN 'emergency' THEN
            timeline_subcategory := 'emergency_visit';
            timeline_icon := 'emergency';
            priority_score := 20;
            event_tags := event_tags || 'urgent';
        WHEN 'specialist' THEN
            timeline_subcategory := 'specialist_consult';
            timeline_icon := 'user-doctor';
            priority_score := 40;
        WHEN 'telehealth' THEN
            timeline_subcategory := 'telehealth';
            timeline_icon := 'video';
            priority_score := 70;
        WHEN 'diagnostic' THEN
            timeline_subcategory := 'diagnostic_visit';
            timeline_icon := 'microscope';
            priority_score := 50;
        ELSE
            timeline_subcategory := 'healthcare_visit';
            timeline_icon := 'hospital';
    END CASE;
    
    -- Create title
    timeline_title := COALESCE(
        NEW.specialty || ' Visit',
        INITCAP(NEW.encounter_type) || ' Visit'
    );
    
    -- Create summary
    timeline_summary := COALESCE(
        'Visit with ' || NEW.provider_name,
        'Healthcare visit at ' || NEW.facility_name,
        INITCAP(NEW.encounter_type) || ' healthcare encounter'
    );
    
    -- Add chief complaint to summary if available
    IF NEW.chief_complaint IS NOT NULL THEN
        timeline_summary := timeline_summary || ' - ' || NEW.chief_complaint;
    END IF;
    
    -- Create searchable content
    searchable_content := COALESCE(NEW.provider_name, '') || ' ' ||
                         COALESCE(NEW.facility_name, '') || ' ' ||
                         COALESCE(NEW.specialty, '') || ' ' ||
                         COALESCE(NEW.chief_complaint, '') || ' ' ||
                         COALESCE(NEW.summary, '') || ' ' ||
                         NEW.encounter_type;
    
    -- Add routine/preventive tags for certain encounter types
    IF NEW.encounter_type IN ('outpatient', 'telehealth') AND 
       (NEW.chief_complaint ILIKE '%annual%' OR NEW.chief_complaint ILIKE '%check%' OR NEW.summary ILIKE '%routine%') THEN
        event_tags := event_tags || 'routine';
    END IF;
    
    -- Insert timeline event for encounter
    INSERT INTO healthcare_timeline_events (
        patient_id, display_category, display_subcategory,
        title, summary, icon, event_date, encounter_id,
        is_major_event, display_priority, searchable_content, event_tags
    ) VALUES (
        NEW.patient_id, timeline_category, timeline_subcategory,
        timeline_title, timeline_summary, timeline_icon, NEW.encounter_date,
        NEW.id, TRUE, priority_score, searchable_content, event_tags
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate timeline events from encounters  
CREATE TRIGGER generate_timeline_from_encounters
    AFTER INSERT ON healthcare_encounters
    FOR EACH ROW EXECUTE FUNCTION generate_timeline_event_from_encounter();

-- Multi-level filtering function for timeline
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

-- Timeline category filters view
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

-- Natural language query processing for healthcare timeline chatbot
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
    IF query_intent = 'test_results' THEN
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
    
    ELSIF query_intent = 'encounters' THEN
        RETURN QUERY
        SELECT 
            'recent_visits'::TEXT,
            jsonb_agg(
                jsonb_build_object(
                    'visit_title', hte.title,
                    'summary', hte.summary,
                    'date', hte.event_date,
                    'type', hte.display_subcategory
                ) ORDER BY hte.event_date DESC
            ),
            0.85::NUMERIC
        FROM healthcare_timeline_events hte
        WHERE hte.patient_id = p_patient_id
        AND hte.display_category = 'visit'
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

-- Create updated_at trigger for timeline events
CREATE TRIGGER update_healthcare_timeline_events_updated_at
    BEFORE UPDATE ON healthcare_timeline_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify healthcare journey implementation
DO $$
DECLARE
    timeline_events_exists BOOLEAN;
    trigger_exists BOOLEAN;
    function_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'healthcare_timeline_events' AND table_schema = 'public'
    ) INTO timeline_events_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'generate_timeline_from_clinical_events'
    ) INTO trigger_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'filter_patient_timeline' AND routine_schema = 'public'
    ) INTO function_exists;
    
    IF timeline_events_exists AND trigger_exists AND function_exists THEN
        RAISE NOTICE 'Healthcare journey implementation successful!';
        RAISE NOTICE 'Features available:';
        RAISE NOTICE '- Healthcare timeline events with hierarchical filtering';
        RAISE NOTICE '- Automatic timeline generation from clinical events and encounters';
        RAISE NOTICE '- Multi-level filtering system for timeline exploration';
        RAISE NOTICE '- Condition-specific journey tracking';
        RAISE NOTICE '- AI chatbot integration for natural language queries';
        RAISE NOTICE '- Timeline consolidation and priority management';
    ELSE
        RAISE WARNING 'Some healthcare journey components missing. Check implementation.';
    END IF;
END;
$$;

COMMIT;

-- Success message
\echo 'Healthcare journey system deployed successfully!'
\echo 'Features available:'
\echo '- Intelligent timeline with multi-level filtering (primary/secondary/tertiary categories)'
\echo '- Automatic timeline event generation from clinical events and encounters'
\echo '- Condition-specific healthcare journey tracking'
\echo '- AI chatbot integration for natural language timeline queries'
\echo '- Timeline consolidation and priority management'
\echo '- Mobile-optimized timeline design support'
\echo 'Next step: Run 005_imaging_reports.sql'