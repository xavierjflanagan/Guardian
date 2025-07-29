-- Imaging Reports Enhancement & Timeline Integration
-- Guardian v7 Implementation - Step 5
-- File: 005_imaging_reports.sql
-- Enhances imaging reports with timeline integration and DICOM support

BEGIN;

-- Update imaging reports table with enhanced timeline integration
-- (Note: Base table created in 003_clinical_events_core.sql, this adds timeline integration)

-- Create function to generate timeline events from imaging reports
CREATE OR REPLACE FUNCTION generate_timeline_event_from_imaging_report()
RETURNS TRIGGER AS $$
DECLARE
    timeline_title TEXT;
    timeline_summary TEXT;
    timeline_category TEXT := 'test_result';
    timeline_subcategory TEXT := 'imaging';
    timeline_tertiary TEXT;
    timeline_icon TEXT;
    priority_score INTEGER DEFAULT 50;
    event_tags TEXT[] DEFAULT '{}';
    searchable_content TEXT;
    requires_attention BOOLEAN DEFAULT FALSE;
    attention_reason TEXT;
BEGIN
    -- Determine imaging-specific subcategory and icon based on imaging type
    CASE NEW.imaging_type
        WHEN 'x_ray' THEN
            timeline_tertiary := 'x_ray';
            timeline_icon := 'x-ray';
            priority_score := 60;
        WHEN 'ct_scan' THEN
            timeline_tertiary := 'ct_scan';
            timeline_icon := 'scan';
            priority_score := 40;
            is_major := TRUE;
        WHEN 'mri' THEN
            timeline_tertiary := 'mri';
            timeline_icon := 'brain';
            priority_score := 30;
            is_major := TRUE;
        WHEN 'ultrasound' THEN
            timeline_tertiary := 'ultrasound';
            timeline_icon := 'waveform';
            priority_score := 70;
        WHEN 'mammogram' THEN
            timeline_tertiary := 'mammogram';
            timeline_icon := 'scan';
            priority_score := 45;
            event_tags := event_tags || 'screening';
        WHEN 'pet_scan' THEN
            timeline_tertiary := 'pet_scan';
            timeline_icon := 'atom';
            priority_score := 25;
            is_major := TRUE;
        ELSE
            timeline_tertiary := 'imaging_study';
            timeline_icon := 'camera';
    END CASE;
    
    -- Create title with body region context
    timeline_title := CASE 
        WHEN NEW.body_region IS NOT NULL THEN
            INITCAP(REPLACE(NEW.imaging_type, '_', ' ')) || ' - ' || INITCAP(REPLACE(NEW.body_region, '_', ' '))
        ELSE
            INITCAP(REPLACE(NEW.imaging_type, '_', ' ')) || ' Study'
    END;
    
    -- Create comprehensive summary
    timeline_summary := COALESCE(NEW.indication, 'Imaging study');
    IF NEW.radiologist_name IS NOT NULL THEN
        timeline_summary := timeline_summary || ' - Report by ' || NEW.radiologist_name;
    END IF;
    IF NEW.facility_name IS NOT NULL THEN
        timeline_summary := timeline_summary || ' at ' || NEW.facility_name;
    END IF;
    
    -- Create searchable content for AI chatbot
    searchable_content := NEW.imaging_type || ' ' ||
                         COALESCE(NEW.body_region, '') || ' ' ||
                         COALESCE(NEW.indication, '') || ' ' ||
                         COALESCE(NEW.findings, '') || ' ' ||
                         COALESCE(NEW.impression, '') || ' ' ||
                         COALESCE(NEW.radiologist_name, '') || ' ' ||
                         COALESCE(NEW.facility_name, '') || ' ' ||
                         COALESCE(NEW.referring_physician, '');
    
    -- Check if findings suggest abnormalities that require attention
    IF NEW.impression IS NOT NULL AND (
        NEW.impression ILIKE '%abnormal%' OR 
        NEW.impression ILIKE '%concerning%' OR
        NEW.impression ILIKE '%suspicious%' OR
        NEW.impression ILIKE '%follow%' OR
        NEW.impression ILIKE '%recommend%'
    ) THEN
        requires_attention := TRUE;
        attention_reason := 'Imaging findings may require follow-up or attention';
        event_tags := event_tags || 'abnormal';
        priority_score := priority_score - 10; -- Higher priority for abnormal findings
    END IF;
    
    -- Add screening tag for preventive imaging
    IF NEW.indication IS NOT NULL AND (
        NEW.indication ILIKE '%screening%' OR
        NEW.indication ILIKE '%routine%' OR
        NEW.indication ILIKE '%annual%'
    ) THEN
        event_tags := event_tags || 'preventive';
    END IF;
    
    -- Add emergency tag for urgent imaging
    IF NEW.indication IS NOT NULL AND (
        NEW.indication ILIKE '%emergency%' OR
        NEW.indication ILIKE '%urgent%' OR
        NEW.indication ILIKE '%stat%'
    ) THEN
        event_tags := event_tags || 'urgent';
        priority_score := 20; -- Very high priority
    END IF;
    
    -- Insert timeline event for imaging report
    INSERT INTO healthcare_timeline_events (
        patient_id, display_category, display_subcategory, display_tertiary,
        title, summary, icon, event_date, encounter_id, document_id,
        is_major_event, display_priority, searchable_content, event_tags,
        requires_attention, attention_reason
    ) VALUES (
        NEW.patient_id, timeline_category, timeline_subcategory, timeline_tertiary,
        timeline_title, timeline_summary, timeline_icon, NEW.study_date,
        NEW.encounter_id, NEW.source_document_id,
        (priority_score <= 40), priority_score, searchable_content, event_tags,
        requires_attention, attention_reason
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate timeline events from imaging reports
CREATE TRIGGER generate_timeline_from_imaging_reports
    AFTER INSERT ON patient_imaging_reports
    FOR EACH ROW EXECUTE FUNCTION generate_timeline_event_from_imaging_report();

-- Enhanced imaging query functions with timeline integration
CREATE OR REPLACE FUNCTION get_patient_imaging_timeline(
    p_patient_id UUID,
    p_imaging_types TEXT[] DEFAULT NULL,
    p_body_regions TEXT[] DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL,
    p_abnormal_only BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
    imaging_id UUID,
    timeline_event_id UUID,
    imaging_type TEXT,
    body_region TEXT,
    study_date TIMESTAMPTZ,
    indication TEXT,
    findings TEXT,
    impression TEXT,
    radiologist_name TEXT,
    facility_name TEXT,
    requires_attention BOOLEAN,
    timeline_summary TEXT,
    event_tags TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pir.id,
        hte.id as timeline_event_id,
        pir.imaging_type,
        pir.body_region,
        pir.study_date,
        pir.indication,
        pir.findings,
        pir.impression,
        pir.radiologist_name,
        pir.facility_name,
        hte.requires_attention,
        hte.summary as timeline_summary,
        hte.event_tags
    FROM patient_imaging_reports pir
    LEFT JOIN healthcare_timeline_events hte ON (
        hte.patient_id = pir.patient_id 
        AND hte.display_category = 'test_result'
        AND hte.display_subcategory = 'imaging'
        AND hte.event_date = pir.study_date
        AND hte.archived IS NOT TRUE
    )
    WHERE pir.patient_id = p_patient_id
    AND pir.archived IS NOT TRUE
    -- Filter by imaging types
    AND (p_imaging_types IS NULL OR pir.imaging_type = ANY(p_imaging_types))
    -- Filter by body regions
    AND (p_body_regions IS NULL OR pir.body_region = ANY(p_body_regions))
    -- Date range filter
    AND (p_date_from IS NULL OR pir.study_date >= p_date_from)
    AND (p_date_to IS NULL OR pir.study_date <= p_date_to)
    -- Abnormal findings filter
    AND (p_abnormal_only = FALSE OR hte.requires_attention = TRUE)
    ORDER BY pir.study_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get imaging study details with related clinical context
CREATE OR REPLACE FUNCTION get_imaging_study_context(
    p_imaging_id UUID
) RETURNS TABLE (
    imaging_details JSONB,
    encounter_context JSONB,
    related_clinical_events JSONB,
    follow_up_recommendations TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Imaging study details
        jsonb_build_object(
            'id', pir.id,
            'imaging_type', pir.imaging_type,
            'body_region', pir.body_region,
            'study_date', pir.study_date,
            'indication', pir.indication,
            'findings', pir.findings,
            'impression', pir.impression,
            'contrast_used', pir.contrast_used,
            'contrast_type', COALESCE(pir.contrast_type, ''),
            'technique_notes', COALESCE(pir.technique_notes, ''),
            'dicom_study_uid', COALESCE(pir.dicom_study_uid, ''),
            'confidence_score', pir.confidence_score
        ) as imaging_details,
        
        -- Encounter context if available
        CASE 
            WHEN he.id IS NOT NULL THEN
                jsonb_build_object(
                    'encounter_id', he.id,
                    'encounter_type', he.encounter_type,
                    'provider_name', he.provider_name,
                    'facility_name', he.facility_name,
                    'specialty', COALESCE(he.specialty, ''),
                    'chief_complaint', COALESCE(he.chief_complaint, ''),
                    'clinical_impression', COALESCE(he.clinical_impression, '')
                )
            ELSE NULL
        END as encounter_context,
        
        -- Related clinical events
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'event_id', pce.id,
                    'event_name', pce.event_name,
                    'activity_type', pce.activity_type,
                    'clinical_purposes', pce.clinical_purposes,
                    'event_date', pce.event_date,
                    'body_site', COALESCE(pce.body_site, '')
                ) ORDER BY pce.event_date DESC
            ) FILTER (WHERE pce.id IS NOT NULL),
            '[]'::jsonb
        ) as related_clinical_events,
        
        -- Extract follow-up recommendations from impression
        CASE 
            WHEN pir.impression IS NOT NULL AND pir.impression ~ '(?i)(follow|recommend|suggest|consider)' THEN
                ARRAY[pir.impression]
            WHEN pir.recommendations IS NOT NULL THEN
                string_to_array(pir.recommendations, ';')
            ELSE
                '{}'::TEXT[]
        END as follow_up_recommendations
        
    FROM patient_imaging_reports pir
    LEFT JOIN healthcare_encounters he ON he.id = pir.encounter_id
    LEFT JOIN patient_clinical_events pce ON (
        pce.encounter_id = pir.encounter_id 
        AND pce.body_site = pir.body_region
        AND pce.archived IS NOT TRUE
    )
    WHERE pir.id = p_imaging_id
    AND pir.archived IS NOT TRUE
    GROUP BY pir.id, pir.imaging_type, pir.body_region, pir.study_date, 
             pir.indication, pir.findings, pir.impression, pir.contrast_used,
             pir.contrast_type, pir.technique_notes, pir.dicom_study_uid,
             pir.confidence_score, pir.recommendations,
             he.id, he.encounter_type, he.provider_name, he.facility_name, 
             he.specialty, he.chief_complaint, he.clinical_impression;
