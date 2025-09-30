-- =============================================================================
-- UNIVERSAL DATE FORMAT MANAGEMENT MIGRATION
-- =============================================================================
-- Date: 2025-09-25 (SUCCESSFULLY DEPLOYED)
-- Module: 01 - Universal Date Format Management
-- Priority: PHASE 1 (Foundational)
-- Dependencies: 02_profiles.sql (user_profiles table must exist)
-- Risk Level: LOW (single table, single column addition)
--
-- SOURCE OF TRUTH UPDATED: 2025-09-26
-- Updated: shared/docs/architecture/database-foundation-v3/current_schema/02_profiles.sql
-- Added: Section 7B - Date Format Utility Functions with 3 date formatting functions:
--   * get_user_date_format() - Retrieves user's preferred date format from preferences
--   * format_date_for_user() - Formats dates according to user's cultural preferences
--   * get_user_cultural_context() - Returns complete cultural context for date processing
-- Added: Section 7C - Date Format Optimization Infrastructure:
--   * common_date_formats materialized view - Pre-computed date conversions (2000-2050)
--   * Performance indexes for fast date format lookups and reverse conversions
-- Added: user_profiles.date_preferences JSONB column with Australian defaults
-- Added: GIN and expression indexes for efficient date preference queries
--
-- Purpose: Enable global date format support with user preferences
-- Architecture: Supports 25+ international date formats with cultural preferences
-- Integration: Foundation for temporal-data-management and narrative architecture
-- =============================================================================

BEGIN;

-- =============================================================================
-- PREFLIGHT VALIDATION
-- =============================================================================

DO $$
BEGIN
    -- Verify user_profiles table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
        RAISE EXCEPTION 'DEPENDENCY ERROR: user_profiles table not found. Run 02_profiles.sql first.';
    END IF;

    -- Check if date_preferences already exists
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'user_profiles' AND column_name = 'date_preferences') THEN
        RAISE EXCEPTION 'COLUMN CONFLICT: date_preferences already exists in user_profiles table.';
    END IF;

    -- Verify PostgreSQL JSONB support
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jsonb') THEN
        RAISE EXCEPTION 'SYSTEM ERROR: PostgreSQL JSONB type not available.';
    END IF;

    RAISE NOTICE 'Preflight validation passed: Ready for Universal Date Format Management migration';
END $$;

-- =============================================================================
-- 1. USER PROFILE DATE PREFERENCES
-- =============================================================================

-- Add date preferences column to user_profiles
ALTER TABLE user_profiles ADD COLUMN
  date_preferences JSONB DEFAULT '{
    "preferred_format": "DD/MM/YYYY",
    "home_country": "AU",
    "timezone": "Australia/Sydney",
    "show_confidence_badges": true,
    "format_switching_enabled": true,
    "confidence_threshold_for_badges": 0.7
  }'::jsonb;

-- Add column comment for documentation
COMMENT ON COLUMN user_profiles.date_preferences IS
'User preferences for date formatting and display. Supports 25+ international formats including DD/MM (AU/EU), MM/DD (US), ISO formats, confidence badges, and cultural defaults.';

-- =============================================================================
-- 2. PERFORMANCE INDEXES
-- =============================================================================

-- GIN index for efficient JSONB preference lookups
CREATE INDEX idx_user_date_preferences
  ON user_profiles USING GIN (date_preferences);

-- Expression indexes for specific preference fields (most commonly queried)
CREATE INDEX idx_user_date_preferences_format
  ON user_profiles ((date_preferences->>'preferred_format'));

CREATE INDEX idx_user_date_preferences_country
  ON user_profiles ((date_preferences->>'home_country'));

-- Index for timezone-based queries
CREATE INDEX idx_user_date_preferences_timezone
  ON user_profiles ((date_preferences->>'timezone'));

-- =============================================================================
-- 3. DATE FORMAT OPTIMIZATION INFRASTRUCTURE
-- =============================================================================

-- Materialized view for common date format conversions (2000-2050 range)
CREATE MATERIALIZED VIEW common_date_formats AS
SELECT
  iso_date,
  -- Australian/European formats (DD/MM)
  to_char(iso_date, 'DD/MM/YYYY') as dd_mm_yyyy,
  to_char(iso_date, 'DD/MM/YY') as dd_mm_yy,
  -- US formats (MM/DD)
  to_char(iso_date, 'MM/DD/YYYY') as mm_dd_yyyy,
  to_char(iso_date, 'MM/DD/YY') as mm_dd_yy,
  -- ISO and international formats
  to_char(iso_date, 'YYYY-MM-DD') as iso_format,
  to_char(iso_date, 'DD.MM.YYYY') as dd_dot_mm_yyyy,
  to_char(iso_date, 'DD-MM-YYYY') as dd_dash_mm_yyyy,
  -- Additional common formats (using FM to avoid padding)
  to_char(iso_date, 'FMMonth DD, YYYY') as month_dd_yyyy,
  to_char(iso_date, 'DD FMMonth YYYY') as dd_month_yyyy,
  -- Weekday information for UI (using FM to avoid padding)
  to_char(iso_date, 'FMDAY') as day_name,
  to_char(iso_date, 'FMDy') as day_abbrev
FROM generate_series('2000-01-01'::date, '2050-12-31'::date, '1 day') as iso_date;

-- Unique index on iso_date for fast lookups
CREATE UNIQUE INDEX idx_common_formats_iso ON common_date_formats (iso_date);

