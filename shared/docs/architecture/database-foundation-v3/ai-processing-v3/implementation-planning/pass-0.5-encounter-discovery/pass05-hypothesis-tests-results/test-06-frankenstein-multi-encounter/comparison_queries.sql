-- Test 06 v2.1: Comparison Queries
-- Purpose: Compare boundary detection between v1 (original) and v2.1 (improved prompt)
-- Date: November 2, 2025

---------------------------------------------------
-- STEP 1: Find Shell File IDs
---------------------------------------------------

-- Get both v1 and v2.1 test files
SELECT
  sf.id as shell_file_id,
  sf.filename,
  sf.created_at,
  sf.pass_0_5_completed,
  sf.pass_0_5_completed_at,
  COUNT(he.id) as encounter_count
FROM shell_files sf
LEFT JOIN healthcare_encounters he ON he.primary_shell_file_id = sf.id
WHERE sf.patient_id = 'd1dbe18c-afc2-421f-bd58-145ddb48cbca'
  AND sf.filename LIKE '%Frankenstein%'
GROUP BY sf.id, sf.filename, sf.created_at, sf.pass_0_5_completed, sf.pass_0_5_completed_at
ORDER BY sf.created_at DESC
LIMIT 5;

-- Expected output:
-- Row 1: v2.1 test (newest, created after 10:35:34 AM UTC)
-- Row 2: v1 test (e4a19fe4-bf22-4c7a-b915-e0cf2b278c21, 09:18:59 AM UTC)

---------------------------------------------------
-- STEP 2: Compare Encounter Detection
---------------------------------------------------

-- Replace <V2_1_SHELL_FILE_ID> with actual ID from Step 1
WITH v1_encounters AS (
  SELECT
    'v1' as prompt_version,
    he.id as encounter_id,
    he.encounter_type,
    he.page_ranges,
    he.provider_name,
    he.facility_name,
    he.encounter_date,
    he.confidence,
    he.is_real_visit
  FROM healthcare_encounters he
  WHERE he.primary_shell_file_id = 'e4a19fe4-bf22-4c7a-b915-e0cf2b278c21'
  ORDER BY (he.page_ranges::jsonb->0->>0)::int
),
v2_1_encounters AS (
  SELECT
    'v2.1' as prompt_version,
    he.id as encounter_id,
    he.encounter_type,
    he.page_ranges,
    he.provider_name,
    he.facility_name,
    he.encounter_date,
    he.confidence,
    he.is_real_visit
  FROM healthcare_encounters he
  WHERE he.primary_shell_file_id = '<V2_1_SHELL_FILE_ID>'
  ORDER BY (he.page_ranges::jsonb->0->>0)::int
)
SELECT * FROM v1_encounters
UNION ALL
SELECT * FROM v2_1_encounters
ORDER BY prompt_version, (page_ranges::jsonb->0->>0)::int;

-- Expected v1 results:
-- Encounter 1: specialist_consultation, pages [[1,11]], Mara B Ehret
-- Encounter 2: emergency_department, pages [[12,20]], Matthew T Tinkham

-- Expected v2.1 results (if fix works):
-- Encounter 1: specialist_consultation, pages [[1,13]], Mara B Ehret ← IMPROVED
-- Encounter 2: emergency_department, pages [[14,20]], Matthew T Tinkham ← IMPROVED

---------------------------------------------------
-- STEP 3: Compare Processing Metrics
---------------------------------------------------

-- Replace <V2_1_SHELL_FILE_ID> with actual ID
SELECT
  CASE
    WHEN shell_file_id = 'e4a19fe4-bf22-4c7a-b915-e0cf2b278c21' THEN 'v1'
    ELSE 'v2.1'
  END as prompt_version,
  shell_file_id,
  total_processing_time_seconds,
  encounter_count_detected,
  model_used,
  prompt_strategy,
  input_tokens,
  output_tokens,
  processing_cost_usd,
  created_at as test_timestamp
FROM pass05_encounter_metrics
WHERE shell_file_id IN (
  'e4a19fe4-bf22-4c7a-b915-e0cf2b278c21',  -- v1
  '<V2_1_SHELL_FILE_ID>'                   -- v2.1
)
ORDER BY created_at;

---------------------------------------------------
-- STEP 4: Detailed Boundary Analysis
---------------------------------------------------

