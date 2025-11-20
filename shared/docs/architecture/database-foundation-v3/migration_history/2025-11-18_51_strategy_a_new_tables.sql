-- ============================================================================
-- Migration: Strategy A - New Supporting Tables
-- Date: 2025-11-18
-- Migration Number: 51
-- Issue: Create 6 new tables for Strategy A cascade tracking, reconciliation,
--        identity markers, and classification audit
--
-- PROBLEM:
--   - No cascade_chains table for tracking encounters spanning multiple chunks
--   - No reconciliation_log table for auditing reconciliation decisions
--   - No pending_encounter_identifiers table for identity markers during processing
--   - No healthcare_encounter_identifiers table for final identity markers
--   - No orphan_identities table for unmatched identity tracking
--   - No profile_classification_audit table for classification audit trail
--
-- SOLUTION:
--   Create 6 new tables:
--   1. pass05_cascade_chains - Track cascade relationships between chunks
--   2. pass05_reconciliation_log - Audit trail for reconciliation decisions
--   3. pass05_pending_encounter_identifiers - Identity markers during Pass 0.5
--   4. healthcare_encounter_identifiers - Final identity markers after reconciliation
--   5. orphan_identities - Track unmatched identities (multi-profile account support)
--   6. profile_classification_audit - Classification decision audit trail
--
-- AFFECTED TABLES:
--   - pass05_cascade_chains (NEW - 9 columns, 3 indexes)
--   - pass05_reconciliation_log (NEW - 8 columns, 2 indexes)
--   - pass05_pending_encounter_identifiers (NEW - 7 columns, 3 indexes, 1 FK)
--   - healthcare_encounter_identifiers (NEW - 7 columns, 2 indexes, 1 constraint)
--   - orphan_identities (NEW - 9 columns, 3 indexes)
--   - profile_classification_audit (NEW - 6 columns, 3 indexes)
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [X] EXECUTED: 2025-11-18 - Migration applied successfully
--   [X] COMPLETED: Added all 6 tables to current_schema/04_ai_processing.sql SECTION 7
--                  Lines 2082-2228: Complete schemas for all 6 new supporting tables
--                  Includes Migration 51 changes: cascade tracking, reconciliation audit, identity management
--
-- DOWNSTREAM UPDATES:
--   [ ] Worker code: Implement cascade tracking in chunk-processor.ts
--   [ ] Worker code: Implement reconciliation logging in pending-reconciler.ts
--   [ ] Worker code: Implement identifier extraction (File 10)
--   [ ] Worker code: Implement profile classification (File 10)
--   [ ] Worker code: Implement orphan identity tracking (File 10)
--   [ ] Bridge schemas: N/A (internal processing tables)
--   [ ] TypeScript types: Generate types for new tables
--
-- MIGRATION EXECUTED: 2025-11-18
-- STATUS: SUCCESS
-- VERIFICATION: All 6 tables created successfully
--
-- DESIGN REFERENCE:
--   - Source: 03-TABLE-DESIGN-V3.md (Part 3 - New Tables)
--   - Strategy: Strategy A cascade tracking, reconciliation, identity management
--   - Files: 04-12 (core + identity + quality + source), Nov 18, 2024 design
-- ============================================================================


-- ============================================================================
-- TABLE 1: pass05_cascade_chains
-- ============================================================================
-- Purpose: Track cascade relationships between chunks (encounters spanning multiple chunks)
-- Expected Usage: 0-5 rows per document (only multi-chunk encounters create cascades)

CREATE TABLE IF NOT EXISTS pass05_cascade_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,
  cascade_id VARCHAR(100) UNIQUE NOT NULL,
  origin_chunk INTEGER NOT NULL,              -- Where cascade started
  last_chunk INTEGER,                          -- Where cascade ended (NULL if still open)
  final_encounter_id UUID REFERENCES healthcare_encounters(id) ON DELETE SET NULL,
  pendings_count INTEGER DEFAULT 1,            -- How many pendings in this chain
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE pass05_cascade_chains IS
  'Tracks cascade relationships between chunks. Each cascade represents an encounter spanning multiple chunks.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cascade_session
  ON pass05_cascade_chains(session_id);

CREATE INDEX IF NOT EXISTS idx_cascade_final
  ON pass05_cascade_chains(final_encounter_id);

CREATE INDEX IF NOT EXISTS idx_cascade_incomplete
  ON pass05_cascade_chains(session_id)
  WHERE final_encounter_id IS NULL;


-- ============================================================================
-- TABLE 2: pass05_reconciliation_log
-- ============================================================================
-- Purpose: Audit trail for reconciliation decisions
-- Expected Usage: 1-10 rows per document (one per reconciliation decision)

