-- =============================================================================
-- MIGRATION: Fix Rate Limiting Timestamp Variable Collision
-- =============================================================================
-- Date: 2025-09-03 12:00:00
-- Purpose: Fix PostgreSQL variable name collision in acquire_api_capacity function
-- Issue: Variable 'current_time' conflicts with PostgreSQL built-in CURRENT_TIME
-- Impact: Enables API rate limiting functionality for production scalability
-- 
-- SOURCE FILES UPDATED:
-- - current_schema/08_job_coordination.sql (acquire_api_capacity function, lines 379-412)
--
-- DEPLOYMENT STATUS: ✅ Applied to Supabase - 2025-09-03
-- =============================================================================

-- Fix acquire_api_capacity function with proper timestamp handling
CREATE OR REPLACE FUNCTION acquire_api_capacity(
    p_provider_name TEXT,
    p_api_endpoint TEXT,
    p_estimated_tokens INTEGER DEFAULT 1000
) RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Prevent search_path hijacking
AS $$
DECLARE
    current_timestamp_val TIMESTAMPTZ := NOW();  -- FIXED: Renamed to avoid collision with CURRENT_TIME built-in
    capacity_acquired BOOLEAN := FALSE;
    reset_needed BOOLEAN := FALSE;
BEGIN
    -- First, atomically reset counters if minute boundary crossed
    -- FIXED: Use renamed variable and proper parentheses for timestamp arithmetic
    UPDATE api_rate_limits SET
        current_requests_minute = 0,
        current_tokens_minute = 0,
        minute_reset_at = current_timestamp_val
    WHERE provider_name = p_provider_name 
    AND api_endpoint = p_api_endpoint 
    AND status = 'active'
    AND (current_timestamp_val - minute_reset_at) > INTERVAL '1 minute';  -- FIXED: Proper timestamp subtraction
    
    -- Atomic capacity acquisition in single UPDATE statement
    UPDATE api_rate_limits SET
        current_requests_minute = current_requests_minute + 1,
        current_tokens_minute = current_tokens_minute + p_estimated_tokens,
        active_requests = active_requests + 1
    WHERE provider_name = p_provider_name 
    AND api_endpoint = p_api_endpoint 
    AND status = 'active'
    -- Atomic capacity check conditions (NULL-safe)
    AND (current_requests_minute + 1 <= COALESCE(requests_per_minute, 999999))
    AND (current_tokens_minute + p_estimated_tokens <= COALESCE(tokens_per_minute, 999999))
    AND (active_requests < COALESCE(concurrent_requests, 999999));
    
    -- Check if capacity was acquired (row was updated)
    capacity_acquired := FOUND;
    
    IF NOT capacity_acquired THEN
        -- Rate limit exceeded - log the violation atomically
        UPDATE api_rate_limits SET 
            last_rate_limit_hit = current_timestamp_val,
            rate_limit_violations = rate_limit_violations + 1
        WHERE provider_name = p_provider_name 
        AND api_endpoint = p_api_endpoint 
        AND status = 'active';
        
        -- Check if config exists at all
        IF NOT FOUND THEN
            RAISE EXCEPTION 'No active rate limit configuration for %:%', p_provider_name, p_api_endpoint;
        END IF;
        
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- Ensure proper permissions (same as original)
REVOKE EXECUTE ON FUNCTION acquire_api_capacity(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_api_capacity(text, text, integer) TO service_role;