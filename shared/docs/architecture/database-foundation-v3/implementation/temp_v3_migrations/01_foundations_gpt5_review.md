- I reviewed 01_foundations.sql. Order and dependencies are fine; no forward references. Most DDL is idempotent.

### Must-fix
- is_admin config key mismatch:
  - Function checks `system_configuration` key `security.admin_emails`, but the seeded key is `security.admin_email_domains`. Align one of them.
  - Quick fix: either change the query to use `security.admin_email_domains` or seed `security.admin_emails` explicitly.

- SECURITY DEFINER search_path hardening:
  - These functions should set search_path defensively: `log_audit_event`, `create_system_notification`, `is_admin`, `is_service_role`, `is_developer`, `is_healthcare_provider`, `is_feature_enabled_for_user`, `enable_feature_for_user`, `disable_feature_for_user`.
  - Example:
    ```sql
    CREATE OR REPLACE FUNCTION log_audit_event(...)
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    ...
    $$;
    ```

- RLS on audit_log writes is too permissive:
  - Policy `audit_log_system_write` allows any authenticated user to INSERT. Prefer restricting to service role or only via the function.
  - Example replacement:
    ```sql
    DROP POLICY IF EXISTS audit_log_system_write ON audit_log;
    CREATE POLICY audit_log_system_write ON audit_log
      FOR INSERT TO authenticated
      USING (is_service_role()) WITH CHECK (is_service_role());
    ```
  - Or drop the policy entirely and rely on the SECURITY DEFINER function.

### Idempotency improvements
- Policies and trigger are not idempotent. Guard them to allow safe re-runs.
  - Policy guard pattern:
    ```sql
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname='public' AND polname='system_configuration_admin_access'
      ) THEN
        CREATE POLICY system_configuration_admin_access ON system_configuration
          FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
      END IF;
    END $$;
    ```
  - Trigger guard pattern:
    ```sql
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_audit_feature_flags'
      ) THEN
        CREATE TRIGGER trigger_audit_feature_flags
          AFTER INSERT OR UPDATE OR DELETE ON feature_flags
          FOR EACH ROW EXECUTE FUNCTION audit_feature_flags_changes();
      END IF;
    END $$;
    ```

### Optional hardening
- Add RLS to `user_account_archival` (admin-only):
  ```sql
  ALTER TABLE user_account_archival ENABLE ROW LEVEL SECURITY;
  CREATE POLICY user_account_archival_admin ON user_account_archival
    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  ```
- Add WITH CHECK where missing (e.g., `implementation_sessions_admin_access`) so writes are enforced by the same predicate.
- PostGIS extension is fine under IF NOT EXISTS; if your target doesn’t support it, keep it (no-op) or comment with environment note.

- Deployment verification block is good; no changes needed.

- Net effect
  - Fix the admin config key mismatch.
  - Tighten audit_log write access.
  - Add search_path to SECURITY DEFINER functions.
  - Make policies/trigger idempotent.
  - Optionally add RLS to `user_account_archival`.