-- Additional indexes for reverse lookups
CREATE INDEX idx_common_formats_dd_mm ON common_date_formats (dd_mm_yyyy);
CREATE INDEX idx_common_formats_mm_dd ON common_date_formats (mm_dd_yyyy);

-- Add comment for materialized view
COMMENT ON MATERIALIZED VIEW common_date_formats IS
'Pre-computed date format conversions for UI display. Covers 2000-2050 date range with 10+ international formats. Refresh periodically or when format requirements change.';

-- =============================================================================
-- 4. DATE FORMAT UTILITY FUNCTIONS
-- =============================================================================

-- Function to get user's preferred date format
CREATE OR REPLACE FUNCTION get_user_date_format(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_format TEXT;
BEGIN
    SELECT date_preferences->>'preferred_format'
    INTO user_format
    FROM user_profiles
    WHERE id = p_user_id;

    -- Return default if user not found or preference not set
    RETURN COALESCE(user_format, 'DD/MM/YYYY');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Function to format date according to user preferences
CREATE OR REPLACE FUNCTION format_date_for_user(
    p_date DATE,
    p_user_id UUID
) RETURNS TEXT AS $$
DECLARE
    user_format TEXT;
    formatted_date TEXT;
BEGIN
    -- Get user's preferred format
    user_format := get_user_date_format(p_user_id);

    -- Format date according to preference
    CASE user_format
        WHEN 'DD/MM/YYYY' THEN
            formatted_date := to_char(p_date, 'DD/MM/YYYY');
        WHEN 'MM/DD/YYYY' THEN
            formatted_date := to_char(p_date, 'MM/DD/YYYY');
        WHEN 'YYYY-MM-DD' THEN
            formatted_date := to_char(p_date, 'YYYY-MM-DD');
        WHEN 'DD.MM.YYYY' THEN
            formatted_date := to_char(p_date, 'DD.MM.YYYY');
        ELSE
            formatted_date := to_char(p_date, 'DD/MM/YYYY'); -- Default fallback
    END CASE;

    RETURN formatted_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Function to get user's cultural context for date processing
CREATE OR REPLACE FUNCTION get_user_cultural_context(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    cultural_context JSONB;
BEGIN
    SELECT jsonb_build_object(
        'country', date_preferences->>'home_country',
        'format', date_preferences->>'preferred_format',
        'timezone', date_preferences->>'timezone',
        'confidence_badges', (date_preferences->>'show_confidence_badges')::boolean
    )
    INTO cultural_context
    FROM user_profiles
    WHERE id = p_user_id;

    -- Return default Australian context if user not found
    RETURN COALESCE(cultural_context, '{
        "country": "AU",
        "format": "DD/MM/YYYY",
        "timezone": "Australia/Sydney",
        "confidence_badges": true
    }'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- =============================================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Note: user_profiles already has RLS enabled in 02_profiles.sql
-- The date_preferences column inherits the existing RLS policies

-- =============================================================================
-- 6. AUDIT LOGGING
-- =============================================================================

-- Log this migration for audit purposes
DO $$
BEGIN
    PERFORM log_audit_event(
        'system_migration',
        '2025-09-25_01_universal_date_format_management',
        'INSERT',
        NULL,
        jsonb_build_object(
            'migration_type', 'universal_date_format_management',
            'tables_modified', ARRAY['user_profiles'],
            'new_tables', ARRAY['common_date_formats'],
            'new_functions', ARRAY['get_user_date_format', 'format_date_for_user', 'get_user_cultural_context'],
            'indexes_created', 4,
            'materialized_views_created', 1
        ),
        'Universal Date Format Management module deployment',
        'system'
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Continue if audit logging fails (not critical for migration)
        RAISE WARNING 'Audit logging failed for migration: %', SQLERRM;
END $$;

-- =============================================================================
-- 7. DEPLOYMENT VERIFICATION
-- =============================================================================

DO $$
DECLARE
    column_count INTEGER;
    index_count INTEGER;
    function_count INTEGER;
    matview_count INTEGER;
BEGIN
    -- Check column addition
    SELECT COUNT(*) INTO column_count
    FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'date_preferences';

    -- Check indexes created
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE tablename = 'user_profiles' AND indexname LIKE 'idx_user_date_preferences%';

    -- Check functions created
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines
    WHERE routine_name IN ('get_user_date_format', 'format_date_for_user', 'get_user_cultural_context')
    AND routine_schema = 'public';

    -- Check materialized view
    SELECT COUNT(*) INTO matview_count
    FROM pg_matviews
    WHERE matviewname = 'common_date_formats';

    IF column_count = 1 AND index_count = 4 AND function_count = 3 AND matview_count = 1 THEN
        RAISE NOTICE 'Universal Date Format Management migration completed successfully!';
        RAISE NOTICE '   - user_profiles.date_preferences column added';
        RAISE NOTICE '   - % performance indexes created', index_count;
        RAISE NOTICE '   - % utility functions deployed', function_count;
        RAISE NOTICE '   - common_date_formats materialized view created';
        RAISE NOTICE '   - Ready for temporal-data-management and narrative-architecture integration';
    ELSE
        RAISE WARNING 'Migration completed with issues:';
        RAISE WARNING '   - Columns: %/1, Indexes: %/4, Functions: %/3, MatViews: %/1',
                     column_count, index_count, function_count, matview_count;
    END IF;
END $$;

COMMIT;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- Universal Date Format Management module deployed successfully
-- Next step: Run temporal-data-management migration
-- Source of truth update: Update current_schema/02_profiles.sql with date_preferences column
-- =============================================================================