END;
$$ LANGUAGE plpgsql;

-- Create imaging summary view for dashboard
CREATE OR REPLACE VIEW patient_imaging_summary AS
SELECT 
    pir.patient_id,
    pir.imaging_type,
    pir.body_region,
    COUNT(*) as total_studies,
    MAX(pir.study_date) as most_recent_study,
    MIN(pir.study_date) as first_study,
    COUNT(*) FILTER (WHERE hte.requires_attention = TRUE) as studies_requiring_attention,
    COUNT(*) FILTER (WHERE 'abnormal' = ANY(hte.event_tags)) as abnormal_studies,
    COUNT(*) FILTER (WHERE 'screening' = ANY(hte.event_tags)) as screening_studies,
    COUNT(*) FILTER (WHERE pir.contrast_used = TRUE) as contrast_studies,
    
    -- Most recent study details
    (
        SELECT jsonb_build_object(
            'study_date', recent_pir.study_date,
            'indication', COALESCE(recent_pir.indication, ''),
            'impression', COALESCE(recent_pir.impression, ''),
            'radiologist', COALESCE(recent_pir.radiologist_name, ''),
            'facility', COALESCE(recent_pir.facility_name, '')
        )
        FROM patient_imaging_reports recent_pir
        WHERE recent_pir.patient_id = pir.patient_id
        AND recent_pir.imaging_type = pir.imaging_type
        AND recent_pir.body_region = pir.body_region
        AND recent_pir.archived IS NOT TRUE
        ORDER BY recent_pir.study_date DESC
        LIMIT 1
    ) as most_recent_study_details
    
