-- Check the currently deployed version of enqueue_job_v3
-- This will show us what's actually in the database vs the schema file
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'enqueue_job_v3' 
AND routine_type = 'FUNCTION';