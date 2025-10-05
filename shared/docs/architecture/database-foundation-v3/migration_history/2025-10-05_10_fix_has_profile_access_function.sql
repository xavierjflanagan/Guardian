-- =============================================================================
-- FIX has_profile_access FUNCTION - Remove access_status column reference
-- =============================================================================
-- DATE: 2025-10-05
-- ISSUE: Production database has outdated has_profile_access function that
--        references non-existent access_status column, causing 400 errors
-- ERROR: column "access_status" does not exist
-- ROOT CAUSE: Database created from old schema version before function was fixed
-- SOURCE OF TRUTH: Already correct in current_schema/02_profiles.sql (lines 438-478)
-- FIX: Update production database functions to match source of truth
--      (uses revoked_at IS NULL instead of access_status = 'granted')
-- =============================================================================

-- Fix has_profile_access function (simple ownership check)
CREATE OR REPLACE FUNCTION has_profile_access(p_user_id UUID, p_profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = p_profile_id
        AND account_owner_id = p_user_id
        AND archived = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Fix has_profile_access_level function (delegation check)
CREATE OR REPLACE FUNCTION has_profile_access_level(p_user_id UUID, p_profile_id UUID, p_required_level TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- First check direct ownership (highest access)
    IF has_profile_access(p_user_id, p_profile_id) THEN
        RETURN TRUE;
    END IF;

    -- Then check explicit permissions using whitelist
    RETURN EXISTS (
        SELECT 1 FROM profile_access_permissions pap
        WHERE pap.user_id = p_user_id
        AND pap.profile_id = p_profile_id
        AND pap.permission_level::TEXT = ANY(
            CASE p_required_level
                WHEN 'emergency' THEN ARRAY['emergency', 'read_only', 'read_write', 'full_access', 'owner']
                WHEN 'read_only' THEN ARRAY['read_only', 'read_write', 'full_access', 'owner']
                WHEN 'read_write' THEN ARRAY['read_write', 'full_access', 'owner']
                WHEN 'full_access' THEN ARRAY['full_access', 'owner']
                WHEN 'owner' THEN ARRAY['owner']
                ELSE ARRAY[]::TEXT[]
            END
        )
        AND (pap.access_end_date IS NULL OR pap.access_end_date > NOW())
        AND pap.revoked_at IS NULL  -- ✅ FIXED: Use revoked_at instead of access_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Test the function works correctly:
-- SELECT has_profile_access(auth.uid(), auth.uid()) as should_be_true;
--
-- Verify no access_status references remain:
-- SELECT prosrc FROM pg_proc WHERE proname = 'has_profile_access';
-- =============================================================================
