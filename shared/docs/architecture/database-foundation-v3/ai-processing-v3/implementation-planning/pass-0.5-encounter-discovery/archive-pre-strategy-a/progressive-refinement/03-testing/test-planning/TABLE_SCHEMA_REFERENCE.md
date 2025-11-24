# Complete Table Schema Reference - Pass 0.5 Testing

**Total Columns to Capture:** 244 columns across 9 tables + 2 views

**Promise:** EVERY column listed below will be queried and documented for EVERY test.

---

## Table 1: shell_files (38 columns)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| patient_id | uuid | Owner |
| filename | text | Stored filename |
| original_filename | text | User upload name |
| file_size_bytes | bigint | File size |
| mime_type | text | Content type |
| storage_path | text | Supabase Storage path |
| status | text | Processing status |
| processing_started_at | timestamptz | When started |
| processing_completed_at | timestamptz | When done |
| processing_error | jsonb | Error details |
| extracted_text | text | OCR text |
| ocr_confidence | numeric | OCR quality (old) |
| page_count | integer | Total pages |
| ai_synthesized_summary | text | Pass 3 summary |
| narrative_count | integer | Pass 3 count |
| synthesis_completed_at | timestamptz | Pass 3 done |
| processing_job_id | uuid | Job queue ID |
| processing_worker_id | varchar | Worker ID |
| processing_priority | integer | Job priority |
| idempotency_key | text | Duplicate prevention |
| processing_cost_estimate | numeric | Estimated cost |
| processing_duration_seconds | integer | Actual duration |
| language_detected | text | Language |
| created_at | timestamptz | Upload time |
| updated_at | timestamptz | Last update |
| processed_image_path | text | Downscaled image |
| processed_image_checksum | text | Image hash |
| processed_image_mime | text | Image type |
| **pass_0_5_completed** | **boolean** | **MIGRATION 45: Completion flag** |
| **pass_0_5_completed_at** | **timestamptz** | **MIGRATION 45: When completed** |
| **pass_0_5_error** | **text** | **MIGRATION 45: Error message** |
| ocr_raw_jsonb | jsonb | Raw OCR response |
| page_separation_analysis | jsonb | Batching analysis |
| processed_image_size_bytes | bigint | Image size |
| **pass_0_5_version** | **text** | **MIGRATION 45: Prompt version (v2.9/v2.10)** |
| **pass_0_5_progressive** | **boolean** | **MIGRATION 45: Progressive mode used** |
| **ocr_average_confidence** | **numeric** | **MIGRATION 45: Avg OCR confidence** |

---

## Table 2: healthcare_encounters (50 columns)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| patient_id | uuid | Owner |
| encounter_type | text | Type classification |
| encounter_start_date | timestamptz | Start date |
| provider_name | text | Provider |
| provider_type | text | Provider specialty |
| facility_name | text | Facility |
| specialty | text | Clinical specialty |
| chief_complaint | text | Chief complaint |
| summary | text | Encounter summary |
| clinical_impression | text | Impression |
| plan | text | Treatment plan |
| billing_codes | array | Billing codes |
| primary_shell_file_id | uuid | Source file |
| related_shell_file_ids | array | Related files |
| requires_review | boolean | Manual review flag |
| archived | boolean | Archived |
| created_at | timestamptz | Created |
| updated_at | timestamptz | Updated |
| clinical_event_id | uuid | Event link |
| primary_narrative_id | uuid | Narrative link |
| valid_from | timestamptz | Temporal validity |
| valid_to | timestamptz | Temporal validity |
| superseded_by_record_id | uuid | Supersession |
| supersession_reason | text | Why superseded |
| is_current | boolean | Current version |
| clinical_effective_date | date | Effective date |
| date_confidence | text | Date confidence |
| extracted_dates | jsonb | All dates found |
| date_source | text | Date source |
| date_conflicts | jsonb | Date conflicts |
| date_resolution_reason | text | Conflict resolution |
| clinical_identity_key | text | Dedup key |
| **page_ranges** | **array** | **Pages containing encounter** |
| **spatial_bounds** | **jsonb** | **Spatial coordinates** |
| **identified_in_pass** | **text** | **Which pass found it (pass_0_5)** |
| **is_real_world_visit** | **boolean** | **Real vs pseudo encounter** |
| **pass_0_5_confidence** | **numeric** | **AI confidence score** |
| ocr_average_confidence | numeric | OCR quality |
| encounter_date_end | timestamptz | End date |
| is_planned_future | boolean | Future encounter |
| master_encounter_id | uuid | Master record |
| master_encounter_confidence | numeric | Master confidence |
| all_shell_file_ids | array | All source files |
| **source_method** | **text** | **standard/progressive_chunk** |
| **encounter_timeframe_status** | **text** | **Timeframe status** |

