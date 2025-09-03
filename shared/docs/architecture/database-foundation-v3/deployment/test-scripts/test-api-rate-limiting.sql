-- ========================================
-- V3 API RATE LIMITING TEST SCRIPT  
-- ========================================
-- Purpose: Test the API rate limiting system
-- Expected: Rate limits are enforced and capacity is managed

-- Step 1: Check current API rate limit configuration
SELECT 
    provider_name,
    api_endpoint,
    requests_per_minute,
    tokens_per_minute,
    current_requests_minute,
    current_tokens_minute,
    status
FROM api_rate_limits 
WHERE provider_name = 'openai' AND api_endpoint = 'gpt-4o-mini';

-- Step 2: Test API capacity acquisition (check if function has p_ prefix)
-- Note: Based on V3 schema, functions might use p_ parameter naming
SELECT acquire_api_capacity(
    p_provider_name := 'openai',
    p_api_endpoint := 'gpt-4o-mini', 
    p_estimated_tokens := 500
);

-- Step 3: Check capacity was acquired (should see increments)
SELECT 
    current_requests_minute,
    current_tokens_minute,
    active_requests
FROM api_rate_limits 
WHERE provider_name = 'openai' AND api_endpoint = 'gpt-4o-mini';

-- Step 4: Release API capacity (using named parameters for safety)
SELECT release_api_capacity(
    p_provider_name := 'openai',
    p_api_endpoint := 'gpt-4o-mini',
    p_estimated_tokens := 500,
    p_actual_tokens := 450
);

-- Step 5: Verify capacity was released (active_requests should decrease)
SELECT 
    current_requests_minute,
    current_tokens_minute, 
    active_requests
FROM api_rate_limits 
WHERE provider_name = 'openai' AND api_endpoint = 'gpt-4o-mini';