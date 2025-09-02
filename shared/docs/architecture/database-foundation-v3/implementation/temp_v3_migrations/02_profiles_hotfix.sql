-- =============================================================================
-- 02_PROFILES_HOTFIX.SQL - GPT-5 Security Hardening
-- =============================================================================
-- PURPOSE: Apply critical security fixes to 02_profiles.sql (v1.0 → v1.1)
-- DATE: September 2, 2025
-- DEPLOYMENT: Run this script against Supabase to apply hotfixes
--
-- FIXES APPLIED:
-- 1. Guarded audit_log.patient_id column addition with existence check
-- 2. Added WITH CHECK clauses to all FOR ALL policies (8 policies)
-- 3. Added search_path security to profile access functions
-- =============================================================================

BEGIN;

-- =============================================================================
-- FIX 1: Guard audit_log.patient_id column addition (idempotent)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_log' 
        AND column_name = 'patient_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE audit_log ADD COLUMN patient_id UUID REFERENCES user_profiles(id);
        
        -- Add performance index
        CREATE INDEX idx_audit_log_patient ON audit_log(patient_id) WHERE patient_id IS NOT NULL;
        
        RAISE NOTICE 'Added audit_log.patient_id column and index';
    ELSE
        RAISE NOTICE 'audit_log.patient_id column already exists, skipping';
    END IF;
END $$;

-- =============================================================================
-- FIX 2: Add WITH CHECK clauses to all FOR ALL policies
-- =============================================================================

-- Drop and recreate policies with WITH CHECK clauses
DROP POLICY IF EXISTS user_profiles_owner_access ON user_profiles;
CREATE POLICY user_profiles_owner_access ON user_profiles
    FOR ALL USING (account_owner_id = auth.uid() AND archived IS NOT TRUE)
    WITH CHECK (account_owner_id = auth.uid() AND archived IS NOT TRUE);

DROP POLICY IF EXISTS profile_access_permissions_owner ON profile_access_permissions;
CREATE POLICY profile_access_permissions_owner ON profile_access_permissions
    FOR ALL USING (
        has_profile_access(auth.uid(), profile_access_permissions.profile_id)
        OR user_id = auth.uid()
    )
    WITH CHECK (
        has_profile_access(auth.uid(), profile_access_permissions.profile_id)
        OR user_id = auth.uid()
    );

DROP POLICY IF EXISTS user_profile_context_owner ON user_profile_context;
CREATE POLICY user_profile_context_owner ON user_profile_context
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS smart_health_features_access ON smart_health_features;
CREATE POLICY smart_health_features_access ON smart_health_features
    FOR ALL USING (has_profile_access(auth.uid(), smart_health_features.profile_id))
    WITH CHECK (has_profile_access(auth.uid(), smart_health_features.profile_id));

DROP POLICY IF EXISTS pregnancy_journey_events_access ON pregnancy_journey_events;
CREATE POLICY pregnancy_journey_events_access ON pregnancy_journey_events
    FOR ALL USING (has_profile_access(auth.uid(), pregnancy_journey_events.profile_id))
    WITH CHECK (has_profile_access(auth.uid(), pregnancy_journey_events.profile_id));

DROP POLICY IF EXISTS profile_detection_patterns_owner ON profile_detection_patterns;
CREATE POLICY profile_detection_patterns_owner ON profile_detection_patterns
    FOR ALL USING (has_profile_access(auth.uid(), profile_detection_patterns.profile_id))
    WITH CHECK (has_profile_access(auth.uid(), profile_detection_patterns.profile_id));

DROP POLICY IF EXISTS profile_auth_progression_owner ON profile_auth_progression;
CREATE POLICY profile_auth_progression_owner ON profile_auth_progression
    FOR ALL USING (has_profile_access(auth.uid(), profile_auth_progression.profile_id))
    WITH CHECK (has_profile_access(auth.uid(), profile_auth_progression.profile_id));

DROP POLICY IF EXISTS profile_appointments_owner ON profile_appointments;
CREATE POLICY profile_appointments_owner ON profile_appointments
    FOR ALL USING (account_owner_id = auth.uid())
    WITH CHECK (account_owner_id = auth.uid());

-- =============================================================================
-- FIX 3: Add search_path security to profile access functions
-- =============================================================================

-- Update has_profile_access function
CREATE OR REPLACE FUNCTION has_profile_access(p_user_id UUID, p_profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user owns the profile directly
    IF EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = p_profile_id 
        AND account_owner_id = p_user_id 
        AND archived IS NOT TRUE
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- Check for explicit access permissions
    IF EXISTS (
        SELECT 1 FROM profile_access_permissions 
        WHERE profile_id = p_profile_id 
        AND user_id = p_user_id 
        AND access_status = 'granted'
        AND (expires_at IS NULL OR expires_at > NOW())
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- Admin access
    IF is_admin(p_user_id) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Update has_profile_access_level function
CREATE OR REPLACE FUNCTION has_profile_access_level(p_user_id UUID, p_profile_id UUID, p_required_level TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_access_level TEXT;
BEGIN
    -- Check if user has any access first
    IF NOT has_profile_access(p_user_id, p_profile_id) THEN
        RETURN FALSE;
    END IF;
    
    -- Get user's access level for this profile
    SELECT access_level INTO user_access_level
    FROM profile_access_permissions 
    WHERE profile_id = p_profile_id 
    AND user_id = p_user_id 
    AND access_status = 'granted'
    AND (expires_at IS NULL OR expires_at > NOW());
    
    -- If no explicit access level, check if owner (full access)
    IF user_access_level IS NULL AND EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = p_profile_id 
        AND account_owner_id = p_user_id 
        AND archived IS NOT TRUE
    ) THEN
        user_access_level := 'full';
    END IF;
    
    -- Admin always has full access
    IF is_admin(p_user_id) THEN
        user_access_level := 'full';
    END IF;
    
    -- Check access level hierarchy: full > write > read
    RETURN CASE 
        WHEN p_required_level = 'read' THEN user_access_level IN ('read', 'write', 'full')
        WHEN p_required_level = 'write' THEN user_access_level IN ('write', 'full')
        WHEN p_required_level = 'full' THEN user_access_level = 'full'
        ELSE FALSE
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Update get_accessible_profiles function
CREATE OR REPLACE FUNCTION get_accessible_profiles(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE(profile_id UUID, access_type TEXT, relationship TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    -- Directly owned profiles
    SELECT 
        up.id,
        'owner'::TEXT as access_type,
        'self'::TEXT as relationship
    FROM user_profiles up
    WHERE up.account_owner_id = p_user_id 
    AND up.archived IS NOT TRUE
    
    UNION ALL
    
    -- Shared profiles via permissions
    SELECT 
        pap.profile_id,
        pap.access_level as access_type,
        pap.relationship_type as relationship
    FROM profile_access_permissions pap
    WHERE pap.user_id = p_user_id 
    AND pap.access_status = 'granted'
    AND (pap.expires_at IS NULL OR pap.expires_at > NOW());
END;
$$;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '02_profiles_hotfix.sql completed successfully';
    RAISE NOTICE 'Applied fixes: audit_log column guard, WITH CHECK clauses, search_path security';
    RAISE NOTICE 'Updated 8 policies with proper write restrictions';
    RAISE NOTICE 'Source file updated to v1.1 for future deployments';
END $$;