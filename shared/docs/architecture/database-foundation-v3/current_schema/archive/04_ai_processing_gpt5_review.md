I'll load the AI processing SQL and related migration files to review dependencies, forward references, and idempotency risks.

[4 tools called]

I reviewed 04_ai_processing.sql end-to-end. Here are concise results and safe hardening tweaks.

### Overall
- Schema order is valid; no forward-reference errors.
- All inline FK references target tables created in 02/03; ok if 03 runs before 04 (as declared).
- Indexes and policies reference existing columns; predicates are valid.
- Functions use SECURITY DEFINER and set search_path defensively; good.

### Must-add dependency checks (fail-fast)
Add these to the preflight block to avoid mid-migration failures:
- user_profiles table (multiple FKs depend on it)
- clinical_narratives table (Pass 3 links)
- patient_observations, patient_interventions, patient_conditions, patient_medications, patient_immunizations, patient_vitals, patient_allergies
- is_admin() function (used in policies and functions)

Example snippet to append to the preflight DO:
```sql
IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
    RAISE EXCEPTION 'DEPENDENCY ERROR: user_profiles missing. Run 02_profiles.sql.';
END IF;

IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_narratives') THEN
    RAISE EXCEPTION 'DEPENDENCY ERROR: clinical_narratives missing. Run 03_clinical_core.sql.';
END IF;

-- Check all patient_* tables required by FKs
PERFORM 1 FROM information_schema.tables WHERE table_name IN (
  'patient_observations','patient_interventions','patient_conditions',
  'patient_medications','patient_immunizations','patient_vitals','patient_allergies'
);
IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPENDENCY ERROR: One or more patient_* tables missing. Run 03_clinical_core.sql.';
END IF;

IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'is_admin') THEN
    RAISE EXCEPTION 'DEPENDENCY ERROR: is_admin() missing. Run 01_foundations.sql.';
END IF;
```

### RLS coverage gaps (recommend add RLS + policies)
These tables are created later in the file but don’t have RLS enabled or policies:
- semantic_processing_sessions
- narrative_creation_audit
- shell_file_synthesis_results
- dual_lens_user_preferences
- narrative_view_cache

Recommended minimal policies:
- For semantic_processing_sessions, narrative_creation_audit, shell_file_synthesis_results, narrative_view_cache: gate via has_profile_access on patient_id/profile_id (or through their session linkage).
- For dual_lens_user_preferences: owner-based on user_id and/or profile_id with has_profile_access.

Example enable + simple policies:
```sql
ALTER TABLE semantic_processing_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY semantic_processing_sessions_access ON semantic_processing_sessions
  FOR ALL TO authenticated
  USING (has_profile_access(auth.uid(), patient_id) OR is_admin())
  WITH CHECK (has_profile_access(auth.uid(), patient_id) OR is_admin());

ALTER TABLE narrative_creation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY narrative_creation_audit_access ON narrative_creation_audit
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM semantic_processing_sessions s
      WHERE s.id = narrative_creation_audit.semantic_processing_session_id
      AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
    )
  )
  WITH CHECK (TRUE);

ALTER TABLE shell_file_synthesis_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY shell_file_synthesis_results_access ON shell_file_synthesis_results
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM semantic_processing_sessions s
      WHERE s.id = shell_file_synthesis_results.semantic_processing_session_id
      AND (has_profile_access(auth.uid(), s.patient_id) OR is_admin())
    )
  )
  WITH CHECK (TRUE);

ALTER TABLE dual_lens_user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY dual_lens_user_preferences_owner ON dual_lens_user_preferences
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR (profile_id IS NOT NULL AND has_profile_access(auth.uid(), profile_id))
    OR is_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (profile_id IS NOT NULL AND has_profile_access(auth.uid(), profile_id))
    OR is_admin()
  );

ALTER TABLE narrative_view_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY narrative_view_cache_profile_access ON narrative_view_cache
  FOR ALL TO authenticated
  USING (has_profile_access(auth.uid(), profile_id) OR is_admin())
  WITH CHECK (has_profile_access(auth.uid(), profile_id) OR is_admin());
```

### Idempotency considerations
- Policies: CREATE POLICY will fail on re-run. If you want repeatable applies, gate each with a check:
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND polname='ai_sessions_access'
  ) THEN
    CREATE POLICY ai_sessions_access ON ai_processing_sessions
      FOR ALL TO authenticated
      USING (has_profile_access(auth.uid(), patient_id) OR is_admin())
      WITH CHECK (has_profile_access(auth.uid(), patient_id) OR is_admin());
  END IF;
END $$;
```
- The rest uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, so fine.

### Deployment verification block
- It intentionally verifies only the first 5 core AI tables; Pass 3 tables are created after. That’s okay, but consider adding a second verification block for Pass 3 (semantic_* and dual-lens tables) so success output reflects the full file.

### Minor checks
- gen_random_uuid() is available via pgcrypto from 01_foundations; ok.
- assigned_reviewer TEXT vs auth.uid()::text comparison is type-safe; ok.
- All CHECK constraints’ value sets are consistent with usage elsewhere.

Want me to implement:
- the added dependency checks,
- RLS + policies for the five later tables,
- optional idempotent policy guards,
- an extra verification block for Pass 3?