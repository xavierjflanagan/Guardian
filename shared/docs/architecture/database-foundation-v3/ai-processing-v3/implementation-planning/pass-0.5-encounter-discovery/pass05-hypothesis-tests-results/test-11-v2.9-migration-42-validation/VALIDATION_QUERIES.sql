-- ============================================================================
-- Test 11: v2.9 Migration 42 Validation Queries
-- Date: 2025-11-06
-- Purpose: Comprehensive validation queries for Migration 42 schema changes
-- ============================================================================

-- Test File ID: 50ecbff9-97db-4966-8362-8ceba2c19f5e
-- Filename: 006_Emma_Thompson_Frankenstein_Progress_note_Emergency_summary.pdf

-- ============================================================================
-- SECTION 1: Schema Validation
-- ============================================================================

-- Query 1.1: Verify new columns exist with correct constraints
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'healthcare_encounters'
  AND column_name IN (
    'encounter_start_date',         -- Renamed from encounter_date
    'encounter_timeframe_status',   -- New v2.9 column
    'date_source'                   -- New v2.9 column (Migration 38/42)
  )
ORDER BY column_name;

-- Expected Results:
-- encounter_start_date: timestamp with time zone, YES (nullable), NULL
-- encounter_timeframe_status: text, NO (not nullable), 'completed'::text
-- date_source: text, NO (not nullable), 'upload_date'::text


-- Query 1.2: Verify old column name is gone
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'healthcare_encounters'
  AND column_name = 'encounter_date';

-- Expected Results: 0 rows (column renamed successfully)


-- Query 1.3: Verify CHECK constraints exist
SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND (constraint_name LIKE '%healthcare_encounters%timeframe%'
       OR constraint_name LIKE '%healthcare_encounters%date_source%')
ORDER BY constraint_name;

-- Expected Results: 2 constraints
-- 1. encounter_timeframe_status CHECK (status IN ('completed', 'ongoing', 'unknown_end_date'))
-- 2. date_source CHECK (source IN ('ai_extracted', 'file_metadata', 'upload_date'))


-- Query 1.4: Verify redundant columns removed
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'healthcare_encounters'
  AND column_name IN ('visit_duration_minutes', 'confidence_score', 'ai_confidence');

-- Expected Results: 0 rows (all three columns dropped successfully)


-- Query 1.5: Verify index renamed correctly
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'healthcare_encounters'
  AND indexname LIKE '%encounter%date%';

-- Expected Results: idx_encounters_start_date (not idx_encounters_date)


-- ============================================================================
-- SECTION 2: Test File Processing Validation
-- ============================================================================

-- Query 2.1: Get test file details
SELECT
  id,
  original_filename,
  page_count,
  created_at
FROM shell_files
WHERE id = '50ecbff9-97db-4966-8362-8ceba2c19f5e';

-- Expected Results: 1 row with 20-page PDF


-- Query 2.2: Get manifest with pass_0_5_version
SELECT
  shell_file_id,
  total_pages,
  pass_0_5_version,
  created_at
FROM shell_file_manifests
WHERE shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e';

-- Expected Results: pass_0_5_version = 'v2.9'


-- Query 2.3: Get encounter count for test file
SELECT COUNT(*) as encounter_count
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e';

-- Expected Results: 2 encounters (Frankenstein file)


-- ============================================================================
-- SECTION 3: v2.9 Column Population Validation
-- ============================================================================

-- Query 3.1: Full v2.9 column validation
SELECT
  id,
  encounter_type,
  encounter_start_date,
  encounter_date_end,
  encounter_timeframe_status,
  date_source,
  is_real_world_visit,
  provider_name,
  facility_name,
  summary,
  page_ranges,
  pass_0_5_confidence,
  created_at
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e'
ORDER BY encounter_start_date;

-- Expected Results: 2 encounters
-- Encounter 1 (2025-06-22): ER visit, completed, ai_extracted
-- Encounter 2 (2025-10-27): Specialist, completed, ai_extracted


-- Query 3.2: Validate encounter_timeframe_status values
SELECT
  encounter_type,
  encounter_timeframe_status,
  COUNT(*) as count
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e'
GROUP BY encounter_type, encounter_timeframe_status;