-- Extract page range details for both versions
WITH boundary_analysis AS (
  SELECT
    CASE
      WHEN he.primary_shell_file_id = 'e4a19fe4-bf22-4c7a-b915-e0cf2b278c21' THEN 'v1'
      ELSE 'v2.1'
    END as prompt_version,
    he.encounter_type,
    he.provider_name,
    (he.page_ranges::jsonb->0->>0)::int as start_page,
    (he.page_ranges::jsonb->0->>1)::int as end_page,
    (he.page_ranges::jsonb->0->>1)::int - (he.page_ranges::jsonb->0->>0)::int + 1 as page_count,
    he.confidence
  FROM healthcare_encounters he
  WHERE he.primary_shell_file_id IN (
    'e4a19fe4-bf22-4c7a-b915-e0cf2b278c21',  -- v1
    '<V2_1_SHELL_FILE_ID>'                   -- v2.1
  )
  ORDER BY prompt_version, start_page
)
SELECT
  prompt_version,
  encounter_type,
  provider_name,
  start_page,
  end_page,
  page_count,
  confidence,
  CASE
    WHEN prompt_version = 'v1' AND end_page = 11 THEN 'Boundary at 11/12 (4 pages off)'
    WHEN prompt_version = 'v2.1' AND end_page = 13 THEN 'Boundary at 13/14 (CORRECT)'
    WHEN prompt_version = 'v2.1' AND end_page = 11 THEN 'Boundary at 11/12 (NOT FIXED)'
    ELSE 'Other boundary'
  END as boundary_assessment
FROM boundary_analysis;

---------------------------------------------------
-- STEP 5: Check for Regressions
---------------------------------------------------

-- Verify no unexpected changes (encounter count, types, providers)
-- Replace <V2_1_SHELL_FILE_ID> with actual ID
SELECT
  CASE
    WHEN he.primary_shell_file_id = 'e4a19fe4-bf22-4c7a-b915-e0cf2b278c21' THEN 'v1'
    ELSE 'v2.1'
  END as prompt_version,
  COUNT(*) as total_encounters,
  COUNT(CASE WHEN he.encounter_type = 'specialist_consultation' THEN 1 END) as specialist_count,
  COUNT(CASE WHEN he.encounter_type = 'emergency_department' THEN 1 END) as emergency_count,
  COUNT(CASE WHEN he.provider_name LIKE '%Mara%Ehret%' THEN 1 END) as mara_ehret_count,
  COUNT(CASE WHEN he.provider_name LIKE '%Matthew%Tinkham%' THEN 1 END) as tinkham_count,
  AVG(he.confidence) as avg_confidence
FROM healthcare_encounters he
WHERE he.primary_shell_file_id IN (
  'e4a19fe4-bf22-4c7a-b915-e0cf2b278c21',  -- v1
  '<V2_1_SHELL_FILE_ID>'                   -- v2.1
)
GROUP BY prompt_version;

-- Expected output (both v1 and v2.1 should match):
-- total_encounters: 2
-- specialist_count: 1
-- emergency_count: 1
-- mara_ehret_count: 1
-- tinkham_count: 1
-- avg_confidence: ~0.94-0.95

---------------------------------------------------
-- STEP 6: Get Processing Logs (if available)
---------------------------------------------------

-- Check for any processing errors or warnings
SELECT
  shell_file_id,
  status,
  pass_0_5_error,
  processing_error
FROM shell_files
WHERE id IN (
  'e4a19fe4-bf22-4c7a-b915-e0cf2b278c21',  -- v1
  '<V2_1_SHELL_FILE_ID>'                   -- v2.1
);

---------------------------------------------------
-- QUICK REFERENCE: Expected Improvements
---------------------------------------------------

/*
v1 RESULTS (Original Prompt):
  Encounter 1: Pages 1-11 (Mara Ehret)
  Encounter 2: Pages 12-20 (Matthew Tinkham)
  Boundary: Page 11/12
  Issue: Pages 12-13 (metadata with Mara Ehret signatures) incorrectly grouped with Encounter 2

v2.1 EXPECTED (Context-Based Metadata Guidance):
  Encounter 1: Pages 1-13 (Mara Ehret) ← FIXED
  Encounter 2: Pages 14-20 (Matthew Tinkham) ← CORRECT START
  Boundary: Page 13/14 ← CORRECT
  Fix: Pages 12-13 correctly grouped with Progress Note using provider continuity

KEY IMPROVEMENT:
- v1: Detected boundary 2 pages before actual document junction (pages 12-13 misplaced)
- v2.1: Should detect boundary at actual document junction (pages 12-13 correctly placed)
- Root cause fix: Provider name continuity (Mara Ehret) overrides content type change
*/