---

## Table 3: pass05_encounter_metrics (25 columns)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| patient_id | uuid | Owner |
| **shell_file_id** | **uuid** | **Shell file** |
| **processing_session_id** | **uuid** | **Job session** |
| **encounters_detected** | **integer** | **Total encounters** |
| **real_world_encounters** | **integer** | **Real encounters** |
| **pseudo_encounters** | **integer** | **Pseudo encounters** |
| **processing_time_ms** | **integer** | **Processing time** |
| processing_time_seconds | numeric | Processing seconds |
| **ai_model_used** | **text** | **Model name** |
| **input_tokens** | **integer** | **Input tokens** |
| **output_tokens** | **integer** | **Output tokens** |
| total_tokens | integer | Sum tokens |
| ocr_average_confidence | numeric | OCR quality |
| **encounter_confidence_average** | **numeric** | **Avg encounter confidence** |
| **encounter_types_found** | **array** | **Encounter types** |
| total_pages | integer | Page count |
| batching_required | boolean | Batching flag |
| user_agent | text | User agent |
| ip_address | inet | IP |
| created_at | timestamptz | Created |
| planned_encounters | integer | Planned count |
| **ai_cost_usd** | **numeric** | **Total cost** |

---

## Table 4: pass05_page_assignments (6 columns) - MIGRATION 45

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| **shell_file_id** | **uuid** | **Shell file** |
| **page_num** | **integer** | **Page number** |
| **encounter_id** | **text** | **Encounter temp ID (enc-1, enc-2)** |
| **justification** | **text** | **AI reasoning** |
| created_at | timestamptz | Created |

---

## Table 5: pass05_progressive_sessions (24 columns)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| **shell_file_id** | **uuid** | **Shell file** |
| patient_id | uuid | Owner |
| **total_pages** | **integer** | **Total pages** |
| **chunk_size** | **integer** | **Pages per chunk** |
| **total_chunks** | **integer** | **Total chunks** |
| **current_chunk** | **integer** | **Current chunk** |
| **processing_status** | **text** | **Status** |
| **current_handoff_package** | **jsonb** | **CRITICAL: Handoff data** |
| **total_encounters_found** | **integer** | **Encounters found** |
| **total_encounters_completed** | **integer** | **Completed** |
| **total_encounters_pending** | **integer** | **Pending** |
| **requires_manual_review** | **boolean** | **Review flag** |
| **review_reasons** | **array** | **Why review** |
| **average_confidence** | **numeric** | **Avg confidence** |
| started_at | timestamptz | Started |
| **completed_at** | **timestamptz** | **Completed** |
| **total_processing_time** | **interval** | **Total time** |
| **total_ai_calls** | **integer** | **AI calls** |
| **total_input_tokens** | **integer** | **Input tokens** |
| **total_output_tokens** | **integer** | **Output tokens** |
| **total_cost_usd** | **numeric** | **Total cost** |
| created_at | timestamptz | Created |
| updated_at | timestamptz | Updated |

---

## Table 6: pass05_chunk_results (25 columns)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| **session_id** | **uuid** | **Session** |
| **chunk_number** | **integer** | **Chunk number** |
| **page_start** | **integer** | **Start page** |
| **page_end** | **integer** | **End page** |
| **processing_status** | **text** | **Status** |
| started_at | timestamptz | Started |
| completed_at | timestamptz | Completed |
| **processing_time_ms** | **integer** | **Time** |
| **ai_model_used** | **text** | **Model** |
| **input_tokens** | **integer** | **Input** |
| **output_tokens** | **integer** | **Output** |
| **ai_cost_usd** | **numeric** | **Cost** |
| **handoff_received** | **jsonb** | **CRITICAL: Received handoff** |
| **handoff_generated** | **jsonb** | **CRITICAL: Generated handoff** |
| **encounters_started** | **integer** | **Started** |
| **encounters_completed** | **integer** | **Completed** |
| **encounters_continued** | **integer** | **Continued** |
| **confidence_score** | **numeric** | **Confidence** |
| ocr_average_confidence | numeric | OCR |
| **error_message** | **text** | **Error** |
| error_context | jsonb | Error details |
| retry_count | integer | Retries |
| **ai_response_raw** | **jsonb** | **CRITICAL: Full AI response** |
| created_at | timestamptz | Created |