CREATE TABLE IF NOT EXISTS pass05_reconciliation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES pass05_progressive_sessions(id) ON DELETE CASCADE,
  cascade_id VARCHAR(100),
  pending_ids TEXT[],                          -- Array of pending IDs reconciled (text to match pending_id type)
  final_encounter_id UUID REFERENCES healthcare_encounters(id) ON DELETE SET NULL,
  match_type VARCHAR(20),                      -- 'cascade', 'descriptor', 'orphan'
  confidence NUMERIC(3,2),
  reasons TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE pass05_reconciliation_log IS
  'Audit trail for reconciliation decisions. Records how pending encounters were matched/merged.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recon_session
  ON pass05_reconciliation_log(session_id);

CREATE INDEX IF NOT EXISTS idx_recon_cascade
  ON pass05_reconciliation_log(cascade_id);


-- ============================================================================
-- TABLE 3: pass05_pending_encounter_identifiers
-- ============================================================================
-- Purpose: Store identity markers (MRN, insurance numbers, etc.) extracted during Pass 0.5
-- Expected Usage: 0-5 rows per encounter (most encounters have 0-2 identifiers)

CREATE TABLE IF NOT EXISTS pass05_pending_encounter_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  pending_id TEXT NOT NULL,

  identifier_type VARCHAR(50),                 -- 'MRN', 'INSURANCE', 'MEDICARE', etc.
  identifier_value VARCHAR(100),
  issuing_organization TEXT,
  detected_context TEXT,                       -- Raw text where identifier was found

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key to pending encounters
  CONSTRAINT fk_pending_identifiers_pending
    FOREIGN KEY (session_id, pending_id)
    REFERENCES pass05_pending_encounters(session_id, pending_id)
    ON DELETE CASCADE
);

COMMENT ON TABLE pass05_pending_encounter_identifiers IS
  'Identity markers extracted during Pass 0.5 (MRN, insurance numbers, etc.). Migrated to final table during reconciliation.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_identifiers_value
  ON pass05_pending_encounter_identifiers(identifier_value);

CREATE INDEX IF NOT EXISTS idx_pending_identifiers_type
  ON pass05_pending_encounter_identifiers(identifier_type);

CREATE INDEX IF NOT EXISTS idx_pending_identifiers_pending
  ON pass05_pending_encounter_identifiers(session_id, pending_id);


-- ============================================================================
-- TABLE 4: healthcare_encounter_identifiers
-- ============================================================================
-- Purpose: Final identity markers table after reconciliation (migrated from pending identifiers)
-- Expected Usage: 0-5 rows per encounter (migrated from pending identifiers)

CREATE TABLE IF NOT EXISTS healthcare_encounter_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES healthcare_encounters(id) ON DELETE CASCADE,

  identifier_type VARCHAR(50),
  identifier_value VARCHAR(100),
  issuing_organization TEXT,

  -- Audit trail
  source_pending_id TEXT,                      -- Which pending created this
  migrated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Prevent duplicate identifiers for same encounter
  CONSTRAINT uq_encounter_identifier
    UNIQUE (encounter_id, identifier_type, identifier_value)
);

COMMENT ON TABLE healthcare_encounter_identifiers IS
  'Final identity markers after reconciliation. Migrated from pass05_pending_encounter_identifiers.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_encounter_identifiers_value
  ON healthcare_encounter_identifiers(identifier_value);

CREATE INDEX IF NOT EXISTS idx_encounter_identifiers_encounter
  ON healthcare_encounter_identifiers(encounter_id);


-- ============================================================================
-- TABLE 5: orphan_identities
-- ============================================================================
-- Purpose: Track unmatched identities that might become new profiles
-- Expected Usage: 0-10 rows per account (only for unmatched identities appearing 3+ times)
-- CRITICAL: Required for orphan detection in classification algorithm (File 10)

CREATE TABLE IF NOT EXISTS orphan_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  detected_name TEXT,
  detected_dob TEXT,
  encounter_count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  suggested_for_profile BOOLEAN DEFAULT FALSE,
  user_decision VARCHAR(20),                   -- 'accepted', 'rejected', 'pending'
  created_profile_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE orphan_identities IS
  'Tracks unmatched identities for multi-profile account support. Suggests new profile creation after 3+ occurrences.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orphan_identities_account
  ON orphan_identities(account_owner_id);

CREATE INDEX IF NOT EXISTS idx_orphan_identities_name
  ON orphan_identities(detected_name);

CREATE INDEX IF NOT EXISTS idx_orphan_identities_suggested
  ON orphan_identities(suggested_for_profile)
  WHERE suggested_for_profile = TRUE;


-- ============================================================================
-- TABLE 6: profile_classification_audit
-- ============================================================================
-- Purpose: Audit trail for profile classification decisions (privacy/security requirement)
-- Expected Usage: 1 row per pending encounter (classification audit trail)

CREATE TABLE IF NOT EXISTS profile_classification_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_encounter_id TEXT,
  attempted_match JSONB,                       -- Sanitized matching attempt (no PII in logs)
  result VARCHAR(50),                          -- 'matched', 'unmatched', 'orphan', 'review'
  confidence NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE profile_classification_audit IS
  'Audit trail for profile classification decisions. Privacy/security requirement for healthcare compliance.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_classification_audit_pending
  ON profile_classification_audit(pending_encounter_id);