FROM patient_imaging_reports pir
LEFT JOIN healthcare_timeline_events hte ON (
    hte.patient_id = pir.patient_id 
    AND hte.display_category = 'test_result'
    AND hte.display_subcategory = 'imaging'
    AND hte.event_date = pir.study_date
    AND hte.archived IS NOT TRUE
)
WHERE pir.archived IS NOT TRUE
GROUP BY pir.patient_id, pir.imaging_type, pir.body_region;

-- Function to identify imaging trends and patterns
CREATE OR REPLACE FUNCTION analyze_patient_imaging_patterns(
    p_patient_id UUID
) RETURNS TABLE (
    pattern_type TEXT,
    pattern_description TEXT,
    supporting_data JSONB,
    clinical_significance TEXT
) AS $$
BEGIN
    RETURN QUERY
    
    -- Frequent imaging of same body region
    SELECT 
        'frequent_imaging'::TEXT,
        'Multiple ' || imaging_type || ' studies of ' || body_region::TEXT,
        jsonb_build_object(
            'imaging_type', imaging_type,
            'body_region', body_region,
            'study_count', study_count,
            'time_span_months', time_span_months,
            'studies_per_year', ROUND(study_count * 12.0 / GREATEST(time_span_months, 1), 2)
        ),
        CASE 
            WHEN study_count >= 4 AND time_span_months <= 12 THEN
                'High frequency imaging may indicate ongoing monitoring of a condition'
            WHEN study_count >= 6 THEN
                'Multiple studies suggest chronic condition monitoring or repeated evaluations'
            ELSE
                'Regular imaging follow-up pattern'
        END::TEXT
    FROM (
        SELECT 
            pir.imaging_type,
            pir.body_region,
            COUNT(*) as study_count,
            ROUND(EXTRACT(EPOCH FROM (MAX(pir.study_date) - MIN(pir.study_date))) / (30.44 * 24 * 3600)) as time_span_months
        FROM patient_imaging_reports pir
        WHERE pir.patient_id = p_patient_id
        AND pir.archived IS NOT TRUE
        GROUP BY pir.imaging_type, pir.body_region
        HAVING COUNT(*) >= 3
    ) frequent_studies
    
    UNION ALL
    
    -- Progression from screening to diagnostic imaging
    SELECT 
        'screening_to_diagnostic'::TEXT,
        'Screening imaging followed by diagnostic studies'::TEXT,
        jsonb_build_object(
            'body_region', body_region,
            'screening_studies', screening_count,
            'diagnostic_studies', diagnostic_count,
            'time_between_months', time_between_months
        ),
        'Screening detected findings that warranted additional diagnostic evaluation'::TEXT
    FROM (
        SELECT 
            pir.body_region,
            COUNT(*) FILTER (WHERE hte.event_tags && ARRAY['screening']) as screening_count,
            COUNT(*) FILTER (WHERE hte.event_tags && ARRAY['diagnostic']) as diagnostic_count,
            ROUND(EXTRACT(EPOCH FROM (
                MAX(pir.study_date) FILTER (WHERE hte.event_tags && ARRAY['diagnostic']) -
                MIN(pir.study_date) FILTER (WHERE hte.event_tags && ARRAY['screening'])
            )) / (30.44 * 24 * 3600)) as time_between_months
        FROM patient_imaging_reports pir
        LEFT JOIN healthcare_timeline_events hte ON (
            hte.patient_id = pir.patient_id 
            AND hte.event_date = pir.study_date
            AND hte.display_subcategory = 'imaging'
        )
        WHERE pir.patient_id = p_patient_id
        AND pir.archived IS NOT TRUE
        GROUP BY pir.body_region
        HAVING COUNT(*) FILTER (WHERE hte.event_tags && ARRAY['screening']) >= 1
        AND COUNT(*) FILTER (WHERE hte.event_tags && ARRAY['diagnostic']) >= 1
    ) screening_diagnostic
    
    UNION ALL
    
    -- Studies requiring attention cluster
    SELECT 
        'attention_cluster'::TEXT,
        'Multiple imaging studies requiring attention'::TEXT,
        jsonb_build_object(
            'total_attention_studies', attention_count,
            'time_span_months', attention_time_span,
            'body_regions_affected', body_regions_affected
        ),
        'Pattern of concerning findings across multiple imaging studies warrants clinical correlation'::TEXT
    FROM (
        SELECT 
            COUNT(*) as attention_count,
            ROUND(EXTRACT(EPOCH FROM (MAX(pir.study_date) - MIN(pir.study_date))) / (30.44 * 24 * 3600)) as attention_time_span,
            array_agg(DISTINCT pir.body_region ORDER BY pir.body_region) as body_regions_affected
        FROM patient_imaging_reports pir
        LEFT JOIN healthcare_timeline_events hte ON (
            hte.patient_id = pir.patient_id 
            AND hte.event_date = pir.study_date
            AND hte.display_subcategory = 'imaging'
        )
        WHERE pir.patient_id = p_patient_id
        AND pir.archived IS NOT TRUE
        AND hte.requires_attention = TRUE
        HAVING COUNT(*) >= 2
    ) attention_cluster;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for imaging-specific queries
