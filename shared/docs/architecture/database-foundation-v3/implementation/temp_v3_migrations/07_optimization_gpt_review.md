- I reviewed `07_optimization.sql`. Ordering and dependencies are correct; no forward references. Most DDL is idempotent via IF NOT EXISTS.

### Must-fix
- Duplicate/overlapping checks:
  - `patient_clinical_events.confidence_score` and `clinical_narratives.ai_narrative_confidence` already have BETWEEN 0 AND 1 checks in `03_clinical_core.sql`. Adding `chk_confidence_score_valid` and `chk_narrative_confidence_valid` is redundant. Keep if desired, but guard idempotently to avoid re-run errors.
- Non-idempotent ALTERs and FKs:
  - `job_queue_job_lane_check` and all `ADD CONSTRAINT fk_user_events_*` will fail on re-apply. Wrap in guards.

Example guards:
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'job_queue_job_lane_check'
      AND conrelid = 'job_queue'::regclass
  ) THEN
    ALTER TABLE job_queue ADD CONSTRAINT job_queue_job_lane_check CHECK (
      (job_type = 'shell_file_processing' AND job_lane IN ('fast_queue', 'standard_queue')) OR
      (job_type = 'ai_processing' AND job_lane IN ('ai_queue_simple', 'ai_queue_complex')) OR
      (job_type IN ('data_migration','audit_cleanup','system_maintenance','notification_delivery',
                    'report_generation','backup_operation','semantic_processing','consent_verification',
                    'provider_verification') AND job_lane IS NULL)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_user_events_provider_context'
  ) THEN
    ALTER TABLE user_events
      ADD CONSTRAINT fk_user_events_provider_context
      FOREIGN KEY (provider_context) REFERENCES provider_registry(id) ON DELETE SET NULL;
  END IF;
END $$;
-- repeat per fk: shell_file_id, narrative_id, clinical_event_id
```

- Emoji in notices:
  - Remove the emoji in the success notice; it violates your no-emoji rule in code/docs.

### Recommended hardening
- Make the added CHECK constraints idempotent (or remove them since they duplicate earlier checks):
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_confidence_score_valid'
  ) THEN
    ALTER TABLE patient_clinical_events
      ADD CONSTRAINT chk_confidence_score_valid
      CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));
  END IF;
END $$;
```

- Add RLS for `failed_audit_events` (sensitive by nature):
```sql
ALTER TABLE failed_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY failed_audit_events_admin_only ON failed_audit_events
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
```

- Function safety: add search_path to monitoring functions to avoid path hijack (no privilege elevation, just defensive):
```sql
CREATE OR REPLACE FUNCTION database_health_check() RETURNS TABLE(...)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$ ... $$;
-- Do the same for performance_metrics(), data_quality_assessment()
```

- Optional: add IF NOT EXISTS guards for the three user_events FKs as above, to keep replays clean.

- Optional: ANALYZE/ALTER storage is fine as-is, but if you want fully repeatable runs, guard them with EXISTS checks (non-blocking).

- Verification block:
  - Current index count heuristics are fine; no action needed.

- Summary
  - Safe to deploy after adding idempotent guards for the new constraints/FKs and removing the emoji.
  - Consider enabling RLS on `failed_audit_events` and setting function search_path for defense-in-depth.