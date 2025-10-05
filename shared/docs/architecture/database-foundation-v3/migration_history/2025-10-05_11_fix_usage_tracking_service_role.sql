-- =============================================================================
-- FIX track_shell_file_upload_usage - Support service role context
-- =============================================================================
-- DATE: 2025-10-05
-- ISSUE: track_shell_file_upload_usage uses auth.uid() which returns NULL
--        in Edge Function (service role) context
-- ERROR: Unauthorized: User <NULL> cannot access profile {uuid}
-- ROOT CAUSE: Function assumes authenticated user context, but Edge Functions
--             use service role without auth.uid()
-- SOURCE OF TRUTH: Updated in current_schema/08_job_coordination.sql (lines 859-941)
-- FIX: Add optional p_user_id parameter, skip auth check for service role calls
-- =============================================================================

CREATE OR REPLACE FUNCTION track_shell_file_upload_usage(
    p_profile_id UUID,
    p_shell_file_id UUID,
    p_file_size_bytes BIGINT,
    p_estimated_pages INTEGER DEFAULT 1,
    p_user_id UUID DEFAULT NULL  -- NEW: Optional for service role calls
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    usage_record RECORD;
    file_size_mb NUMERIC(10,2);
    limits_exceeded BOOLEAN := FALSE;
    tracking_enabled BOOLEAN := FALSE;
    actual_file_size BIGINT;
    caller_user_id UUID;
BEGIN
    -- Determine caller: use provided p_user_id (service role) or auth.uid() (user context)
    caller_user_id := COALESCE(p_user_id, auth.uid());

    -- SECURITY GUARD: Verify caller has access to profile (skip if service role with no user)
    IF caller_user_id IS NOT NULL AND NOT has_profile_access(caller_user_id, p_profile_id) THEN
        RAISE EXCEPTION 'Unauthorized: User % cannot access profile %', caller_user_id, p_profile_id;
    END IF;

    -- Fetch actual file size from database
    SELECT file_size_bytes INTO actual_file_size
    FROM shell_files WHERE id = p_shell_file_id;

    -- Use database file size if available
    p_file_size_bytes := COALESCE(actual_file_size, p_file_size_bytes);

    -- Check if usage tracking is enabled
    SELECT value::boolean INTO tracking_enabled
    FROM system_config
    WHERE key = 'usage_tracking_enabled';

    tracking_enabled := COALESCE(tracking_enabled, TRUE);

    -- Skip tracking if disabled
    IF NOT tracking_enabled THEN
        RETURN jsonb_build_object(
            'success', true,
            'tracking_enabled', false,
            'message', 'Usage tracking is disabled'
        );
    END IF;

    -- Convert bytes to MB
    file_size_mb := p_file_size_bytes / 1048576.0;

    -- Insert usage record
    INSERT INTO usage_tracking (
        profile_id,
        usage_type,
        resource_type,
        resource_id,
        quantity,
        unit,
        metadata
    ) VALUES (
        p_profile_id,
        'upload',
        'shell_file',
        p_shell_file_id,
        file_size_mb,
        'MB',
        jsonb_build_object(
            'file_size_bytes', p_file_size_bytes,
            'estimated_pages', p_estimated_pages,
            'tracked_by', COALESCE(caller_user_id::text, 'service_role')
        )
    ) RETURNING * INTO usage_record;

    RETURN jsonb_build_object(
        'success', true,
        'tracking_enabled', true,
        'usage_id', usage_record.id,
        'profile_id', p_profile_id,
        'file_size_mb', file_size_mb,
        'limits_exceeded', limits_exceeded
    );
END;
$$;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Test with service role context (no p_user_id):
-- SELECT track_shell_file_upload_usage(
--     'profile-uuid'::uuid,
--     'file-uuid'::uuid,
--     1048576,
--     1,
--     NULL  -- Service role call
-- );
-- =============================================================================