CREATE INDEX idx_patient_imaging_timeline_integration 
ON patient_imaging_reports(patient_id, study_date, imaging_type, body_region) 
WHERE archived IS NOT TRUE;

CREATE INDEX idx_patient_imaging_contrast 
ON patient_imaging_reports(contrast_used, contrast_type) 
WHERE contrast_used = TRUE AND archived IS NOT TRUE;

CREATE INDEX idx_patient_imaging_dicom 
ON patient_imaging_reports(dicom_study_uid) 
WHERE dicom_study_uid IS NOT NULL AND archived IS NOT TRUE;

-- Full-text search on imaging findings and impressions
CREATE INDEX idx_patient_imaging_findings_search 
ON patient_imaging_reports USING GIN(to_tsvector('english', COALESCE(findings, '') || ' ' || COALESCE(impression, ''))) 
WHERE archived IS NOT TRUE;

-- Verify imaging reports enhancement implementation
DO $$
DECLARE
    trigger_exists BOOLEAN;
    function_exists BOOLEAN;
    view_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'generate_timeline_from_imaging_reports'
    ) INTO trigger_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'get_patient_imaging_timeline' AND routine_schema = 'public'
    ) INTO function_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_name = 'patient_imaging_summary' AND table_schema = 'public'
    ) INTO view_exists;
    
    IF trigger_exists AND function_exists AND view_exists THEN
        RAISE NOTICE 'Imaging reports enhancement implementation successful!';
        RAISE NOTICE 'Features available:';
        RAISE NOTICE '- Automatic timeline integration for all imaging studies';
        RAISE NOTICE '- Enhanced imaging queries with clinical context';
        RAISE NOTICE '- Imaging pattern analysis and trend detection';
        RAISE NOTICE '- DICOM integration support';
        RAISE NOTICE '- Abnormal findings flagging and attention management';
        RAISE NOTICE '- Full-text search across imaging findings and impressions';
    ELSE
        RAISE WARNING 'Some imaging enhancement components missing. Check implementation.';
    END IF;
END;
$$;

COMMIT;

-- Success message
\echo 'Imaging reports enhancement deployed successfully!'
\echo 'Features available:'
\echo '- Automatic timeline integration for all imaging studies with intelligent categorization'
\echo '- Advanced imaging queries with encounter context and clinical event relationships'
\echo '- Imaging pattern analysis for identifying trends and clinical significance'
\echo '- DICOM study integration with unique identifier tracking'
\echo '- Abnormal findings detection with attention flagging system'
\echo '- Full-text search capabilities across imaging findings and impressions'
\echo 'Next step: Update implementation guides and user experience documentation'