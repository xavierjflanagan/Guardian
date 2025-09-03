-- ========================================
-- SAFE API RATE LIMITING TEST (NO DB CHANGES)
-- ========================================
-- Test the rate limiting without modifying functions

-- Step 1: Check if OpenAI config exists
SELECT 
    provider_name,
    api_endpoint,
    requests_per_minute,
    tokens_per_minute,
    current_requests_minute,
    current_tokens_minute,
    active_requests,
    status
FROM api_rate_limits 
WHERE provider_name = 'openai' AND api_endpoint = 'gpt-4o-mini';

-- Step 2: Try a minimal capacity test (small token amount)
-- If this fails, we know it's a function bug we need to report
SELECT acquire_api_capacity(
    p_provider_name := 'openai',
    p_api_endpoint := 'gpt-4o-mini', 
    p_estimated_tokens := 1  -- Minimal test
);