-- Expected Results:
-- emergency_department, completed, 1
-- specialist_consultation, completed, 1


-- Query 3.3: Validate date_source values
SELECT
  encounter_type,
  date_source,
  COUNT(*) as count
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e'
GROUP BY encounter_type, date_source;

-- Expected Results:
-- emergency_department, ai_extracted, 1
-- specialist_consultation, ai_extracted, 1


-- ============================================================================
-- SECTION 4: Single-Day Encounter Logic Validation
-- ============================================================================

-- Query 4.1: Verify single-day encounters have explicit end dates
SELECT
  encounter_type,
  encounter_start_date,
  encounter_date_end,
  encounter_start_date = encounter_date_end AS is_same_day,
  encounter_timeframe_status
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e'
ORDER BY encounter_start_date;

-- Expected Results: Both encounters should have is_same_day = true


-- Query 4.2: Verify no NULL end dates for completed encounters
SELECT
  encounter_type,
  encounter_date_end,
  encounter_timeframe_status
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e'
  AND encounter_timeframe_status = 'completed'
  AND encounter_date_end IS NULL;

-- Expected Results: 0 rows (all completed encounters have end dates)


-- ============================================================================
-- SECTION 5: Data Quality Validation
-- ============================================================================

-- Query 5.1: Verify all encounters have required fields populated
SELECT
  id,
  encounter_type,
  encounter_start_date IS NOT NULL AS has_start_date,
  encounter_timeframe_status IS NOT NULL AS has_status,
  date_source IS NOT NULL AS has_date_source,
  is_real_world_visit IS NOT NULL AS has_real_world_flag
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e';

-- Expected Results: All columns should be true


-- Query 5.2: Verify provider and facility populated for real-world visits
SELECT
  encounter_type,
  is_real_world_visit,
  provider_name IS NOT NULL AS has_provider,
  facility_name IS NOT NULL AS has_facility
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e'
  AND is_real_world_visit = true;

-- Expected Results: Both encounters should have provider and facility


-- Query 5.3: Verify summary quality
SELECT
  encounter_type,
  LENGTH(summary) AS summary_length,
  summary
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e'
ORDER BY encounter_start_date;

-- Expected Results: Both summaries should be >50 characters with good quality


-- ============================================================================
-- SECTION 6: Page Assignment Validation
-- ============================================================================

-- Query 6.1: Verify page ranges coverage
SELECT
  encounter_type,
  page_ranges,
  array_length(page_ranges, 1) AS num_page_ranges
FROM healthcare_encounters
WHERE primary_shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e'
ORDER BY encounter_start_date;

-- Expected Results:
-- emergency_department: [[14,20]], 1 range
-- specialist_consultation: [[1,13]], 1 range


-- Query 6.2: Get page assignments from manifest
SELECT
  (manifest_data->'page_assignments')::jsonb AS page_assignments
FROM shell_file_manifests
WHERE shell_file_id = '50ecbff9-97db-4966-8362-8ceba2c19f5e';

-- Expected Results: 20 page assignments with justifications


-- ============================================================================
-- SECTION 7: Aggregate Validation (All v2.9 Records)
-- ============================================================================

-- Query 7.1: Count all v2.9 processed files
SELECT COUNT(DISTINCT shell_file_id) as v2_9_file_count
FROM shell_file_manifests
WHERE pass_0_5_version = 'v2.9';

-- Expected Results: >=1 (at least our test file)


-- Query 7.2: Aggregate v2.9 encounter statistics
SELECT
  encounter_timeframe_status,
  date_source,
  COUNT(*) as count
FROM healthcare_encounters
WHERE primary_shell_file_id IN (
  SELECT shell_file_id
  FROM shell_file_manifests
  WHERE pass_0_5_version = 'v2.9'
)
GROUP BY encounter_timeframe_status, date_source
ORDER BY count DESC;

-- Expected Results: Distribution of timeframe status and date source


