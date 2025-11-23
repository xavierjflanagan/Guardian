-- ============================================================================
-- Migration 66: Add facility_address Field to Pass 0.5 Pipeline
-- Date: 2025-11-23
-- Issue: facility_address field missing from pending_encounters table
--
-- PROBLEM:
-- - facility_address exists in healthcare_encounters table (added in Migration 50)
-- - v11 AI prompt extracts facility_address from documents
-- - BUT: field was missing from pass05_pending_encounters table
-- - Result: AI-extracted facility addresses were being lost during reconciliation
--
-- SOLUTION:
-- - Added facility_address TEXT column to pass05_pending_encounters table
-- - Updated entire processing pipeline to handle facility_address:
--   * TypeScript interface (PendingEncounter)
--   * AI response parsing (chunk-processor.ts)
--   * Database inserts (database.ts - both single and batch)
--   * Reconciliation transfer (pending-reconciler.ts)
-- - Updated source of truth schema documentation
--
-- AFFECTED TABLES: pass05_pending_encounters
--
-- SOURCE OF TRUTH SCHEMA UPDATED:
--   [x] current_schema/04_ai_processing.sql (Line 1849: Added facility_address TEXT column)
--
-- DOWNSTREAM UPDATES:
--   [x] TypeScript types updated (types.ts line 183)
--   [x] Chunk processor updated (chunk-processor.ts line 569)
--   [x] Database inserts updated (database.ts lines 298, 414)
--   [x] Reconciler updated (pending-reconciler.ts line 584)
--   [x] v11 AI prompt updated (aiPrompts.v11.ts - user manual update)
--
-- EXECUTION NOTES:
-- - User executed DDL manually via Supabase SQL editor:
--   ALTER TABLE pass05_pending_encounters ADD COLUMN facility_address TEXT;
-- - No migration SQL execution required via MCP tool
-- - This file documents code changes only
--
-- ============================================================================

-- SCHEMA CHANGE (Already Executed by User via SQL Editor)
-- ============================================================================

-- ALTER TABLE pass05_pending_encounters
--   ADD COLUMN facility_address TEXT;

-- COMMENT: User executed this DDL manually on 2025-11-23


-- CODE CHANGES SUMMARY
-- ============================================================================

-- 1. TypeScript Interface (apps/render-worker/src/pass05/progressive/types.ts)
-- Added to PendingEncounter interface (line 183):
--   facility_address?: string;  // Migration 66: Facility address

-- 2. Chunk Processor (apps/render-worker/src/pass05/progressive/chunk-processor.ts)
-- Added AI response parsing (line 569):
--   facility_address: enc.facility_address,  // Migration 66: Facility address

-- 3. Database Insert Functions (apps/render-worker/src/pass05/progressive/database.ts)
--
-- insertPendingEncounterV3() - Line 298:
--   facility_address: pending.facility_address,  // Migration 66: Facility address
--
-- batchInsertPendingEncountersV3() - Line 414:
--   facility_address: pending.facility_address,  // Migration 66: Facility address

-- 4. Reconciler (apps/render-worker/src/pass05/progressive/pending-reconciler.ts)
-- Added to final encounter creation (line 584):
--   facility_address: firstPending.facility_address,  // Migration 66: Facility address

-- 5. Source of Truth Schema (current_schema/04_ai_processing.sql)
-- Updated comment on line 1846 to include Migration 66
-- Added column documentation on line 1849:
--   facility_address text,  -- Migration 66: Facility address


-- DATA FLOW VERIFICATION
-- ============================================================================

-- Complete pipeline now handles facility_address:
-- 1. AI extracts facility_address via v11 prompt
-- 2. Chunk processor parses it from AI response
-- 3. Database insert writes to pass05_pending_encounters.facility_address
-- 4. Reconciler transfers to healthcare_encounters.facility_address
-- 5. Final encounter record includes complete facility information

-- Example data flow:
-- AI Response: { "facility_name": "South Coast Medical", "facility_address": "123 Main St, Sydney NSW 2000" }
-- → Pending: facility_name='South Coast Medical', facility_address='123 Main St, Sydney NSW 2000'
-- → Final: facility_name='South Coast Medical', facility_address='123 Main St, Sydney NSW 2000'


-- MIGRATION COMPLETE
-- ============================================================================
-- Executed: 2025-11-23
-- Schema Changes: [x] Complete (user executed DDL manually)
-- Code Changes: [x] Complete (5 files updated)
-- Documentation: [x] Complete (source of truth updated)
-- Testing: [ ] Pending (awaiting next document upload test)