CREATE INDEX IF NOT EXISTS idx_classification_audit_result
  ON profile_classification_audit(result);

CREATE INDEX IF NOT EXISTS idx_classification_audit_created
  ON profile_classification_audit(created_at);


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify all 6 tables exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'pass05_cascade_chains') THEN
        RAISE EXCEPTION 'Table pass05_cascade_chains not created!';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'pass05_reconciliation_log') THEN
        RAISE EXCEPTION 'Table pass05_reconciliation_log not created!';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'pass05_pending_encounter_identifiers') THEN
        RAISE EXCEPTION 'Table pass05_pending_encounter_identifiers not created!';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'healthcare_encounter_identifiers') THEN
        RAISE EXCEPTION 'Table healthcare_encounter_identifiers not created!';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'orphan_identities') THEN
        RAISE EXCEPTION 'Table orphan_identities not created!';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'profile_classification_audit') THEN
        RAISE EXCEPTION 'Table profile_classification_audit not created!';
    END IF;
END $$;

-- Verify indexes exist
DO $$
BEGIN
    -- Cascade chains indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'pass05_cascade_chains'
                   AND indexname IN ('idx_cascade_session', 'idx_cascade_final', 'idx_cascade_incomplete')) THEN
        RAISE EXCEPTION 'Required indexes missing on pass05_cascade_chains!';
    END IF;

    -- Reconciliation log indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'pass05_reconciliation_log'
                   AND indexname IN ('idx_recon_session', 'idx_recon_cascade')) THEN
        RAISE EXCEPTION 'Required indexes missing on pass05_reconciliation_log!';
    END IF;

    -- Pending identifiers indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'pass05_pending_encounter_identifiers'
                   AND indexname IN ('idx_pending_identifiers_value', 'idx_pending_identifiers_type',
                                    'idx_pending_identifiers_pending')) THEN
        RAISE EXCEPTION 'Required indexes missing on pass05_pending_encounter_identifiers!';
    END IF;

    -- Healthcare encounter identifiers indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'healthcare_encounter_identifiers'
                   AND indexname IN ('idx_encounter_identifiers_value', 'idx_encounter_identifiers_encounter')) THEN
        RAISE EXCEPTION 'Required indexes missing on healthcare_encounter_identifiers!';
    END IF;

    -- Orphan identities indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'orphan_identities'
                   AND indexname IN ('idx_orphan_identities_account', 'idx_orphan_identities_name',
                                    'idx_orphan_identities_suggested')) THEN
        RAISE EXCEPTION 'Required indexes missing on orphan_identities!';
    END IF;

    -- Profile classification audit indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE tablename = 'profile_classification_audit'
                   AND indexname IN ('idx_classification_audit_pending', 'idx_classification_audit_result',
                                    'idx_classification_audit_created')) THEN
        RAISE EXCEPTION 'Required indexes missing on profile_classification_audit!';
    END IF;
END $$;

-- Show table list
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM (
  VALUES
    ('pass05_cascade_chains'),
    ('pass05_reconciliation_log'),
    ('pass05_pending_encounter_identifiers'),
    ('healthcare_encounter_identifiers'),
    ('orphan_identities'),
    ('profile_classification_audit')
) AS t(table_name)
ORDER BY table_name;

-- Expected:
-- pass05_cascade_chains: 9 columns
-- pass05_reconciliation_log: 8 columns
-- pass05_pending_encounter_identifiers: 7 columns
-- healthcare_encounter_identifiers: 7 columns
-- orphan_identities: 9 columns
-- profile_classification_audit: 6 columns


-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================

/*
DROP TABLE IF EXISTS profile_classification_audit CASCADE;
DROP TABLE IF EXISTS orphan_identities CASCADE;
DROP TABLE IF EXISTS healthcare_encounter_identifiers CASCADE;
DROP TABLE IF EXISTS pass05_pending_encounter_identifiers CASCADE;
DROP TABLE IF EXISTS pass05_reconciliation_log CASCADE;
DROP TABLE IF EXISTS pass05_cascade_chains CASCADE;
*/


-- ============================================================================
-- MIGRATION SUMMARY
-- ============================================================================

-- NEW TABLES CREATED (6):
--   1. pass05_cascade_chains: 9 columns, 3 indexes
--   2. pass05_reconciliation_log: 8 columns, 2 indexes
--   3. pass05_pending_encounter_identifiers: 7 columns, 3 indexes, 1 FK
--   4. healthcare_encounter_identifiers: 7 columns, 2 indexes, 1 constraint
--   5. orphan_identities: 9 columns, 3 indexes
--   6. profile_classification_audit: 6 columns, 3 indexes

-- Breaking Changes: NONE (all new tables)
-- Data Migration: NONE (tables start empty)
