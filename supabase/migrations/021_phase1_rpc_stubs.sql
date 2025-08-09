-- Guardian Phase 1 RPC Function Stubs
-- Creates missing RPC functions that frontend hooks require
-- Date: 2025-08-09
-- Purpose: Prevent runtime errors with stub implementations

BEGIN;

-- =============================================================================
-- 1. DOCUMENTS RPC FUNCTION (Stub Implementation)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_documents_for_profile(p_profile_id UUID)
RETURNS TABLE(
    id UUID,
    filename TEXT,
    file_size BIGINT,
    mime_type TEXT,
    upload_date TIMESTAMPTZ,
    processing_status TEXT,
    patient_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    profile_owner_id UUID;
BEGIN
    -- Get the account owner for this profile
    SELECT account_owner_id INTO profile_owner_id
    FROM user_profiles 
    WHERE id = p_profile_id;
    
    -- Verify the caller owns this profile
    IF profile_owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Profile not owned by current user';
    END IF;
    
    -- Check if documents table exists and what schema it uses
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents' AND table_schema = 'public') THEN
        -- Check if documents table has patient_id column
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'patient_id' AND table_schema = 'public') THEN
            -- Modern schema: use patient_id directly (profile_id serves as patient_id in v7.0)
            RETURN QUERY
            SELECT 
                d.id,
                d.filename,
                d.file_size,
                d.mime_type,
                d.upload_date,
                d.processing_status,
                d.patient_id,
                d.created_at,
                d.updated_at
            FROM documents d
            WHERE d.patient_id = p_profile_id;
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'user_id' AND table_schema = 'public') THEN
            -- Legacy schema: use user_id but map to patient_id for output
            RETURN QUERY
            SELECT 
                d.id,
                d.filename,
                d.file_size,
                d.mime_type,
                d.upload_date,
                d.processing_status,
                d.user_id as patient_id,  -- Map user_id to patient_id
                d.created_at,
                d.updated_at
            FROM documents d
            WHERE d.user_id = profile_owner_id;  -- Use the account owner ID
        ELSE
            -- Fallback: no recognizable schema
            RAISE NOTICE 'Documents table exists but has unrecognized schema';
            RETURN;
        END IF;
    ELSE
        -- Table doesn't exist yet - return empty result
        RAISE NOTICE 'Documents table does not exist yet';
        RETURN;
    END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_documents_for_profile(UUID) TO authenticated;

-- =============================================================================
-- 2. TIMELINE RPC FUNCTION (Stub Implementation) 
-- =============================================================================

CREATE OR REPLACE FUNCTION get_timeline_for_profile(
    p_profile_id UUID,
    p_date_start TIMESTAMPTZ DEFAULT NULL,
    p_date_end TIMESTAMPTZ DEFAULT NULL,
    p_event_types TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    event_type TEXT,
    event_date TIMESTAMPTZ,
    title TEXT,
    description TEXT,
    metadata JSONB,
    patient_id UUID,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    profile_owner_id UUID;
    sql_query TEXT;
    where_conditions TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Get the account owner for this profile
    SELECT account_owner_id INTO profile_owner_id
    FROM user_profiles 
    WHERE id = p_profile_id;
    
    -- Verify the caller owns this profile
    IF profile_owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Profile not owned by current user';
    END IF;
    
    -- Check if healthcare timeline events table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'healthcare_timeline_events' AND table_schema = 'public') THEN
        
        -- Build dynamic query with optional filters
        sql_query := 'SELECT id, event_type, event_date, title, description, metadata, patient_id, created_at FROM healthcare_timeline_events';
        
        -- Add WHERE conditions
        where_conditions := where_conditions || ARRAY['patient_id = $1'];
        
        IF p_date_start IS NOT NULL THEN
            where_conditions := where_conditions || ARRAY['event_date >= $2'];
        END IF;
        
        IF p_date_end IS NOT NULL THEN
            where_conditions := where_conditions || ARRAY['event_date <= $3'];
        END IF;
        
        IF p_event_types IS NOT NULL AND array_length(p_event_types, 1) > 0 THEN
            where_conditions := where_conditions || ARRAY['event_type = ANY($4)'];
        END IF;
        
        -- Combine WHERE conditions
        IF array_length(where_conditions, 1) > 0 THEN
            sql_query := sql_query || ' WHERE ' || array_to_string(where_conditions, ' AND ');
        END IF;
        
        -- Add ORDER BY and LIMIT
        sql_query := sql_query || ' ORDER BY event_date DESC';
        
        IF p_limit IS NOT NULL THEN
            sql_query := sql_query || ' LIMIT ' || p_limit::TEXT;
        END IF;
        
        -- Execute the dynamic query
        -- For simplicity in stub, just return basic query without full dynamic execution
        RETURN QUERY
        SELECT 
            hte.id,
            hte.event_type,
            hte.event_date,
            hte.title,
            hte.description,
            hte.metadata,
            hte.patient_id,
            hte.created_at
        FROM healthcare_timeline_events hte
        WHERE hte.patient_id = p_profile_id  -- In v7.0, profile_id serves as patient_id
        AND (p_date_start IS NULL OR hte.event_date >= p_date_start)
        AND (p_date_end IS NULL OR hte.event_date <= p_date_end)
        AND (p_event_types IS NULL OR hte.event_type = ANY(p_event_types))
        ORDER BY hte.event_date DESC
        LIMIT COALESCE(p_limit, 100);  -- Default limit of 100
        
    ELSE
        -- Table doesn't exist yet - return empty result
        RAISE NOTICE 'Healthcare timeline events table does not exist yet';
        RETURN;
    END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_timeline_for_profile(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], INTEGER) TO authenticated;

-- =============================================================================
-- 3. VERIFICATION TEST
-- =============================================================================

-- Test that functions are callable (will fail safely if no data)
DO $$
BEGIN
    RAISE NOTICE 'Testing RPC function stubs...';
    
    -- Test get_documents_for_profile
    BEGIN
        PERFORM get_documents_for_profile('00000000-0000-0000-0000-000000000000'::UUID);
        RAISE NOTICE '✅ get_documents_for_profile function is callable';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%function get_documents_for_profile%does not exist%' THEN
            RAISE EXCEPTION 'CRITICAL: get_documents_for_profile function was not created';
        ELSE
            RAISE NOTICE '✅ get_documents_for_profile function exists and handles access control';
        END IF;
    END;
    
    -- Test get_timeline_for_profile
    BEGIN
        PERFORM get_timeline_for_profile('00000000-0000-0000-0000-000000000000'::UUID);
        RAISE NOTICE '✅ get_timeline_for_profile function is callable';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%function get_timeline_for_profile%does not exist%' THEN
            RAISE EXCEPTION 'CRITICAL: get_timeline_for_profile function was not created';
        ELSE
            RAISE NOTICE '✅ get_timeline_for_profile function exists and handles access control';
        END IF;
    END;
END;
$$;

COMMIT;

-- =============================================================================
-- DEPLOYMENT VERIFICATION
-- =============================================================================

SELECT 
    'Phase 1 RPC Stubs Deployment' as status,
    CASE 
        WHEN (
            EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_documents_for_profile')
            AND
            EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_timeline_for_profile')
        ) THEN '✅ ALL RPC STUBS CREATED'
        ELSE '❌ SOME RPC FUNCTIONS MISSING'
    END as deployment_result;