---

## Table 7: pass05_pending_encounters (16 columns)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| **session_id** | **uuid** | **Session** |
| **temp_encounter_id** | **text** | **Temp ID** |
| **chunk_started** | **integer** | **Started chunk** |
| **chunk_last_seen** | **integer** | **Last chunk** |
| **partial_data** | **jsonb** | **CRITICAL: Partial encounter data** |
| **page_ranges** | **array** | **Pages** |
| **last_seen_context** | **text** | **Context** |
| **expected_continuation** | **text** | **Expected** |
| **status** | **text** | **Status (pending/completed/orphaned)** |
| **completed_encounter_id** | **uuid** | **Final UUID** |
| **completed_at** | **timestamptz** | **When resolved** |
| **confidence** | **numeric** | **Confidence** |
| requires_review | boolean | Review |
| created_at | timestamptz | Created |
| updated_at | timestamptz | Updated |

---

## Table 8: job_queue (38 columns)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| **job_type** | **text** | **Job type** |
| job_lane | text | Lane |
| job_category | text | Category |
| job_name | text | Name |
| job_description | text | Description |
| **job_payload** | **jsonb** | **CRITICAL: Contains shellFileId** |
| job_config | jsonb | Config |
| **status** | **text** | **pending/processing/completed/failed** |
| scheduled_at | timestamptz | Scheduled |
| **started_at** | **timestamptz** | **When started** |
| **completed_at** | **timestamptz** | **When done** |
| priority | integer | Priority |
| estimated_duration | interval | Estimate |
| **actual_duration** | **interval** | **Actual** |
| memory_usage_mb | integer | Memory |
| cpu_usage_percent | numeric | CPU |
| **retry_count** | **integer** | **Retries** |
| max_retries | integer | Max retries |
| retry_delay | interval | Delay |
| **last_error** | **text** | **CRITICAL: Error message** |
| **error_details** | **jsonb** | **CRITICAL: Error context** |
| depends_on | array | Dependencies |
| blocks_jobs | array | Blockers |
| job_group | text | Group |
| worker_id | text | Worker |
| processing_node | text | Node |
| lock_acquired_at | timestamptz | Lock |
| lock_expires_at | timestamptz | Lock expiry |
| heartbeat_at | timestamptz | Heartbeat |
| dead_letter_at | timestamptz | Dead letter |
| patient_id | uuid | Owner |
| **shell_file_id** | **uuid** | **Shell file** |
| narrative_id | uuid | Narrative |
| **job_result** | **jsonb** | **Result** |
| output_files | array | Outputs |
| created_at | timestamptz | Created |
| updated_at | timestamptz | Updated |

---

## Table 9: shell_file_manifests (13 columns) - OLD TABLE (should be empty)

| Column | Type | Purpose |
|--------|------|---------|
| manifest_id | uuid | Primary key |
| shell_file_id | uuid | Shell file |
| patient_id | uuid | Owner |
| created_at | timestamptz | Created |
| pass_0_5_version | text | Version |
| processing_time_ms | integer | Time |
| total_pages | integer | Pages |
| total_encounters_found | integer | Encounters |
| ocr_average_confidence | numeric | OCR |
| manifest_data | jsonb | Full data |
| ai_model_used | text | Model |

**Expected:** COUNT should be 0 for all new tests (manifest-free architecture)

---

## Views

### shell_file_manifests_v2 (MIGRATION 45)
Same columns as shell_file_manifests but aggregated from distributed tables

### pass05_progressive_performance
Performance metrics view (will query for progressive tests)

---

## My Commitment

For EVERY test, I will:

1. Query ALL 244 columns across ALL tables
2. Document EVERY value (NULL, empty, or populated)
3. For JSONB columns (handoffs, errors, etc.) - include the FULL JSON structure
4. For progressive tests - analyze EVERY chunk's handoff quality
5. NO skipping, NO summarizing until the final analysis phase

**You will see:**
- Every. Single. Column.
- Every. Single. Value.
- Every. Single. Test.

No exceptions.