-- Query 7.3: Validate no NULL values in new required columns
SELECT COUNT(*) as null_count
FROM healthcare_encounters
WHERE primary_shell_file_id IN (
  SELECT shell_file_id
  FROM shell_file_manifests
  WHERE pass_0_5_version = 'v2.9'
)
AND (encounter_timeframe_status IS NULL OR date_source IS NULL);

-- Expected Results: 0 (no NULL values allowed)


-- ============================================================================
-- SECTION 8: Comparison Queries (v2.8 vs v2.9)
-- ============================================================================

-- Query 8.1: Compare encounter counts by version
SELECT
  pass_0_5_version,
  COUNT(DISTINCT m.shell_file_id) as file_count,
  COUNT(e.id) as encounter_count
FROM shell_file_manifests m
LEFT JOIN healthcare_encounters e ON e.primary_shell_file_id = m.shell_file_id
WHERE pass_0_5_version IN ('v2.8', 'v2.9')
GROUP BY pass_0_5_version;


-- Query 8.2: Identify files needing reprocessing (v2.8 → v2.9)
SELECT
  sf.id,
  sf.original_filename,
  sf.page_count,
  m.pass_0_5_version
FROM shell_files sf
JOIN shell_file_manifests m ON m.shell_file_id = sf.id
WHERE m.pass_0_5_version = 'v2.8'
ORDER BY sf.created_at DESC
LIMIT 10;

-- Note: These files could be reprocessed with v2.9 if needed


-- ============================================================================
-- SECTION 9: Performance Validation
-- ============================================================================

-- Query 9.1: Check index usage on new column
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM healthcare_encounters
WHERE patient_id = 'd1dbe18c-afc2-421f-bd58-145ddb48cbca'
  AND encounter_start_date > '2025-01-01'
ORDER BY encounter_start_date DESC;

-- Expected: Index scan on idx_encounters_start_date


-- Query 9.2: Verify no performance degradation
SELECT
  m.pass_0_5_version,
  AVG(EXTRACT(EPOCH FROM (m.created_at - sf.created_at))) AS avg_processing_time_seconds
FROM shell_file_manifests m
JOIN shell_files sf ON sf.id = m.shell_file_id
WHERE m.pass_0_5_version IN ('v2.8', 'v2.9')
  AND m.created_at > NOW() - INTERVAL '7 days'
GROUP BY m.pass_0_5_version;

-- Expected: Similar processing times for v2.8 and v2.9


-- ============================================================================
-- SECTION 10: Edge Case Validation
-- ============================================================================

-- Query 10.1: Check for any encounters with unusual timeframe status combinations
SELECT
  encounter_timeframe_status,
  encounter_date_end IS NULL AS has_null_end,
  COUNT(*) as count
FROM healthcare_encounters
WHERE primary_shell_file_id IN (
  SELECT shell_file_id
  FROM shell_file_manifests
  WHERE pass_0_5_version = 'v2.9'
)
GROUP BY encounter_timeframe_status, has_null_end;

-- Expected patterns:
-- completed: has_null_end = false (should have end date)
-- ongoing: has_null_end = true (no end date yet)
-- unknown_end_date: has_null_end = true (uncertain)


-- Query 10.2: Identify any data quality issues
SELECT
  e.id,
  e.encounter_type,
  e.encounter_start_date,
  e.encounter_date_end,
  e.encounter_timeframe_status,
  e.date_source
FROM healthcare_encounters e
WHERE e.primary_shell_file_id IN (
  SELECT shell_file_id
  FROM shell_file_manifests
  WHERE pass_0_5_version = 'v2.9'
)
AND (
  -- Completed but no end date
  (e.encounter_timeframe_status = 'completed' AND e.encounter_date_end IS NULL)
  -- Ongoing but has end date
  OR (e.encounter_timeframe_status = 'ongoing' AND e.encounter_date_end IS NOT NULL)
  -- End date before start date
  OR (e.encounter_date_end < e.encounter_start_date)
  -- Real-world visit without AI-extracted date
  OR (e.is_real_world_visit = true AND e.date_source != 'ai_extracted')
);

-- Expected Results: 0 rows (no data quality issues)


-- ============================================================================
-- END OF VALIDATION QUERIES
-- ============================================================================
