Date: 02/09/2025


I reviewed 05_healthcare_journey.sql for ordering, dependencies, RLS, and idempotency.

### Overall
- Order is valid; no forward references. Dependencies on 02/03/04 are checked up-front.
- Tables, partitions, and functions are created idempotently (CREATE IF NOT EXISTS / CREATE OR REPLACE).
- Policies exist for clinical_alert_rules and provider_action_items.

### Issues to fix
- Invalid indexes on clinical_alert_rules:
  - idx_alert_rules_priority references non-existent column alert_priority.
  - idx_alert_rules_performance references non-existent columns success_rate, trigger_count.
- Duplicate/overlapping indexes for provider_action_items:
  - A second block (“Moved from 04”) attempts to create additional indexes which duplicate earlier ones on the same columns (different names → will create redundant indexes).
- Missing RLS and policies on several tables:
  - provider_registry, registered_doctors_au, patient_provider_access, provider_access_log (partitioned parent), provider_clinical_notes, healthcare_provider_context.
- Preflight dependency checks could also validate is_admin() since used by policies.

### Recommended edits (safe hardening)
- Remove or correct invalid/duplicated indexes:
  - Delete the “Moved from 04” block for clinical_alert_rules indexes or replace with valid ones already present (rule_category, severity, validation_status, active).
  - Delete the duplicate “Moved from 04” provider_action_items indexes; keep the earlier index set (676–683).
- Add missing RLS and minimal policies:

```sql
-- provider_registry
ALTER TABLE provider_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_registry_self_read ON provider_registry
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY provider_registry_admin_all ON provider_registry
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- registered_doctors_au (directory: read-only to authenticated; admin can manage)
ALTER TABLE registered_doctors_au ENABLE ROW LEVEL SECURITY;
CREATE POLICY registered_doctors_read ON registered_doctors_au
  FOR SELECT TO authenticated USING (true);
CREATE POLICY registered_doctors_admin_all ON registered_doctors_au
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- patient_provider_access (gate by patient access or admin)
ALTER TABLE patient_provider_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY patient_provider_access_access ON patient_provider_access
  FOR ALL TO authenticated
  USING (has_profile_access(auth.uid(), patient_id) OR is_admin())
  WITH CHECK (has_profile_access(auth.uid(), patient_id) OR is_admin());

-- provider_access_log (partitioned; apply to parent)
ALTER TABLE provider_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_access_log_access ON provider_access_log
  FOR SELECT TO authenticated
  USING (
    has_profile_access(auth.uid(), patient_id) OR is_admin() OR
    EXISTS (
      SELECT 1 FROM provider_registry pr
      WHERE pr.id = provider_id AND pr.user_id = auth.uid()
    )
  );

-- provider_clinical_notes (by patient access or assigned provider or admin)
ALTER TABLE provider_clinical_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_notes_access ON provider_clinical_notes
  FOR ALL TO authenticated
  USING (
    has_profile_access(auth.uid(), patient_id) OR is_admin() OR
    EXISTS (
      SELECT 1 FROM provider_registry pr
      WHERE pr.id = provider_clinical_notes.provider_id AND pr.user_id = auth.uid()
    )
  )
  WITH CHECK (has_profile_access(auth.uid(), patient_id) OR is_admin());

-- healthcare_provider_context (provider-owned or admin)
ALTER TABLE healthcare_provider_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_context_owner ON healthcare_provider_context
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM provider_registry pr
      WHERE pr.id = healthcare_provider_context.provider_id AND pr.user_id = auth.uid()
    ) OR is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM provider_registry pr
      WHERE pr.id = healthcare_provider_context.provider_id AND pr.user_id = auth.uid()
    ) OR is_admin()
  );
```

- Add preflight validation for is_admin():
```sql
IF NOT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'is_admin') THEN
  RAISE EXCEPTION 'DEPENDENCY ERROR: is_admin() missing. Run 01_foundations.sql first.';
END IF;
```

- Optional: Make policies idempotent with EXISTS guards when re-running migrations (same pattern I suggested earlier).

