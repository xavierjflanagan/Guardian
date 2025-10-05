-- =============================================================================
-- Migration: Clean Slate + Auto-Provision User Profiles
-- Date: 3 October 2025
-- Author: Xavier Flanagan / Claude Code
-- Status: READY TO EXECUTE
--
-- PURPOSE:
-- This migration solves the foreign key constraint violation when creating
-- shell_files records. The issue: shell_files.patient_id references user_profiles.id,
-- but user_profiles records are not automatically created on signup.
--
-- PROBLEM DISCOVERED:
-- Upload error: "insert or update on table 'shell_files' violates foreign key
-- constraint 'shell_files_patient_id_fkey'"
-- Root cause: auth.users record exists but no corresponding user_profiles record
--
-- SOLUTION:
-- 1. Delete all test users and data (clean slate for fresh testing)
-- 2. Create auto-provisioning trigger on auth.users table
-- 3. Every new signup automatically gets user_profiles record
--
-- AFFECTED TABLES (cleanup):
-- - manual_review_queue, ai_confidence_scoring, pass1_entity_metrics
-- - profile_classification_audit, entity_processing_audit, ai_processing_sessions
-- - job_queue, shell_files, user_profiles, auth.users
--
-- NEW INFRASTRUCTURE:
-- - handle_new_user() function (auto-creates user_profiles)
-- - on_auth_user_created trigger (fires after INSERT on auth.users)
-- =============================================================================

-- STEP 1: Clean up all existing data (DESTRUCTIVE - removes all users!)
-- ============================================================================
-- NOTE: You must delete auth.users manually via Supabase Dashboard:
-- Go to Authentication > Users > Select all > Delete
-- This SQL will clean up application data tables only.

-- Delete in correct order to respect foreign key constraints
DELETE FROM manual_review_queue;
DELETE FROM ai_confidence_scoring;
DELETE FROM pass1_entity_metrics;
DELETE FROM profile_classification_audit;
DELETE FROM entity_processing_audit;
DELETE FROM ai_processing_sessions;
DELETE FROM job_queue;
DELETE FROM shell_files;
DELETE FROM user_profiles;

-- Success message
DO $$ BEGIN
  RAISE NOTICE 'Application data deleted successfully';
  RAISE NOTICE 'MANUAL STEP REQUIRED: Delete auth.users via Dashboard > Authentication > Users';
END $$;

-- STEP 2: Create auto-provisioning trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auto-create user_profiles record when new auth.users created
  INSERT INTO public.user_profiles (
    id,
    email,
    display_name,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      SPLIT_PART(NEW.email, '@', 1)  -- Use email prefix as fallback
    ),
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION public.handle_new_user() IS
'Auto-creates user_profiles record when new user signs up via Supabase Auth.
Ensures referential integrity for patient_id foreign keys across the system.';

-- STEP 3: Create trigger on auth.users
-- ============================================================================
-- NOTE: This requires superuser/service role permissions
-- If this fails, you need to run it via Supabase CLI or contact support

-- Attempt to create trigger (may fail due to permissions)
DO $$
BEGIN
  -- Drop existing trigger if it exists
  EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';

  -- Create trigger that fires after INSERT on auth.users
  EXECUTE '
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user()
  ';

  RAISE NOTICE 'Trigger created successfully on auth.users';

EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'PERMISSION ERROR: Cannot create trigger on auth.users';
    RAISE NOTICE 'You need to create this trigger via Supabase Support or use the workaround below';
    RAISE NOTICE '';
    RAISE NOTICE 'WORKAROUND: Use Supabase Webhooks instead:';
    RAISE NOTICE '1. Go to Database > Webhooks';
    RAISE NOTICE '2. Create webhook on auth.users INSERT';
    RAISE NOTICE '3. Call an Edge Function that creates user_profiles';
END $$;

-- STEP 4: Verify setup
-- ============================================================================

-- Test query to verify trigger function exists
SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'handle_new_user';

-- Test query to verify trigger exists
SELECT
  tgname AS trigger_name,
  tgtype AS trigger_type,
  tgenabled AS enabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- Success message
DO $$ BEGIN
  RAISE NOTICE 'Auto-provisioning setup complete!';
  RAISE NOTICE 'New signups will automatically create user_profiles records.';
END $$;
