-- ⚠️  DOCUMENTATION REFERENCE COPY - DO NOT EDIT
-- 📍 SINGLE SOURCE OF TRUTH: /supabase/migrations/001_extensions.sql
-- 🔄 This file is for architectural documentation only
-- ✏️  All changes must be made in /supabase/migrations/ directory
-- 
-- PostgreSQL Extensions Setup
-- Guardian v7 Implementation - Step 0
-- File: 000_extensions.sql

BEGIN;

-- Core extensions required for Guardian architecture
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Fuzzy string matching for relationship normalization
CREATE EXTENSION IF NOT EXISTS "postgis";        -- Spatial data for bounding box operations
CREATE EXTENSION IF NOT EXISTS "pg_partman";     -- Automated partition management
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Enhanced cryptographic functions

-- Performance and text search extensions
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance monitoring
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- Enhanced GIN indexing capabilities

-- Verify all extensions are installed
DO $$
DECLARE
    extension_record RECORD;
    expected_extensions TEXT[] := ARRAY['uuid-ossp', 'pg_trgm', 'postgis', 'pg_partman', 'pgcrypto', 'pg_stat_statements', 'btree_gin'];
    installed_count INTEGER := 0;
BEGIN
    FOR extension_record IN 
        SELECT extname FROM pg_extension 
        WHERE extname = ANY(expected_extensions)
    LOOP
        installed_count := installed_count + 1;
        RAISE NOTICE 'Extension installed: %', extension_record.extname;
    END LOOP;
    
    IF installed_count = array_length(expected_extensions, 1) THEN
        RAISE NOTICE 'All required extensions successfully installed!';
    ELSE
        RAISE WARNING 'Only % of % expected extensions installed', installed_count, array_length(expected_extensions, 1);
    END IF;
END;
$$;

COMMIT;

-- Success message
\echo 'PostgreSQL extensions setup complete!'
\echo 'Next step: Run 001_feature_flags.sql'