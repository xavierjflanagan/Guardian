-- ========================================
-- FIX API RATE LIMITING TIMESTAMP ISSUE
-- ========================================
-- Problem: Type mismatch in acquire_api_capacity function
-- Fix: Proper timestamp handling in minute reset logic

CREATE OR REPLACE FUNCTION acquire_api_capacity(
    p_provider_name TEXT,
    p_api_endpoint TEXT,
    p_estimated_tokens INTEGER DEFAULT 1000
) RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_time TIMESTAMPTZ := NOW();
    capacity_acquired BOOLEAN := FALSE;
    reset_needed BOOLEAN := FALSE;
BEGIN
    -- FIXED: Use proper timestamp comparison
    UPDATE api_rate_limits SET
        current_requests_minute = 0,
        current_tokens_minute = 0,
        minute_reset_at = current_time
    WHERE provider_name = p_provider_name 
    AND api_endpoint = p_api_endpoint 
    AND status = 'active'
    AND (current_time - minute_reset_at) > INTERVAL '1 minute';  -- FIXED: Proper timestamp subtraction
    
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
            last_rate_limit_hit = current_time,
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